import { test, expect, type APIRequestContext } from '@playwright/test'
async function workspace(request: APIRequestContext) {
  await request.get('/api/rollcall/session')
  const path = '/api/rollcall/workspaces/' + crypto.randomUUID()
  expect((await request.put(path)).status()).toBe(200)
  return path
}
const publish = (percent: number, base = 0) => ({
  base,
  percent,
  kind: 'publish',
  requestId: crypto.randomUUID(),
  note: 'Pilot',
})
test('the winning concurrent release is immutable and its retry is idempotent', async ({
  request,
}) => {
  const space = await workspace(request)
  const candidates = [publish(25), publish(75)]
  const attempts = await Promise.all(
    candidates.map((data) => request.post(space + '/releases', { data })),
  )
  expect(attempts.map((r) => r.status()).sort()).toEqual([201, 409])
  const winner = candidates[attempts.findIndex((r) => r.status() === 201)]
  const retry = await request.post(space + '/releases', { data: winner })
  expect(retry.status()).toBe(200)
  expect((await retry.json()).release.percent).toBe(winner.percent)
  expect((await (await request.get(space)).json()).history).toHaveLength(1)
  expect(
    (
      await request.post(space + '/releases', {
        data: { ...winner, note: 'rewritten' },
      })
    ).status(),
  ).toBe(409)
})
test('observer links evaluate the flag and cannot publish, restore or take ownership', async ({
  request,
  playwright,
  baseURL,
}) => {
  const space = await workspace(request)
  const view = await playwright.request.newContext({ baseURL })
  try {
    await view.get('/api/rollcall/session')
    expect((await (await view.get(space)).json()).role).toBe('observer')
    expect((await view.put(space)).status()).toBe(409)
    expect(
      (await view.post(space + '/releases', { data: publish(100) })).status(),
    ).toBe(403)
    const command = publish(25)
    expect(
      (await request.post(space + '/releases', { data: command })).status(),
    ).toBe(201)
    const get = async () =>
      await (await view.get(space + '/evaluate?customer=shopper-002')).json()
    expect(await get()).toMatchObject({
      revision: 1,
      percent: 25,
      enabled: true,
      bucket: 1749,
    })
    const restore = {
      kind: 'restore',
      base: 1,
      target: 0,
      note: '',
      requestId: crypto.randomUUID(),
    }
    expect(
      (await view.post(space + '/releases', { data: restore })).status(),
    ).toBe(403)
    expect(
      (await request.post(space + '/releases', { data: restore })).status(),
    ).toBe(201)
    expect(await get()).toMatchObject({
      revision: 2,
      percent: 0,
      enabled: false,
      bucket: 1749,
    })
    expect(
      (await request.post(space + '/releases', { data: command })).status(),
    ).toBe(200)
    expect(
      (await (await view.get(space)).json()).history.map(
        (r: { revision: number }) => r.revision,
      ),
    ).toEqual([2, 1])
    expect((await view.get(space + '/evaluate?customer=')).status()).toBe(400)
  } finally {
    await view.dispose()
  }
})

test('the public source transport returns a missing-object status and accepts only reads', async ({
  request,
}) => {
  const path =
    '/release-source/git/objects/00/00000000000000000000000000000000000000'
  expect((await request.get(path)).status()).toBe(404)
  expect((await request.post(path)).status()).toBe(405)
})
