/**
 * Stage 15 native acceptance tests — MUST run in the ORIGINAL authenticated
 * DeepSpace checkout against a real SDK worker, not a mock or the Railway demo.
 * The selectors below match the current Stage 14 React page exactly.
 */
import { test, expect } from './support/users';

const PATH = '/rehearsal-studio';
const validJs = `function approvePriceChange(change) {
  return change.approved === true && change.source === 'verified'
    && change.percentChange >= -10 && change.percentChange <= 10;
}`;
const validConfig = JSON.stringify({
  agentWritesEnabled:false, requiresHumanApproval:true,
  maxPriceChangePercent:5, restoreFromSnapshot:'last-approved',
  auditAgentEdits:true,
}, null, 2);

// Do not log or snapshot bearer tokens; authenticated request checks return
// only the response status and trusted, sanitized JSON error/output.
async function browserAction(page: import('@playwright/test').Page, action: string, params: Record<string,unknown>) {
  return page.evaluate(async ({action,params}) => {
    const tokenResult = await fetch('/api/auth/token',{method:'POST',credentials:'include'});
    if (!tokenResult.ok) throw new Error('Test session token unavailable');
    const token = (await tokenResult.json() as {token?:string}).token;
    if (!token) throw new Error('Test session token missing');
    const response = await fetch(`/api/actions/${action}`,{
      method:'POST', headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify(params),
    });
    const payload = await response.json() as {success?:boolean;error?:string;data?:Record<string,unknown>};
    return {status:response.status,success:payload.success,error:payload.error||'',data:payload.data||{}};
  },{action,params});
}

test('seven distinct incident scenarios are presented to a real signed-in user', async ({users})=>{
  const [host]=await users(1);
  await host.page.goto(PATH);
  for(const id of ['checkout','surge','security','ai-agent','duplicates','database','notification'])
    await expect(host.page.getByTestId('scenario-'+id)).toBeVisible();
  await expect(host.page.getByText('When things break,')).toBeVisible();
});

