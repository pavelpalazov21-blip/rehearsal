import { test, expect } from '@playwright/test'
test('the public source transport returns a missing-object status and accepts only reads', async ({
  request,
}) => {
  const path =
    '/release-source/git/objects/00/00000000000000000000000000000000000000'
  expect((await request.get(path)).status()).toBe(404)
  expect((await request.post(path)).status()).toBe(405)
})

test('retired release endpoints cannot create or mutate legacy workspaces', async ({ request }) => {
  const path = '/api/rollcall/workspaces/' + crypto.randomUUID()
  expect((await request.get('/api/rollcall/session')).status()).toBe(404)
  expect((await request.put(path)).status()).toBe(404)
})
