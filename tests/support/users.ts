import { test as platformTest, expect } from 'deepspace/testing'
import { SignJWT, importPKCS8 } from 'jose'

// This fixture supplies only the external identity provider. All room requests,
// role decisions, storage and WebSocket traffic go to the compiled app worker.
const localTest = platformTest.extend({
  users: async ({ browser, baseURL }, provide) => {
    if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1') throw new Error('Loopback test required')
    const key = await importPKCS8(process.env.REHEARSAL_TEST_SIGNER!, 'ES256')
    const contexts: import('@playwright/test').BrowserContext[] = []
    try {
      await provide(async (count) => {
        if (typeof count !== 'number') throw new Error('Use a numeric test account count')
        return Promise.all(Array.from({ length: count }, async () => {
          const id = crypto.randomUUID(), email = id+'@example.test', name = 'Test responder'
          const token = await new SignJWT({ name }).setProtectedHeader({ alg: 'ES256' })
            .setSubject(id).setIssuer('https://rehearsal.test.invalid').setExpirationTime('15m').sign(key)
          const context = await browser.newContext({ baseURL })
          contexts.push(context)
          await context.route('**/api/auth/get-session*', route => route.fulfill({ json: {
            session: { id, userId: id, expiresAt: new Date(Date.now()+900000).toISOString() },
            user: { id, name, email, emailVerified: true },
          } }))
          await context.route('**/api/auth/token', route => route.fulfill({ json: { token } }))
          return { context, page: await context.newPage(), email, name, userId: id }
        }))
      })
    } finally { await Promise.all(contexts.map(c => c.close())) }
  },
})
export const test = process.env.REHEARSAL_TEST_SIGNER ? localTest : platformTest
export { expect }