test('three signed-in users collaborate, preserve private evidence and verify recovery', async ({users})=>{
  const [commander,engineer,communications]=await users(3);
  await Promise.all([commander.page.goto(PATH), engineer.page.goto(PATH), communications.page.goto(PATH)]);
  await commander.page.getByTestId('scenario-ai-agent').click();
  await commander.page.getByRole('button',{name:'Team',exact:true}).click();
  await commander.page.getByTestId('studio-create').click();
  const roomId=(await commander.page.getByTestId('studio-room').innerText()).trim();
  const engineerCode=(await commander.page.getByTestId('studio-invite-engineer').innerText()).trim();
  const commsCode=(await commander.page.getByTestId('studio-invite-comms').innerText()).trim();
  expect(roomId).toMatch(/^rh-[a-f0-9]{32}$/);
  expect(engineerCode).toMatch(/^[a-f0-9]{48}$/);
  expect(commsCode).toMatch(/^[a-f0-9]{48}$/);

  await engineer.page.getByLabel('Studio room ID').fill(roomId);
  await engineer.page.getByLabel('Studio invitation code').fill(engineerCode);
  await engineer.page.getByTestId('studio-join').click();
  await communications.page.getByLabel('Studio room ID').fill(roomId);
  await communications.page.getByLabel('Studio assigned role').selectOption('comms');
  await communications.page.getByLabel('Studio invitation code').fill(commsCode);
  await communications.page.getByTestId('studio-join').click();
  await expect(commander.page.getByTestId('studio-action-start')).toBeEnabled({timeout:15_000});
  await commander.page.getByTestId('studio-action-start').click();
  await expect(engineer.page.getByTestId('studio-phase')).toHaveText('active',{timeout:15_000});
  await expect(communications.page.getByTestId('studio-phase')).toHaveText('active',{timeout:15_000});

  // A real forbidden server-side action, not merely a hidden button.
  const forbidden=await browserAction(communications.page,'studioEvidence',{roomId,command:'logs'});
  expect(forbidden.success).toBe(false);
  expect(forbidden.error).toMatch(/private|engineer|forbidden/i);
  await expect(communications.page.getByRole('button',{name:'logs',exact:true})).toHaveCount(0);
  await engineer.page.getByRole('button',{name:'logs',exact:true}).click();
  await expect(engineer.page.getByTestId('studio-console-output')).toContainText('agent updates');
  await engineer.page.getByTestId('studio-action-inspect').click();
  await engineer.page.getByRole('button',{name:'Code editor'}).click();
  await engineer.page.getByTestId('studio-code-editor').fill(validJs);
  await engineer.page.getByTestId('studio-run-js').click();
  await expect(engineer.page.getByText('8/8', {exact:true})).toBeVisible();
  await engineer.page.getByRole('button',{name:'Guardrails'}).click();
  await engineer.page.getByTestId('studio-config-editor').fill(validConfig);
  await engineer.page.getByTestId('studio-run-config').click();
  await expect(engineer.page.getByText('6/6', {exact:true})).toBeVisible();
  await engineer.page.getByTestId('studio-action-submit').click();

  // Hidden until an explicit, written review is recorded.
  await expect(commander.page.getByTestId('studio-action-approve')).toHaveCount(0);
  await commander.page.getByRole('button',{name:'Code review'}).click();
  await expect(commander.page.getByText('JavaScript / Original')).toBeVisible();
  await expect(commander.page.getByText('Config / Proposed')).toBeVisible();
  await commander.page.getByTestId('studio-review-notes').fill(
    'The function enforces verified data and prior approval. All 8 code tests and 6 config checks pass.'
  );
  await commander.page.getByTestId('studio-review').click();
  await expect(commander.page.getByTestId('studio-action-approve')).toBeEnabled({timeout:15_000});
  await commander.page.getByTestId('studio-action-approve').click();

  // Communications must never receive engineer source or reviewer packet.
  await communications.page.getByRole('button',{name:'Code editor'}).click();
  await expect(communications.page.getByTestId('studio-code-editor')).toHaveCount(0);
  await expect(communications.page.getByText('function approvePriceChange')).toHaveCount(0);
  const snapshot=await browserAction(communications.page,'studioSnapshot',{roomId});
  expect(snapshot.success).toBe(true);
  const view = snapshot.data as {js?:{source?:unknown;results?:unknown[]};config?:{source?:unknown};reviewPacket?:unknown};
  expect(view.js?.source).toBeUndefined();
  expect(view.config?.source).toBeUndefined();
  expect(view.reviewPacket).toBeUndefined();

  await engineer.page.getByTestId('studio-action-apply').click();
  await engineer.page.getByTestId('studio-action-verify').click();
  await communications.page.getByTestId('studio-action-communicate').click();
  await commander.page.getByTestId('studio-action-finish').click();
  await expect(commander.page.getByTestId('studio-phase')).toHaveText('complete',{timeout:15_000});
  await Promise.all([engineer.page.reload(), communications.page.reload()]);
  await expect(engineer.page.getByTestId('studio-phase')).toHaveText('complete',{timeout:15_000});
  await expect(communications.page.getByTestId('studio-phase')).toHaveText('complete',{timeout:15_000});
  await communications.page.getByRole('button',{name:'Code editor'}).click();
  await expect(communications.page.getByTestId('studio-code-editor')).toHaveCount(0);
});

test('two concurrent writes on one room revision have exactly one winner', async ({users})=>{
  const [host]=await users(1);
  await host.page.goto(PATH);
  await host.page.getByTestId('scenario-checkout').click();
  await host.page.getByTestId('studio-create').click();
  await host.page.getByTestId('studio-action-start').click();
  const roomId=(await host.page.getByTestId('studio-room').innerText()).trim();
  const before=await browserAction(host.page,'studioSnapshot',{roomId});
  expect(before.success).toBe(true);
  const version=(before.data as {version:number}).version;
  const [a,b]=await Promise.all([
    browserAction(host.page,'studioCommand',{roomId,type:'contain',expectedVersion:version,requestId:crypto.randomUUID()}),
    browserAction(host.page,'studioCommand',{roomId,type:'risky',expectedVersion:version,requestId:crypto.randomUUID()}),
  ]);
  expect([a,b].filter(x=>x.success)).toHaveLength(1);
  expect([a,b].filter(x=>!x.success)).toHaveLength(1);
  const after=await browserAction(host.page,'studioSnapshot',{roomId});
  expect((after.data as {version:number}).version).toBe(version+1);
});

test('solo exercise starts without invitation or extra identities',async ({users})=>{
  const [host]=await users(1);
  await host.page.goto(PATH);
  await host.page.getByTestId('scenario-checkout').click();
  await host.page.getByTestId('studio-create').click();
  await expect(host.page.getByTestId('studio-action-start')).toBeEnabled();
  await host.page.getByTestId('studio-action-start').click();
  await expect(host.page.getByTestId('studio-phase')).toHaveText('active');
  await expect(host.page.getByText('Simulated teammate')).toHaveCount(2);
});

test('signed-out API caller cannot create an incident',async ({request})=>{
  const response=await request.post('/api/actions/studioCreate',{data:{scenarioId:'checkout',mode:'solo'}});
  expect([401,403]).toContain(response.status());
});
