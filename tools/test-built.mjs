import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, cpSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

if (!existsSync('dist/rollcall_pavel/wrangler.json')) throw new Error('Run npm run build first.')
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const temp = mkdtempSync(join(tmpdir(), 'rehearsal-browser-'))
try {
  cpSync('dist', temp, { recursive: true, filter: file => !file.split('/').at(-1).startsWith('.dev.vars') })
  const dir = join(temp, 'rollcall_pavel')
  const issuer = 'https://rehearsal.test.invalid'
  const vars = {
    AUTH_JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString().trim().replaceAll('\n', '\\n'),
    AUTH_JWT_ISSUER: issuer, AUTH_WORKER_URL: 'http://127.0.0.1:1', API_WORKER_URL: 'http://127.0.0.1:1',
    OWNER_USER_ID: 'local-test-owner',
  }
  writeFileSync(join(dir, '.dev.vars'), Object.entries(vars).map(([k,v]) => k+'='+JSON.stringify(v)).join('\n'))
  const run = spawnSync(resolve('node_modules/.bin/playwright'), ['test', '--config', 'tests/playwright.config.ts', ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, REHEARSAL_TEST_BUILD: dir,
      REHEARSAL_TEST_SIGNER: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    },
  })
  process.exitCode = run.status ?? 1
} finally { rmSync(temp, { recursive: true, force: true }) }
