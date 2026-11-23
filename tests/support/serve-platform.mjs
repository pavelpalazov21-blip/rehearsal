// The reviewer page and anonymous Git transport are generated at build time.
import { spawn, execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'

execFileSync('npm', ['run', 'build'], { stdio: 'inherit' })
const temp = mkdtempSync(join(tmpdir(), 'rehearsal-platform-'))
const clean = () => rmSync(temp, { recursive: true, force: true })
process.on('exit', clean)
cpSync('dist', temp, {
  recursive: true,
  filter: (p) => !p.split('/').pop().startsWith('.dev.vars'),
})
const dir = join(temp, 'rollcall_pavel')
cpSync('.dev.vars', join(dir, '.dev.vars'))
const args = [
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
  join(temp, 'state'),
  '--inspector-port',
  '0',
]

// In proxy-only environments workerd cannot resolve the public auth host.
// Forward the same requests through Node's HTTPS proxy to the SDK-selected issuer.
let relay
if (process.env.REHEARSAL_TEST_PROXY_AUTH === '1') {
  const origin = new URL(
    parseEnv(readFileSync('.dev.vars', 'utf8')).AUTH_WORKER_URL,
  )
  if (origin.protocol !== 'https:')
    throw new Error('Expected HTTPS for platform auth')
  relay = createServer(async (req, res) => {
    try {
      const target = new URL(req.url, origin)
      if (
        target.origin !== origin.origin ||
        !target.pathname.startsWith('/api/auth/')
      ) {
        res.writeHead(404).end()
        return
      }
      const headers = new Headers()
      for (const name of [
        'accept',
        'content-type',
        'cookie',
        'origin',
        'referer',
        'authorization',
      ]) {
        if (req.headers[name]) headers.set(name, req.headers[name])
      }
      const response = await fetch(target, {
        method: req.method,
        headers,
        redirect: 'manual',
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
        duplex: 'half',
      })
      for (const name of ['content-type', 'location', 'cache-control']) {
        if (response.headers.has(name))
          res.setHeader(name, response.headers.get(name))
      }
      res.setHeader('set-cookie', response.headers.getSetCookie())
      res
        .writeHead(response.status)
        .end(Buffer.from(await response.arrayBuffer()))
    } catch {
      res.writeHead(502).end()
    }
  })
  await new Promise((resolve) => relay.listen(0, '127.0.0.1', resolve))
  args.push('--var', 'AUTH_WORKER_URL:http://127.0.0.1:' + relay.address().port)
}
const child = spawn(resolve('node_modules/.bin/wrangler'), args, {
  cwd: dir,
  stdio: 'inherit',
})
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
child.on('exit', (code) => {
  relay?.close()
  process.exitCode = code ?? 0
})
