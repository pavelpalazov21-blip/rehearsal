import { BaseRoom, verifyJwt } from 'deepspace/worker';
import { DomainError } from './domain/incident.ts';
import { hashInvitation, validateRoomId } from './room-state.ts';
import { scenarioSummary } from './studio/scenarios.ts';
import type { ScenarioId } from './studio/scenarios.ts';
import { StudioRepository, createNewStudioRoom, claimStudioSeat, actStudio,
  studioEvidence, studioView, postStudioMessage } from './studio/engine.ts';
import type { StudioActionInput, StudioMode, StudioRole } from './studio/engine.ts';

export interface StudioEnv { AUTH_JWT_PUBLIC_KEY:string; AUTH_JWT_ISSUER:string }
const httpStatus:Record<string,number>={FORBIDDEN:403,CONFLICT:409,INVALID_INPUT:400,INVALID_TRANSITION:422};
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
async function body(req:Request):Promise<Record<string,unknown>>{
  const declared=Number(req.headers.get('content-length')||0);if(declared>12_000)throw new DomainError('INVALID_INPUT','Body too large');
  const value=await req.text();if(value.length>12_000)throw new DomainError('INVALID_INPUT','Body too large');
  try{const parsed:unknown=JSON.parse(value);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();return parsed as Record<string,unknown>}
  catch{throw new DomainError('INVALID_INPUT','Expected a JSON object')}
}
export class RehearsalStudioRoom extends BaseRoom<StudioEnv> {
  private readonly repository:StudioRepository;
  private readonly doState:DurableObjectState;
  private readonly secrets:StudioEnv;
  constructor(state:DurableObjectState,env:StudioEnv){
    super(state,env);this.doState=state;this.secrets=env;
    this.repository=new StudioRepository({sql:state.storage.sql,transactionSync:<T>(fn:()=>T)=>state.storage.transactionSync(fn)});
  }
  protected onConnect(ws:WebSocket,user:{userId:string}):void {
    const row=[...this.doState.storage.sql.exec<{room_id:string}>('SELECT room_id FROM studio_room LIMIT 1')][0];
    const room=row?this.repository.read(row.room_id):null;
    if(!room||!room.seats.some(s=>s.userId===user.userId))ws.close(1008,'Not a member');
  }
  protected onMessage(ws:WebSocket,_user:{userId:string},message:{type:string}):void {
    // All mutation commands travel through authenticated actions, not WebSocket frames.
    if(message.type==='ping')ws.send(JSON.stringify({type:'pong'}));
  }
  private notifyMembers(version:number,kind:string){
    for(const ws of this.doState.getWebSockets()){
      try{ws.send(JSON.stringify({type:'studio.changed',version,kind}))}catch{/* reconnect fetches current snapshot */}
    }
  }
  protected async onRequest(req:Request):Promise<Response>{
    const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';
    const verified=await verifyJwt({publicKey:this.secrets.AUTH_JWT_PUBLIC_KEY,issuer:this.secrets.AUTH_JWT_ISSUER},token);
    if(!verified.result || verified.result.userId.startsWith("anon-"))return json({error:'Unauthorized'},401);
    const actor=verified.result.userId;
    try{
      const action=new URL(req.url).pathname.split('/').filter(Boolean).pop();
      if(action==='initialize'&&req.method==='POST'){
        const data=await body(req),roomId=data.roomId,mode=data.mode,scenarioId=data.scenarioId;
        validateRoomId(roomId);
        if(!['solo','team'].includes(String(mode)))throw new DomainError('INVALID_INPUT','Invalid mode');
        if(!scenarioSummary().some(item=>item.id===scenarioId))throw new DomainError('INVALID_INPUT','Unknown incident scenario');
        // One Durable Object instance must own exactly one room.
        const existing=[...this.doState.storage.sql.exec('SELECT room_id FROM studio_room LIMIT 1')];
        if(existing.length)throw new DomainError('CONFLICT','Room already initialized');
        const created=await createNewStudioRoom(roomId,actor,scenarioId as ScenarioId,mode as StudioMode,new Date().toISOString());
        this.repository.create(created.room);
        return json({ok:true,roomId,codes:mode==='team'?created.codes:null,view:studioView(created.room,actor)});
      }
      const roomId=req.headers.get('X-Rehearsal-Room');validateRoomId(roomId);
      const state=this.repository.read(roomId);
      if(!state)return json({error:'Room not found'},404);
      if(action==='join'&&req.method==='POST'){
        const data=await body(req);
        if(!['engineer','comms'].includes(String(data.role))||typeof data.code!=='string'||!/^[0-9a-f]{48}$/.test(data.code))throw new DomainError('INVALID_INPUT','Invalid invitation');
        const hash=await hashInvitation(data.code);
        const view=this.repository.update(roomId,room=>{const next=claimStudioSeat(room,actor,data.role as StudioRole,hash,Date.now());return {room:next,outcome:studioView(next,actor)}});
        this.notifyMembers(view.version,'join');
        
        return json({ok:true,data:view});
      }
      // All remaining operations below enforce membership in the authority, too.
      const view=studioView(state,actor);
      if(action==='snapshot'&&req.method==='GET')return json({ok:true,data:view});
      if(action==='evidence'&&req.method==='POST'){
        const data=await body(req);
        if(typeof data.command!=='string'||data.command.length>30)throw new DomainError('INVALID_INPUT','Invalid evidence command');
        return json({ok:true,data:studioEvidence(state,actor,data.command.trim().toLowerCase())});
      }
      if(action==='command'&&req.method==='POST'){
        const data=await body(req);
        if(typeof data.type!=='string'||typeof data.requestId!=='string'||!Number.isInteger(data.expectedVersion))throw new DomainError('INVALID_INPUT','Malformed command');
        const result=this.repository.update(roomId,room=>{
          const changed=actStudio(room,actor,data as unknown as StudioActionInput,new Date().toISOString());
          return {room:changed.room,outcome:{replayed:changed.replayed,version:changed.room.version,view:studioView(changed.room,actor)}};
        });
        if(!result.replayed)this.notifyMembers(result.version,'command');
        return json({ok:true,data:result});
      }
      if(action==='message'&&req.method==='POST'){
        const data=await body(req);
        if(typeof data.id!=='string'||typeof data.text!=='string')throw new DomainError('INVALID_INPUT','Invalid message');
        const result=this.repository.update(roomId,room=>{
          const changed=postStudioMessage(room,actor,{id:data.id as string,text:data.text as string},new Date().toISOString());
          return {room:changed.room,outcome:{replayed:changed.replayed,version:changed.room.version}};
        });
        if(!result.replayed)this.notifyMembers(result.version,'message');
        return json({ok:true,data:result});
      }
      return json({error:'Not found'},404);
    }catch(error){
      if(error instanceof DomainError)return json({error:error.message,code:error.code},httpStatus[error.code]);
      // Never expose SQL state, JWTs or secret invite hashes.
      return json({error:'Internal error'},500);
    }
  }
}
