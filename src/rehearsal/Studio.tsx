import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthToken, useAuth } from 'deepspace';
import './studio-theme.css';
import type { StudioView, StudioCommand, StudioMode, StudioRole } from './studio/engine.ts';


type CatalogItem={id:string;title:string;category:string;difficulty:string;summary:string;riskLabel:string;affectedLabel:string};
const time=(iso:string)=>{try{return new Date(iso).toLocaleTimeString()}catch{return iso}};
const ROLE:Record<StudioRole,string>={commander:'Incident commander',engineer:'Engineer',comms:'Communications'};
async function invoke<T>(method:string,payload:Record<string,unknown>):Promise<T>{
  const jwt=await getAuthToken();if(!jwt)throw new Error('Sign in before using Rehearsal');
  const response=await fetch(`/api/actions/${method}`,{method:'POST',headers:{Authorization:`Bearer ${jwt}`,'content-type':'application/json'},body:JSON.stringify(payload)});
  const json=await response.json() as {success:boolean;data?:T;error?:string};
  if(!response.ok||!json.success)throw new Error(json.error||`Request failed (${response.status})`);
  return json.data as T;
}
const canEngineer=(room:StudioView)=>room.role==='engineer'||(room.mode==='solo'&&room.role==='commander');
const canComms=(room:StudioView)=>room.role==='comms'||(room.mode==='solo'&&room.role==='commander');
function available(room:StudioView,type:StudioCommand):boolean {
  const p=room.progress,active=room.phase==='active';
  switch(type){
    case 'start':return room.role==='commander'&&room.phase==='lobby'&&room.seats.every(s=>s.filled);
    case 'inspect':return active&&canEngineer(room)&&!p.inspected;
    case 'contain':return active&&room.role==='commander'&&!p.contained&&p.recovery!=='applied';
    case 'risky':return active&&room.role==='commander'&&!p.riskyAttempted&&p.recovery==='none';
    case 'test_js':case 'test_config':return active&&canEngineer(room)&&p.inspected&&p.recovery==='none';
    case 'submit':return active&&canEngineer(room)&&p.inspected&&p.recovery==='none'&&room.js.passed&&room.config.passed;
    case 'review':return active&&room.role==='commander'&&p.recovery==='submitted'&&!room.review;
    case 'approve':return active&&room.role==='commander'&&p.recovery==='submitted'&&!!room.review;
    case 'apply':return active&&canEngineer(room)&&p.recovery==='approved';
    case 'verify':return active&&canEngineer(room)&&p.recovery==='applied'&&!p.verified;
    case 'communicate':return active&&canComms(room)&&!p.updatedCustomers;
    case 'finish':return active&&room.role==='commander'&&p.verified&&p.updatedCustomers;
  }
}
const steps=[['Inspect evidence','inspected'],['Test JavaScript','js'],['Test configuration','config'],['Review & approve','review'],['Apply recovery','apply'],['Verify metrics','verified'],['Customer update','updatedCustomers']] as const;


