import { test as platformTest, expect } from 'deepspace/testing'
import { chromium, type Browser } from '@playwright/test'
import { SignJWT, importPKCS8 } from 'jose'

// This fixture supplies only the external identity provider. All room requests,
// role decisions, storage and WebSocket traffic go to the compiled app worker.
const localTest = platformTest.extend({
  users: async ({ baseURL }, provide) => {
    if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1')
      throw new Error('Loopback test required')
    const key = await importPKCS8(process.env.REHEARSAL_TEST_SIGNER!, 'ES256')
    const sessions: Browser[] = []
    try {
      await provide(async (count) => {
        if (typeof count !== 'number')
          throw new Error('Use a numeric test account count')
        return Promise.all(
          Array.from({ length: count }, async () => {
            const id = crypto.randomUUID(),
              email = id + '@example.test',
              name = 'Test responder'
            const token = await new SignJWT({ name })
              .setProtectedHeader({ alg: 'ES256' })
              .setSubject(id)
              .setIssuer('https://rehearsal.test.invalid')
              .setExpirationTime('15m')
              .sign(key)
            const instance = await chromium.launch({
              executablePath: process.env.ROLLCALL_CHROMIUM || undefined,
              args: [
                '--no-zygote',
                '--disable-gpu',
                '--renderer-process-limit=2',
              ],
            })
            sessions.push(instance)
            const context = await instance.newContext({ baseURL })
            await context.addCookies([
              {
                name: 'rehearsal_fixture',
                value: token,
                url: baseURL,
                httpOnly: true,
                sameSite: 'Strict',
              },
            ])
            const page = await context.newPage()
            if (process.env.REHEARSAL_TEST_TRACE) {
              page.on('response', (r) =>
                console.log(r.status(), new URL(r.url()).pathname),
              )
              page.on('pageerror', (e) => console.log(e.message))
            }
            return { context, page, email, name, userId: id }
          }),
        )
      })
    } finally {
      await Promise.all(sessions.map((c) => c.close()))
    }
  },
})
export const test = process.env.REHEARSAL_TEST_SIGNER ? localTest : platformTest
export { expect }
