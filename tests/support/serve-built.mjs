import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
const { REHEARSAL_TEST_BUILD: dir, REHEARSAL_TEST_SIGNER: unused, ...env } = process.env
if (!dir) throw new Error('Missing isolated build directory')
const child = spawn(resolve('node_modules/.bin/wrangler'), [
  'dev', '--local', '--config', join(dir, 'wrangler.json'), '--ip', '127.0.0.1', '--port',
  process.argv[2], '--persist-to', join(dir, 'state'), '--inspector-port', '0',
], { stdio: 'inherit', cwd: dir, env })
for (const sig of ['SIGINT','SIGTERM']) process.on(sig, () => child.kill(sig))
child.on('exit', code => { process.exitCode = code ?? 0 })
