import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
const {
  REHEARSAL_TEST_BUILD: dir,
  REHEARSAL_TEST_SIGNER: unused,
  ...env
} = process.env
if (!dir) throw new Error('Missing isolated build directory')
const { createServer } = await import('node:http')
const { jwtVerify, importSPKI } = await import('jose')
const publicKey = await importSPKI(env.REHEARSAL_TEST_PUBLIC_KEY, 'ES256')
const provider = createServer(async (req, res) => {
  const cookie = /(?:^|; *)rehearsal_fixture=([^;]+)/.exec(
    req.headers.cookie || '',
  )?.[1]
  let id
  if (cookie) {
    try {
      id = (
        await jwtVerify(cookie, publicKey, {
          issuer: 'https://rehearsal.test.invalid',
        })
      ).payload.sub
    } catch {}
  }
  const path = new URL(req.url, 'http://localhost').pathname
  res.setHeader('Content-Type', 'application/json')
  if (path === '/api/auth/get-session')
    return res.end(
      JSON.stringify(
        id
          ? {
              session: {
                id,
                userId: id,
                expiresAt: new Date(Date.now() + 900000).toISOString(),
              },
              user: {
                id,
                name: 'Test responder',
                email: id + '@example.test',
                emailVerified: true,
              },
            }
          : null,
      ),
    )
  if (path === '/api/auth/token' && id)
    return res.end(JSON.stringify({ token: cookie }))
  res.writeHead(401)
  res.end('{}')
})
await new Promise((resolve) =>
  provider.listen(Number(process.argv[2]) + 321, '127.0.0.1', resolve),
)
const child = spawn(
  resolve('node_modules/.bin/wrangler'),
  [
    'dev',
    '--local',
    '--no-bundle',
    '--config',
    join(dir, 'wrangler.json'),
    '--ip',
    '127.0.0.1',
    '--port',
    process.argv[2],
    '--persist-to',
    join(dir, '..', 'test-state'),
    '--inspector-port',
    '0',
  ],
  { stdio: 'inherit', cwd: dir, env },
)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
child.on('exit', (code) => {
  provider.close()
  process.exitCode = code ?? 0
})