type IconName='grid'|'activity'|'chevron'|'arrow'|'check'|'shield'|'user'|'users'|'terminal'|'code'|'sliders'|'layers'|'clock'|'message'|'play'|'copy'|'alert'|'close'|'lock';
function Glyph({name}:{name:IconName}){
  const attrs={width:17,height:17,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
  return <svg aria-hidden="true" {...attrs}>{name==='grid'?<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>:name==='activity'?<path d="M2 12h5l3-8 4 16 3-8h5"/>:name==='chevron'?<path d="m9 18 6-6-6-6"/>:name==='arrow'?<><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>:name==='check'?<path d="m5 12 4 4L19 6"/>:name==='shield'?<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>:name==='user'?<><circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 16-5 16 0"/></>:name==='users'?<><circle cx="9" cy="8" r="3"/><path d="M3 20c0-6 12-6 12 0"/><path d="M17 5a3 3 0 0 1 0 6M17 14c2 0 4 2 4 6"/></>:name==='terminal'?<><path d="m4 7 5 5-5 5M12 18h8"/></>:name==='code'?<><path d="m8 8-4 4 4 4m8-8 4 4-4 4M14 4 10 20"/></>:name==='sliders'?<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="17" r="2" fill="currentColor" stroke="none"/></>:name==='layers'?<><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></>:name==='clock'?<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>:name==='message'?<path d="M4 4h16v13H8l-4 4V4Z"/>:name==='play'?<path d="m8 5 11 7-11 7V5Z"/>:name==='copy'?<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>:name==='alert'?<><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/></>:name==='close'?<path d="M5 5 19 19M19 5 5 19"/>:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>}</svg>;
}
function TestResults({title,results}:{title:string;results:{name:string;passed:boolean;detail:string}[]}){
  const passing=results.filter(r=>r.passed).length;
  return <div className="rh-test-panel"><div className="rh-test-title"><span>{title}</span><strong>{results.length?`${passing}/${results.length}`:'NOT RUN'}</strong></div>{results.length===0?<div className="rh-tests-empty">Run the checks to see passing and failing cases.</div>:<div className="rh-test-list">{results.map((t,i)=><div key={i} className="rh-test-case"><span className={t.passed?'rh-test-pass':'rh-test-fail'}>{t.passed?'PASS':'FAIL'}</span><div><strong>{t.name}</strong><small>{t.detail}</small></div></div>)}</div>}</div>;
}
export default function RehearsalStudioPage(){
  const {isLoaded,isSignedIn}=useAuth();
  const [catalog,setCatalog]=useState<CatalogItem[]>([]);
  const [scenarioId,setScenarioId]=useState('checkout');
  const [mode,setMode]=useState<StudioMode>('solo');
  const [roomId,setRoomId]=useState('');
  const [joinRole,setJoinRole]=useState<'engineer'|'comms'>('engineer');
  const [invite,setInvite]=useState('');
  const [codes,setCodes]=useState<{engineer:string;comms:string}|null>(null);
  const [room,setRoom]=useState<StudioView|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('Ready');
  const [workspace,setWorkspace]=useState<'evidence'|'code'|'config'|'review'|'timeline'>('evidence');
  const [jsDraft,setJsDraft]=useState('');
  const [configDraft,setConfigDraft]=useState('');
  const [jsDirty,setJsDirty]=useState(false);
  const [configDirty,setConfigDirty]=useState(false);
  const [consoleCommand,setConsoleCommand]=useState('');
  const [consoleItems,setConsoleItems]=useState<{command:string;lines:string[]}[]>([]);
  const [reviewNotes,setReviewNotes]=useState('');
  const [chat,setChat]=useState('');
  const [coach,setCoach]=useState<{label:string;text:string}|null>(null);
  const outgoingMessage=useRef<{text:string;room:string;id:string}|null>(null);
  const [pendingCommand,setPendingCommand]=useState<StudioCommand|null>(null);
  const currentRoomId=useRef('');
  const latest=useRef<StudioView|null>(null);
  const jsDirtyRef=useRef(false);
  const configDirtyRef=useRef(false);
  currentRoomId.current=roomId;latest.current=room;
  // The browser receives public summaries only. Hidden test inputs never enter the client bundle.
  useEffect(()=>{if(isSignedIn)void invoke<CatalogItem[]>('studioScenarios',{}).then(setCatalog).catch(()=>setError('Could not load scenario library'))},[isSignedIn]);
  const sync=useCallback(async()=>{
    const id=currentRoomId.current;
    if(!id)return;
    try{
      const next=await invoke<StudioView>('studioSnapshot',{roomId:id});
      if (currentRoomId.current !== id || (latest.current?.version ?? -1) > next.version) return;
      latest.current=next;setRoom(next);setStatus('Synchronized');
      // Only overwrite local draft when not actively editing it.
      setJsDraft(old=>jsDirtyRef.current?old:(next.js.source??old));
      setConfigDraft(old=>configDirtyRef.current?old:(next.config.source??old));
    }catch(e){setStatus('Reconnecting');setError(e instanceof Error?e.message:'Unable to synchronize')}
  },[]);
  useEffect(()=>{
    if(!isLoaded||!isSignedIn||room)return;
    const remembered=sessionStorage.getItem('rehearsal.studioRoom');if(!remembered)return;
    let cancelled=false;
    void invoke<StudioView>('studioSnapshot',{roomId:remembered}).then(data=>{if(cancelled)return;
      const stored=sessionStorage.getItem('rehearsal.invites.'+remembered);
      if(data.role==='commander' && data.phase==='lobby' && stored) setCodes(JSON.parse(stored));
      setRoomId(remembered);setRoom(data);setJsDraft(data.js.source||'');setConfigDraft(data.config.source||'');setStatus('Room restored')}).catch(()=>{if(!cancelled)sessionStorage.removeItem('rehearsal.studioRoom')});
    return()=>{cancelled=true};
  },[isLoaded,isSignedIn,Boolean(room)]);
  useEffect(()=>{
    if (!room || !roomId) return;
    let stopped = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    async function connect() {
      try {
        const token = await getAuthToken();
        if (stopped) return;
        if (!token) throw new Error('Sign in required');
        const url = new URL('/ws/studio/' + roomId, location.origin);
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('token', token);
        socket = new WebSocket(url);
        socket.onopen = () => { if (!stopped) void sync() };
        socket.onmessage = (event) => { if (!stopped && event.data.includes('studio.changed')) void sync() };
        socket.onclose = reconnect;
      } catch { reconnect() }
    }
    function reconnect() {
      if (!stopped) { setStatus('Reconnecting'); retry = setTimeout(connect, 1500) }
    }
    void connect();
    const refresh = () => { void sync() };
    window.addEventListener('online', refresh);
    const timer = setInterval(refresh, 15000);
    return () => { stopped = true; clearTimeout(retry); clearInterval(timer); socket?.close(); window.removeEventListener('online', refresh) };
  },[roomId, Boolean(room), sync]);
  async function run<T>(operation:()=>Promise<T>,success:(value:T)=>void){
    setBusy(true);setError('');
    try{success(await operation())}catch(e){const message=e instanceof Error?e.message:'An unexpected error occurred';
      if(message.includes('Version conflict')){await sync();setError('A teammate changed this room first. We synchronized the latest version; review it before trying again.')}
      else setError(message)}
    finally{setBusy(false)}
  }
  function receive(next:StudioView){setRoom(next);setRoomId(next.roomId);currentRoomId.current=next.roomId;sessionStorage.setItem('rehearsal.studioRoom',next.roomId);setJsDraft(next.js.source||'');setConfigDraft(next.config.source||'');setJsDirty(false);setConfigDirty(false);jsDirtyRef.current=false;configDirtyRef.current=false}
  async function create(){
    await run(()=>invoke<{ok:boolean;roomId:string;codes:null|{engineer:string;comms:string};view:StudioView}>('studioCreate',{scenarioId,mode}),value=>{
      receive(value.view);setCoach(null);setCodes(value.codes);if(value.codes) sessionStorage.setItem('rehearsal.invites.'+value.roomId,JSON.stringify(value.codes));setStatus(mode==='solo'?'Solo exercise ready':'Send the private invitations');
    });
  }
  async function join(){
    await run(()=>invoke<StudioView>('studioJoin',{roomId:roomId.trim(),role:joinRole,code:invite.trim()}),data=>{
      receive(data);setCoach(null);setInvite('');setStatus('Joined team room');
    });
  }
  async function command(type:StudioCommand,extra:Record<string,unknown>={}){
    const current=latest.current;if(!current)return;
    setPendingCommand(type);
    await run(()=>invoke<{replayed:boolean;version:number;view:StudioView}>('studioCommand',{
      roomId:current.roomId,type,expectedVersion:current.version,requestId:crypto.randomUUID(),...extra,
    }),result=>{
      if (currentRoomId.current !== result.view.roomId) return;
      if ((latest.current?.version ?? -1) <= result.version) { latest.current=result.view; setRoom(result.view) }
      if (type==='test_js' && extra.source===jsDraft) { jsDirtyRef.current=false;setJsDirty(false) }
      if (type==='test_config' && extra.source===configDraft) { configDirtyRef.current=false;setConfigDirty(false) }
      setStatus(type==='test_js'?'JavaScript tests completed':type==='test_config'?'Configuration checked':type==='review'?'Review recorded':'Decision committed');
      if(type==='start'){setWorkspace('evidence');setCodes(null);sessionStorage.removeItem('rehearsal.invites.'+current.roomId)}
      if(type==='inspect')setWorkspace('code');
      if(type==='submit')setWorkspace('review');
    });
    setPendingCommand(null);
  }
  async function consoleRun(commandName:string){
    if(!room)return;
    const commandText=commandName.trim().toLowerCase();if(!commandText)return;
    setConsoleCommand('');
    await run(()=>invoke<{command:string;lines:string[];simulated:boolean}>('studioEvidence',{roomId:room.roomId,command:commandText}),result=>{
      setConsoleItems(old=>[...old,{command:commandText,lines:result.lines}].slice(-16));
    });
  }
  async function postMessage(){
    if(!room||!chat.trim())return;
    const outgoing=chat.trim();
    if (outgoingMessage.current?.text!==outgoing || outgoingMessage.current?.room!==room.roomId) {
      outgoingMessage.current={text:outgoing, room:room.roomId, id:crypto.randomUUID()};
    }
    const id=outgoingMessage.current.id;
    await run(()=>invoke('studioMessage',{roomId:room.roomId,id,text:outgoing}),()=>{outgoingMessage.current=null;setChat('');void sync()});
  }
  const actions=room?[{
    type:'start' as StudioCommand,label:'Start incident',description:'Begin the response with your team'},
    {type:'inspect' as StudioCommand,label:'Investigate diagnostics',description:'Unlock the cause and repair workspace'},
    {type:'contain' as StudioCommand,label:'Contain the damage',description:'Reduce immediate impact while investigating'},
    {type:'risky' as StudioCommand,label:'Take the risky shortcut',description:'See what happens if you act without evidence'},
    {type:'submit' as StudioCommand,label:'Submit both repairs',description:'Both test suites must be green'},
    {type:'approve' as StudioCommand,label:'Authorize reviewed patch',description:'Approval requires a written code review'},
    {type:'apply' as StudioCommand,label:'Apply approved patch',description:'Simulated restoration, never production'},
    {type:'verify' as StudioCommand,label:'Verify recovery',description:'Run simulated post-fix checks'},
    {type:'communicate' as StudioCommand,label:'Publish customer update',description:'Communicate factual status to affected users'},
    {type:'finish' as StudioCommand,label:'Complete and debrief',description:'Get a reproducible outcome score'},
  ].filter(a=>available(room,a.type)):[];
  if(!isLoaded)return <div className="rh-app rh-interstitial"><span className="rh-loader"/> Establishing secure session…</div>;
  if(!isSignedIn)return <div className="rh-app rh-interstitial"><div className="rh-brand-mark">R<span>.</span></div><h1>Enter the studio.</h1><p>Sign in with your DeepSpace account to join or create an incident.</p></div>;
  const selectedScenario=catalog.find(x=>x.id===scenarioId);
  const progressCount=room?[
    room.progress.inspected,room.js.passed,room.config.passed,!!room.review,
    room.progress.recovery==='applied',room.progress.verified,room.progress.updatedCustomers,
  ].filter(Boolean).length:0;
  const progressPercent=room?Math.round(progressCount/7*100):0;
  const studioTabs=[
    {id:'evidence' as const,label:'Evidence',icon:'terminal' as const},
    {id:'code' as const,label:'Code editor',icon:'code' as const},
    {id:'config' as const,label:'Guardrails',icon:'sliders' as const},
    {id:'review' as const,label:'Code review',icon:'layers' as const},
    {id:'timeline' as const,label:'Timeline',icon:'clock' as const},
  ];
  return <div className="rh-app" data-testid="studio-stage10">
    <aside className="rh-rail" aria-label="Rehearsal navigation">
      <div className="rh-rail-brand"><div className="rh-brand-mark">R<span>.</span></div><div><strong>rehearsal</strong><small>INCIDENT STUDIO</small></div></div>
      <div className="rh-rail-section">WORKSPACE</div>
      <button className={`rh-rail-link ${!room?'is-active':''}`} onClick={()=>{if(room){sessionStorage.removeItem('rehearsal.studioRoom');setRoom(null);setRoomId('');setCodes(null);setConsoleItems([]);setStatus('Ready')}}} type="button"><Glyph name="grid"/> Scenario library <span className="rh-rail-kbd">01</span></button>
      <button className={`rh-rail-link ${room?'is-active':''}`} type="button" disabled={!room} onClick={()=>setWorkspace('evidence')}><Glyph name="activity"/> Active incident <span className="rh-rail-kbd">02</span></button>
      <div className="rh-rail-separator"/>
      <div className="rh-rail-section">TRAINING PROTOCOL</div>
      <div className="rh-rail-readout"><span className="rh-pulse"/> Deterministic simulation</div>
      <div className="rh-rail-note">Source changes are tested in an isolated, restricted interpreter. No live infrastructure is modified.</div>
      <a className="rh-rail-link rh-source-link" href="/rehearsal-source/" target="_blank" rel="noopener noreferrer"><Glyph name="code"/> Read the source &amp; tests <Glyph name="arrow"/></a>
      <div className="rh-rail-bottom"><div className="rh-rail-platform">BUILT FOR DEEPSPACE</div><div className="rh-rail-bottom-line"><span className="rh-rail-indicator"/> {status}</div></div>
    </aside>
    <div className="rh-content-frame">
      <header className="rh-topbar"><div className="rh-crumb"><span>Workspace</span><Glyph name="chevron"/><strong>{room?'Incident room':'Scenario library'}</strong></div>
        <div className="rh-top-actions"><span className="rh-safe"><Glyph name="shield"/> Simulated environment</span><span className="rh-sync"><span className="rh-pulse"/>{status}</span>{room&&<button type="button" className="rh-top-exit" onClick={()=>{sessionStorage.removeItem('rehearsal.studioRoom');setRoom(null);setCodes(null);setRoomId('');setConsoleItems([]);setStatus('Ready')}}>Exit room <Glyph name="arrow"/></button>}</div>
      </header>
      <main className="rh-main">
        {error&&<div className="rh-error" role="alert"><Glyph name="alert"/> <span>{error}</span><button type="button" aria-label="Dismiss error" onClick={()=>setError('')}><Glyph name="close"/></button></div>}
        {!room? <>
          <section className="rh-intro"><div className="rh-kicker"><span className="rh-kicker-line"/> THE TRAINING GROUND FOR ENGINEERS</div>
            <div className="rh-intro-grid"><div><h1>When things break,<br/><em>know what to do.</em></h1><p>Investigate real failure patterns, write the repair, and prove it works. Seven incidents. Your decisions determine the outcome.</p>
              <div className="rh-intro-trust"><span><Glyph name="check"/> Write actual JavaScript</span><span><Glyph name="check"/> Test your fixes</span><span><Glyph name="check"/> Recover as a team</span></div></div>
              <div className="rh-intro-visual" aria-label="Example incident monitoring display"><div className="rh-demo-header"><span className="rh-demo-live"><span className="rh-blink"/> INCIDENT 004</span><span>RESPONSE MONITOR</span></div><div className="rh-demo-number">47<span>%</span></div><div className="rh-demo-caption">FAILED TRANSACTIONS <span>HIGH RISK</span></div><div className="rh-demo-spark"><svg viewBox="0 0 320 72" preserveAspectRatio="none" aria-hidden="true"><path className="rh-plot-grid" d="M0 18H320 M0 36H320 M0 54H320"/><polyline points="0,59 30,57 56,59 82,52 104,54 123,49 151,47 176,43 199,31 220,36 242,21 268,15 291,24 320,10"/></svg></div><div className="rh-demo-log"><span>09:41:08</span> ERROR checkout-worker / acquire timeout</div><div className="rh-demo-log"><span>09:41:09</span> WARN payment-api / retry detected</div></div></div>
          </section>
          <section className="rh-onboarding" aria-label="How the simulator works"><div><strong>01 / Investigate</strong><span>Read the fictional errors and find the cause.</span></div><div><strong>02 / Repair</strong><span>Edit the broken JavaScript and safety settings yourself.</span></div><div><strong>03 / Prove it</strong><span>Run tests, review the patch, and verify recovery.</span></div><div><strong>04 / Collaborate</strong><span>Work solo or share roles with two teammates.</span></div></section>
          <div className="rh-library-heading"><div><div className="rh-overline">01 / CHOOSE YOUR EXERCISE</div><h2>Incident library<span className="rh-heading-count">07</span></h2></div><div className="rh-library-hint">SELECT AN INCIDENT TO BEGIN <Glyph name="arrow"/></div></div>
          <div className="rh-lobby-grid"><section className="rh-scenario-list" aria-label="Scenario library">
            {catalog.length===0&&<div className="rh-loading">Loading incident library…</div>}
            {catalog.map((s,index)=><button type="button" key={s.id} data-testid={'scenario-'+s.id} aria-pressed={scenarioId===s.id} className={`rh-scenario-row ${scenarioId===s.id?'is-selected':''}`} onClick={()=>setScenarioId(s.id)}>
              <span className="rh-scenario-index">{String(index+1).padStart(2,'0')}</span><span className="rh-scenario-info"><strong>{s.title}</strong><span>{s.summary}</span></span><span className="rh-scenario-tags"><span>{s.category}</span><small>{s.difficulty}</small></span><span className="rh-scenario-arrow"><Glyph name="arrow"/></span></button>)}
          </section><div className="rh-start-column"><section className="rh-start-card"><div className="rh-overline">02 / START SESSION</div><h3>Make the call.</h3><p>{selectedScenario?.title||'Choose an incident'} <span>—</span> {selectedScenario?.difficulty||'Scenario'} difficulty</p>
            <div className="rh-mode-toggle" role="group" aria-label="Exercise mode"><button type="button" className={mode==='solo'?'is-selected':''} aria-pressed={mode==='solo'} onClick={()=>setMode('solo')}><Glyph name="user"/> Solo</button><button type="button" className={mode==='team'?'is-selected':''} aria-pressed={mode==='team'} onClick={()=>setMode('team')}><Glyph name="users"/> Team</button></div>
            <div className="rh-mode-description">{mode==='solo'?'Handle all three roles yourself. The drill supplies scripted teammate updates.':'Invite two people to collaborate, with independent roles and permissions.'}</div>
            <button type="button" className="rh-primary rh-start-btn" data-testid="studio-create" disabled={busy||!selectedScenario} onClick={()=>void create()}>Start {mode==='solo'?'solo drill':'team room'} <Glyph name="arrow"/></button><div className="rh-start-footnote"><Glyph name="shield"/> No real systems will be changed</div>
          </section><section className="rh-join-card"><div className="rh-overline">ALREADY INVITED?</div><h3>Join a room</h3>
            <label>Room identifier<input aria-label="Studio room ID" placeholder="rh-..." className="rh-field" value={roomId} onChange={e=>setRoomId(e.target.value)}/></label>
            <label>Assigned role<select aria-label="Studio assigned role" className="rh-field" value={joinRole} onChange={e=>setJoinRole(e.target.value as 'engineer'|'comms')}><option value="engineer">Engineer</option><option value="comms">Communications lead</option></select></label>
            <label>Private invitation<input aria-label="Studio invitation code" placeholder="Invitation code" autoComplete="off" className="rh-field" value={invite} onChange={e=>setInvite(e.target.value)}/></label>
            <button type="button" className="rh-secondary rh-join-btn" data-testid="studio-join" disabled={busy||invite.trim().length!==48||!roomId.trim()} onClick={()=>void join()}>Join incident <Glyph name="arrow"/></button>
          </section></div></div>
        </>:<>
          <div className="rh-case-header"><div><div className="rh-overline">LIVE EXERCISE <span className="rh-overline-divider">/</span> {room.scenario.category.toUpperCase()} <span className="rh-overline-divider">/</span> {room.scenario.difficulty.toUpperCase()}</div><h1 data-testid="studio-scenario">{room.scenario.title}</h1><div className="rh-case-meta"><span className="rh-mono" data-testid="studio-room">{room.roomId}</span><span className="rh-case-sep"/><span>{ROLE[room.role]}</span><span className="rh-case-sep"/><span>{room.mode==='solo'?'Solo practice':'Team incident'}</span></div></div><div className="rh-case-badges"><span data-testid="studio-phase" className={`rh-phase rh-phase-${room.phase}`}>{room.phase}</span><span className="rh-live-count"><Glyph name="users"/> {room.joined} / {room.mode==='solo'?'1':'3'} joined</span></div></div>
          {codes&&room.phase==='lobby'&&room.mode==='team'&&<section className="rh-invites" aria-label="Team invitations"><div><div className="rh-overline">PRIVATE INVITATIONS</div><p>Share each role's invite with a different signed-in teammate.</p></div>{(['engineer','comms'] as const).map(r=><div className="rh-invite" key={r}><span>{ROLE[r]}</span><code data-testid={'studio-invite-'+r}>{codes[r]}</code><button type="button" onClick={()=>void navigator.clipboard.writeText(`${room.roomId}\n${r}: ${codes[r]}`)}>Copy <Glyph name="copy"/></button></div>)}</section>}
          <section className="rh-metrics" aria-label="Incident impact">
            <div className="rh-metric rh-metric-critical"><span>{room.scenario.riskLabel}</span><strong>{room.metrics.risk}<small>%</small></strong><div className="rh-metric-bar"><span style={{width:`${Math.max(0,Math.min(room.metrics.risk,100))}%`}}/></div></div>
            <div className="rh-metric"><span>{room.scenario.affectedLabel}</span><strong>{room.metrics.affected.toLocaleString()}</strong><small>Records / people impacted</small></div>
            <div className="rh-metric"><span>Customer trust</span><strong>{room.metrics.trust}<small>/100</small></strong><div className="rh-metric-bar rh-metric-neutral"><span style={{width:`${Math.max(0,Math.min(room.metrics.trust,100))}%`}}/></div></div>
            <div className="rh-metric"><span>Simulated time</span><strong>{room.metrics.elapsedMinutes}<small> min</small></strong><small>Elapsed exercise duration</small></div>
          </section>
          <section className="rh-progress-bar"><div className="rh-progress-top"><div><span className="rh-overline">RESPONSE PROGRESS</span><strong>{progressCount} of 7 checkpoints</strong></div><span className="rh-mono">{progressPercent}% COMPLETE</span></div><div className="rh-progress-track"><span style={{width:`${progressPercent}%`}}/></div><div className="rh-progress-steps">{steps.map(([label,key])=>{const done=key==='js'?room.js.passed:key==='config'?room.config.passed:key==='review'?!!room.review:key==='apply'?room.progress.recovery==='applied':room.progress[key];return <span key={key} className={done?'is-complete':''}>{done?<Glyph name="check"/>:<i/>}{label}</span>})}</div></section>
          <div className="rh-workbench"><div className="rh-work-main"><nav className="rh-work-tabs" aria-label="Studio sections">{studioTabs.map(tab=><button type="button" key={tab.id} className={workspace===tab.id?'is-active':''} aria-pressed={workspace===tab.id} onClick={()=>setWorkspace(tab.id)}><Glyph name={tab.icon}/>{tab.label}{tab.id==='code'&&room.js.passed&&<span className="rh-tab-success"/>}{tab.id==='config'&&room.config.passed&&<span className="rh-tab-success"/>}</button>)}</nav>
            {workspace==='evidence'&&<section className="rh-work-panel"><div className="rh-panel-head"><div><div className="rh-overline">EVIDENCE / 01</div><h2>Incident diagnostics</h2><p>Examine logs, traces and deployment history. Evidence is role-restricted.</p></div><span className="rh-panel-chip"><Glyph name="terminal"/> Terminal</span></div>
              <div className="rh-console-controls">{['status','logs','trace','deploys','customers','runbook'].filter(x=>canEngineer(room)||!['logs','trace','deploys'].includes(x)).map(x=><button type="button" key={x} onClick={()=>void consoleRun(x)}>{x}</button>)}</div>
              <div className="rh-console" data-testid="studio-console-output" aria-live="polite"><div className="rh-console-line"><span>rehearsal@incident</span> — read-only evidence terminal</div>{consoleItems.length===0?<div className="rh-console-empty">$ Try <b>status</b>, <b>logs</b>, or <b>runbook</b> to begin.</div>:consoleItems.map((item,i)=><div className="rh-console-entry" key={i}><div><span>$</span> {item.command}</div><pre>{item.lines.join('\n')}</pre></div>)}</div>
              <form className="rh-terminal-input" onSubmit={e=>{e.preventDefault();void consoleRun(consoleCommand)}}><span>$</span><input data-testid="studio-console-input" aria-label="Studio command" placeholder="Enter a command..." value={consoleCommand} onChange={e=>setConsoleCommand(e.target.value)}/><button type="submit" disabled={busy}>Run <Glyph name="arrow"/></button></form></section>}
            {workspace==='code'&&<section className="rh-work-panel"><div className="rh-panel-head"><div><div className="rh-overline">REPAIR / JAVASCRIPT</div><h2>Fix the function.</h2><p>{room.js.task||'Repair access is restricted until engineering review.'}</p></div><span className={`rh-panel-chip ${room.js.passed?'is-passing':''}`}><Glyph name="code"/>{room.js.passed?'Tests passing':'JavaScript'}</span></div>
              {room.js.source!==undefined?<><div className="rh-editor-head"><span className="rh-editor-dot"/><code>{room.js.filename}</code><span>JS</span></div><div className="rh-code-surface"><div className="rh-line-numbers" aria-hidden="true">{jsDraft.split('\n').map((_,i)=><span key={i}>{i+1}</span>)}</div><textarea spellCheck={false} data-testid="studio-code-editor" aria-label="JavaScript repair source" value={jsDraft} onChange={e=>{setJsDraft(e.target.value);setJsDirty(true);jsDirtyRef.current=true}} readOnly={busy||!available(room,'test_js')}/></div>
                <div className="rh-editor-toolbar"><p>{jsDirty?'Unsaved edit — run tests to validate.':'Use the safe JavaScript subset: return, if, const, comparisons and includes().'}</p><button type="button" className="rh-primary" data-testid="studio-run-js" disabled={busy||!available(room,'test_js')} onClick={()=>void command('test_js',{source:jsDraft})}><Glyph name="play"/> Run 8 tests</button></div>
                <TestResults title="JavaScript test suite" results={room.js.results}/></>:<div className="rh-locked"><Glyph name="lock"/><h3>Engineering access only</h3><p>The repair becomes available to the commander during review.</p></div>}</section>}
            {workspace==='config'&&<section className="rh-work-panel"><div className="rh-panel-head"><div><div className="rh-overline">REPAIR / CONFIGURATION</div><h2>Set the guardrails.</h2><p>Repair the unsafe configuration. All six checks must pass.</p></div><span className={`rh-panel-chip ${room.config.passed?'is-passing':''}`}><Glyph name="sliders"/>{room.config.passed?'Checks passing':'JSON config'}</span></div>
              {room.config.source!==undefined?<><div className="rh-editor-head"><span className="rh-editor-dot"/><code>{room.config.filename}</code><span>JSON</span></div><div className="rh-code-surface"><div className="rh-line-numbers" aria-hidden="true">{configDraft.split('\n').map((_,i)=><span key={i}>{i+1}</span>)}</div><textarea spellCheck={false} data-testid="studio-config-editor" aria-label="Configuration repair source" value={configDraft} onChange={e=>{setConfigDraft(e.target.value);setConfigDirty(true);configDirtyRef.current=true}} readOnly={busy||!available(room,'test_config')}/></div>
                <div className="rh-editor-toolbar"><p>{configDirty?'Unsaved edit — rerun checks.':'Schema and scenario rules are verified on the server.'}</p><button type="button" className="rh-primary" data-testid="studio-run-config" disabled={busy||!available(room,'test_config')} onClick={()=>void command('test_config',{source:configDraft})}><Glyph name="play"/> Run 6 checks</button></div>
                <TestResults title="Configuration checks" results={room.config.results}/></>:<div className="rh-locked"><Glyph name="lock"/><h3>Configuration restricted</h3><p>The file is visible to engineering until review opens.</p></div>}</section>}
            {workspace==='review'&&<section className="rh-work-panel"><div className="rh-panel-head"><div><div className="rh-overline">AUTHORIZE / CODE REVIEW</div><h2>Review before release.</h2><p>Review the submitted files and document the authorization decision.</p></div><span className="rh-panel-chip"><Glyph name="shield"/> RBAC enforced</span></div>
              {room.reviewPacket?<><div className="rh-review-tests"><span><Glyph name="check"/> {room.reviewPacket.jsPassed}/8 JavaScript tests</span><span><Glyph name="check"/> {room.reviewPacket.configPassed}/6 configuration checks</span></div><div className="rh-diff-grid">{[['JavaScript / Original',room.reviewPacket.jsBefore],['JavaScript / Proposed',room.reviewPacket.jsAfter],['Config / Original',room.reviewPacket.configBefore],['Config / Proposed',room.reviewPacket.configAfter]].map(([name,value],i)=><div className="rh-diff-box" key={name}><div className={i%2===0?'rh-diff-old':'rh-diff-new'}>{name}</div><pre>{value}</pre></div>)}</div>{!room.review?<><label className="rh-review-label">Review rationale<textarea data-testid="studio-review-notes" className="rh-review-textarea" maxLength={500} value={reviewNotes} onChange={e=>setReviewNotes(e.target.value)} placeholder="Explain what was fixed, why it is safe, and which tests support approval."/></label><button type="button" className="rh-primary rh-review-submit" data-testid="studio-review" disabled={busy||reviewNotes.trim().length<20} onClick={()=>void command('review',{notes:reviewNotes})}>Record code review <Glyph name="arrow"/></button></>:<div className="rh-review-complete"><Glyph name="check"/><span>Review recorded: {room.review.notes}</span></div>}</>:<div className="rh-locked"><Glyph name="lock"/><h3>Waiting for tested repairs</h3><p>The commander can review both files once engineering submits passing changes.</p></div>}</section>}
            {workspace==='timeline'&&<section className="rh-work-panel"><div className="rh-panel-head"><div><div className="rh-overline">AUDIT / INCIDENT TIMELINE</div><h2>Every decision, recorded.</h2><p>An immutable-looking view of the server's authoritative event history.</p></div><span className="rh-panel-chip"><Glyph name="clock"/> Version {room.version}</span></div><div className="rh-event-list">{room.events.length===0?<p className="rh-empty">No events yet. Start the incident to begin the audit trail.</p>:room.events.slice().reverse().map((ev,i)=><div className="rh-event" key={i}><span className="rh-event-node"/><div><p>{ev.text}</p><small>{ev.by} <span>·</span> {time(ev.at)} <span>·</span> v{ev.version}</small></div></div>)}</div></section>}
            {room.debrief&&<section className="rh-debrief"><div className="rh-overline">EXERCISE COMPLETE</div><div className="rh-debrief-score">{room.debrief.score}<small>/100</small></div><h2>Incident resolved. Here's what you learned.</h2><p>{room.debrief.lesson}</p><p><strong>Recovery check</strong> {room.debrief.verification}</p><div className="rh-debrief-meta">{room.debrief.events} audit events <span>·</span> {room.debrief.risks} risky interventions <span>·</span> simulated recovery</div></section>}
          </div><aside className="rh-work-aside">
            <section className="rh-aside-panel"><div className="rh-aside-heading"><span className="rh-overline">YOUR NEXT MOVE</span><span className="rh-work-counter">{String(actions.length).padStart(2,'0')}</span></div><h3>Make a decision.</h3><p>Actions are validated by the incident engine and recorded for your team.</p><div className="rh-action-list">{actions.length===0?<div className="rh-aside-empty">No actions available. Check the progress tracker or wait for another role.</div>:actions.map((a,i)=><button type="button" key={a.type} data-testid={'studio-action-'+a.type} disabled={busy||(a.type==='submit'&&(jsDirty||configDirty))} onClick={()=>{if(['test_js','test_config','review'].includes(a.type))setWorkspace(a.type==='test_js'?'code':a.type==='test_config'?'config':'review');else void command(a.type)}}><span className="rh-action-index">{String(i+1).padStart(2,'0')}</span><span><strong>{a.label}</strong><small>{a.description}</small></span><Glyph name="arrow"/></button>)}</div>{(jsDirty||configDirty)&&<div className="rh-unsaved"><Glyph name="alert"/> Unsaved changes. Rerun the corresponding test suite before submitting.</div>}</section>
            <section className="rh-aside-panel rh-coach"><h3>Incident coach</h3>
              <button type="button" disabled={busy} onClick={()=>void run(()=>invoke<{label:string;text:string}>('studioCoach',{roomId:room.roomId}),setCoach)}>Get a hint</button>
              {coach&&<p role="status"><strong>{coach.label}</strong><br/>{coach.text}</p>}</section>
            <section className="rh-aside-panel rh-team-panel"><div className="rh-aside-heading"><span className="rh-overline">RESPONSE CREW</span><span className="rh-work-counter">03</span></div><div className="rh-seat-list">{room.seats.map(s=><div key={s.role}><span className="rh-seat-avatar">{s.role==='commander'?'IC':s.role==='engineer'?'EN':'CM'}</span><span><strong>{ROLE[s.role]}</strong><small>{s.virtual?'Simulated teammate':s.filled?'Seat claimed':'Awaiting invitation'}</small></span><i className={s.filled||s.virtual?'is-online':''}/></div>)}</div></section>
            <section className="rh-aside-panel rh-chat-panel"><div className="rh-aside-heading"><span className="rh-overline">TEAM CHANNEL</span><Glyph name="message"/></div><div className="rh-chat-log" aria-live="polite">{room.messages.length===0?<div className="rh-chat-empty">No messages yet.<br/>Use this channel to coordinate.</div>:room.messages.map(m=><div className="rh-chat-msg" key={m.id}><div>{ROLE[m.role]} <span>{time(m.at)}</span></div><p>{m.text}</p></div>)}</div><form className="rh-chat-send" onSubmit={e=>{e.preventDefault();void postMessage()}}><input aria-label="Studio team message" maxLength={600} placeholder="Message the team..." value={chat} onChange={e=>setChat(e.target.value)}/><button type="submit" aria-label="Send team message" disabled={busy||!chat.trim()}><Glyph name="arrow"/></button></form></section>
          </aside></div>
        </>}
        <footer className="rh-footer"><span>REHEARSAL / CONTROLLED INCIDENT TRAINING</span><span>Built for the DeepSpace runtime <span className="rh-footer-sep">·</span> No production systems affected</span></footer>
      </main>
    </div>
  </div>;
}
