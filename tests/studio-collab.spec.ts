import { test, expect } from './support/users'

const PATH = '/rehearsal-studio'
const validJs = `function approvePriceChange(change) {
  return change.approved === true && change.source === 'verified'
    && change.percentChange >= -10 && change.percentChange <= 10;
}`
const validConfig = JSON.stringify(
  {
    agentWritesEnabled: false,
    requiresHumanApproval: true,
    maxPriceChangePercent: 5,
    restoreFromSnapshot: 'last-approved',
    auditAgentEdits: true,
  },
  null,
  2,
)

// Do not log or snapshot bearer tokens; authenticated request checks return
// only the response status and trusted, sanitized JSON error/output.
async function browserAction(
  page: import('@playwright/test').Page,
  action: string,
  params: Record<string, unknown>,
) {
  return page.evaluate(
    async ({ action, params }) => {
      const tokenResult = await fetch('/api/auth/token', {
        method: 'POST',
        credentials: 'include',
      })
      if (!tokenResult.ok) throw new Error('Test session token unavailable')
      const token = ((await tokenResult.json()) as { token?: string }).token
      if (!token) throw new Error('Test session token missing')
      const response = await fetch(`/api/actions/${action}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(params),
      })
      const payload = (await response.json()) as {
        success?: boolean
        error?: string
        data?: Record<string, unknown>
      }
      return {
        status: response.status,
        success: payload.success,
        error: payload.error || '',
        data: payload.data || {},
      }
    },
    { action, params },
  )
}

test('seven distinct incident scenarios are presented to a real signed-in user', async ({
  users,
}) => {
  const [host] = await users(1)
  await host.page.goto(PATH, { waitUntil: 'domcontentloaded' })
  for (const id of [
    'checkout',
    'surge',
    'security',
    'ai-agent',
    'duplicates',
    'database',
    'notification',
  ])
    await expect(host.page.getByTestId('scenario-' + id)).toBeVisible()
  await expect(host.page.getByText('When things break,')).toBeVisible()
})

test('three signed-in users collaborate, preserve private evidence and verify recovery', async ({
  users,
}) => {
  const [commander, engineer, communications] = await users(3)
  for (const { page } of [commander, engineer, communications]) {
    await page.goto(PATH, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('scenario-checkout')).toBeVisible()
  }
  await commander.page.getByTestId('scenario-ai-agent').click()
  await commander.page
    .getByRole('button', { name: 'Team', exact: true })
    .click()
  await commander.page.getByTestId('studio-create').click()
  const roomId = (
    await commander.page.getByTestId('studio-room').innerText()
  ).trim()
  const engineerCode = (
    await commander.page.getByTestId('studio-invite-engineer').innerText()
  ).trim()
  const commsCode = (
    await commander.page.getByTestId('studio-invite-comms').innerText()
  ).trim()
  expect(roomId).toMatch(/^rh-[a-f0-9]{32}$/)
  expect(engineerCode).toMatch(/^[a-f0-9]{48}$/)
  expect(commsCode).toMatch(/^[a-f0-9]{48}$/)

  await expect(
    commander.page.getByTestId('studio-invite-engineer'),
  ).toBeVisible()
  await commander.page.reload({ waitUntil: 'domcontentloaded' })
  await expect(commander.page.getByTestId('studio-invite-engineer')).toHaveText(
    engineerCode,
  )
  const outsider = await browserAction(engineer.page, 'studioSnapshot', {
    roomId,
  })
  expect(outsider.status).toBe(403)
  await engineer.page.getByLabel('Studio room ID').fill(roomId)
  await engineer.page.getByLabel('Studio invitation code').fill(engineerCode)
  await engineer.page.getByTestId('studio-join').click()
  await communications.page.getByLabel('Studio room ID').fill(roomId)
  await communications.page
    .getByLabel('Studio assigned role')
    .selectOption('comms')
  await communications.page.getByLabel('Studio invitation code').fill(commsCode)
  await communications.page.getByTestId('studio-join').click()
  await expect(commander.page.getByTestId('studio-action-start')).toBeEnabled({
    timeout: 15_000,
  })
  await commander.page.getByTestId('studio-action-start').click()
  await expect(engineer.page.getByTestId('studio-phase')).toHaveText('active', {
    timeout: 15_000,
  })
  await expect(communications.page.getByTestId('studio-phase')).toHaveText(
    'active',
    { timeout: 15_000 },
  )

  // A real forbidden server-side action, not merely a hidden button.
  const forbidden = await browserAction(communications.page, 'studioEvidence', {
    roomId,
    command: 'logs',
  })
  expect(forbidden.success).toBe(false)
  expect(forbidden.error).toMatch(/private|engineer|forbidden/i)
  await expect(
    communications.page.getByRole('button', { name: 'logs', exact: true }),
  ).toHaveCount(0)
  await engineer.page
    .getByLabel('Studio team message')
    .fill('I am checking the price approval rule.')
  await engineer.page.getByRole('button', { name: 'Send team message' }).click()
  await expect(
    communications.page.getByText('I am checking the price approval rule.'),
  ).toBeVisible({ timeout: 4000 })
  // Retain the Communications tab's session storage while its app is disconnected.
  await communications.page.goto('about:blank')
  await communications.context.setOffline(true)
  await engineer.page
    .getByLabel('Studio team message')
    .fill('The verification job finished while Communications was away.')
  await engineer.page.getByRole('button', { name: 'Send team message' }).click()
  await expect(
    commander.page.getByText(
      'The verification job finished while Communications was away.',
    ),
  ).toBeVisible({ timeout: 4000 })
  await communications.context.setOffline(false)
  await communications.page.goto(PATH, { waitUntil: 'domcontentloaded' })
  await expect(
    communications.page.getByText(
      'The verification job finished while Communications was away.',
    ),
  ).toBeVisible()
  await engineer.page.getByRole('button', { name: 'logs', exact: true }).click()
  await expect(
    engineer.page.getByTestId('studio-console-output'),
  ).toContainText('agent updates')
  await engineer.page.getByTestId('studio-action-inspect').click()
  await engineer.page.getByRole('button', { name: 'Code editor' }).click()
  await engineer.page.getByTestId('studio-run-js').click()
  await expect(
    engineer.page.getByText('FAIL', { exact: true }).first(),
  ).toBeVisible()
  await engineer.page.getByTestId('studio-code-editor').fill(validJs)
  await engineer.page.getByTestId('studio-run-js').click()
  await expect(engineer.page.getByText('8/8', { exact: true })).toBeVisible()
  await engineer.page.getByRole('button', { name: 'Guardrails' }).click()
  await engineer.page.getByTestId('studio-config-editor').fill(validConfig)
  await engineer.page.getByTestId('studio-run-config').click()
  await expect(engineer.page.getByText('6/6', { exact: true })).toBeVisible()
  await engineer.page.getByTestId('studio-action-submit').click()

  // Hidden until an explicit, written review is recorded.
  await expect(commander.page.getByTestId('studio-action-approve')).toHaveCount(
    0,
  )
  await commander.page.getByRole('button', { name: 'Code review' }).click()
  await expect(commander.page.getByText('JavaScript / Original')).toBeVisible()
  await expect(commander.page.getByText('Config / Proposed')).toBeVisible()
  await commander.page
    .getByTestId('studio-review-notes')
    .fill(
      'The function enforces verified data and prior approval. All 8 code tests and 6 config checks pass.',
    )
  await commander.page.getByTestId('studio-review').click()
  await expect(commander.page.getByTestId('studio-action-approve')).toBeEnabled(
    { timeout: 15_000 },
  )
  await commander.page.getByTestId('studio-action-approve').click()

  // Communications must never receive engineer source or reviewer packet.
  await communications.page.getByRole('button', { name: 'Code editor' }).click()
  await expect(
    communications.page.getByTestId('studio-code-editor'),
  ).toHaveCount(0)
  await expect(
    communications.page.getByText('function approvePriceChange'),
  ).toHaveCount(0)
  const snapshot = await browserAction(communications.page, 'studioSnapshot', {
    roomId,
  })
  expect(snapshot.success).toBe(true)
  const view = snapshot.data as {
    js?: { source?: unknown; results?: unknown[] }
    config?: { source?: unknown }
    reviewPacket?: unknown
  }
  expect(view.js?.source).toBeUndefined()
  expect(view.config?.source).toBeUndefined()
  expect(view.reviewPacket).toBeUndefined()

  await engineer.page.getByTestId('studio-action-apply').click()
  await engineer.page.getByTestId('studio-action-verify').click()
  await expect(communications.page.getByText('6 of 7 checkpoints', { exact: true })).toBeVisible({ timeout: 30_000 })
  await communications.page
    .getByLabel('Customer update', { exact: true })
    .fill('Price changes are paused while we verify the last approved values.')
  await communications.page.getByTestId('studio-action-communicate').click()
  await commander.page.getByTestId('studio-action-finish').click()
  await expect(commander.page.getByTestId('studio-phase')).toHaveText(
    'complete',
    { timeout: 15_000 },
  )
  await engineer.page.reload({ waitUntil: 'domcontentloaded' })
  await communications.page.reload({ waitUntil: 'domcontentloaded' })
  await expect(engineer.page.getByTestId('studio-phase')).toHaveText(
    'complete',
    { timeout: 15_000 },
  )
  await expect(communications.page.getByTestId('studio-phase')).toHaveText(
    'complete',
    { timeout: 15_000 },
  )
  await communications.page.getByRole('button', { name: 'Code editor' }).click()
  await expect(
    communications.page.getByTestId('studio-code-editor'),
  ).toHaveCount(0)
})

test('two concurrent writes on one room revision have exactly one winner', async ({
  users,
}) => {
  const [host] = await users(1)
  await host.page.goto(PATH, { waitUntil: 'domcontentloaded' })
  await host.page.getByTestId('scenario-checkout').click()
  await host.page.getByTestId('studio-create').click()
  await host.page.getByTestId('studio-action-start').click()
  const roomId = (await host.page.getByTestId('studio-room').innerText()).trim()
  const before = await browserAction(host.page, 'studioSnapshot', { roomId })
  expect(before.success).toBe(true)
  const version = (before.data as { version: number }).version
  const containId = crypto.randomUUID(),
    riskyId = crypto.randomUUID()
  const [a, b] = await Promise.all([
    browserAction(host.page, 'studioCommand', {
      roomId,
      type: 'contain',
      expectedVersion: version,
      requestId: containId,
    }),
    browserAction(host.page, 'studioCommand', {
      roomId,
      type: 'risky',
      expectedVersion: version,
      requestId: riskyId,
    }),
  ])
  expect([a, b].filter((x) => x.success)).toHaveLength(1)
  expect([a, b].filter((x) => !x.success)).toHaveLength(1)
  expect((a.success ? b : a).status).toBe(409)
  const retry = await browserAction(host.page, 'studioCommand', {
    roomId,
    type: a.success ? 'contain' : 'risky',
    expectedVersion: version,
    requestId: a.success ? containId : riskyId,
  })
  expect(retry.success).toBe(true)
  expect(retry.data.replayed).toBe(true)
  const after = await browserAction(host.page, 'studioSnapshot', { roomId })
  expect((after.data as { version: number }).version).toBe(version + 1)
})

test('solo exercise starts without invitation or extra identities', async ({
  users,
}) => {
  const [host] = await users(1)
  await host.page.goto(PATH, { waitUntil: 'domcontentloaded' })
  await host.page.setViewportSize({ width: 390, height: 844 })
  await host.page.getByTestId('scenario-checkout').click()
  await host.page.getByTestId('studio-create').click()
  expect(
    await host.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await expect(host.page.getByTestId('studio-action-start')).toBeEnabled()
  await host.page.getByTestId('studio-action-start').click()
  await expect(host.page.getByTestId('studio-phase')).toHaveText('active')
  await expect(host.page.getByText('Simulated teammate')).toHaveCount(2)
  await host.page.getByRole('button', { name: 'Get a hint' }).click()
  await expect(
    host.page.getByText('Scenario guide', { exact: true }),
  ).toBeVisible()
  await host.page.getByTestId('studio-action-inspect').click()
  await expect(host.page.getByTestId('studio-code-editor')).toBeVisible()
  expect(
    await host.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('signed-out API caller cannot create an incident', async ({ request }) => {
  const response = await request.post('/api/actions/studioCreate', {
    data: { scenarioId: 'checkout', mode: 'solo' },
  })
  expect([401, 403]).toContain(response.status())
})

test('the entry page and public source work at phone and desktop widths', async ({
  page,
  request,
}) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Checkout is failing',
    )
    await expect(
      page.getByRole('link', { name: 'Open the incident studio' }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.getByRole('link', { name: 'Read the source and tests' }).click()
    await expect(
      page.getByRole('heading', { name: 'Source code', exact: true }),
    ).toBeVisible()
    const source = page
      .getByText('JavaScript evaluator', { exact: false })
      .first()
    await source.click()
    await expect(page.locator('details[open] pre')).toContainText(
      'checkJavaScript',
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  const archive = await request.get('/release-source/rehearsal.zip')
  expect(archive.status()).toBe(200)
  expect((await archive.body()).subarray(0, 2).toString()).toBe('PK')
})
