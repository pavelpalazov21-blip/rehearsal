import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

function html(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// Publish only reachable Git objects and transport metadata. Machine config,
// hooks, credentials and working-directory files are outside this snapshot.
export function writeReviewSource(
  root: string,
  clientDir: string,
  origin: string,
) {
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  const commit = git('rev-parse', '--verify', 'HEAD').trim()
  const temp = mkdtempSync(join(tmpdir(), 'rollcall-source-'))
  const output = join(clientDir, 'release-source')
  const cloneDir = join(output, 'git')
  mkdirSync(cloneDir, { recursive: true })
  try {
    execFileSync('git', [
      'init',
      '--bare',
      '--initial-branch=main',
      '--quiet',
      temp,
    ])
    const bare = (...args: string[]) =>
      execFileSync('git', ['--git-dir', temp, ...args], { stdio: 'pipe' })
    bare('fetch', '--quiet', '--no-tags', root, commit + ':refs/heads/main')
    bare('repack', '-ad')
    bare('update-server-info')
    const files = [
      'HEAD',
      'info/refs',
      'refs/heads/main',
      'objects/info/packs',
      ...readdirSync(join(temp, 'objects/pack'))
        .filter((f) => /\.(pack|idx)$/.test(f))
        .map((f) => 'objects/pack/' + f),
    ]
    for (const file of files) {
      mkdirSync(dirname(join(cloneDir, file)), { recursive: true })
      cpSync(join(temp, file), join(cloneDir, file))
    }
    git(
      'archive',
      '--format=zip',
      '--prefix=Rollcall/',
      '--output=' + join(output, 'rollcall.zip'),
      commit,
    )
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }

  const files = [
    ['Rollout assignment', 'src/rollout/model.ts'],
    ['Publish and restore', 'src/server/releases.ts'],
    ['Permissions', 'src/schemas.ts'],
    ['Live updates', 'src/rollout/Wire.tsx'],
    ['CLI evaluator', 'src/ai/tools.ts'],
    ['Two-browser tests', 'tests/collab.spec.ts'],
    ['Concurrent publishes', 'tests/api.spec.ts'],
    ['Run the project', 'README.md'],
  ]
  const listings = files
    .map(
      ([label, path]) =>
        `<details><summary>${html(label)} <span>${html(path)}</span></summary><pre><code>${html(git('show', commit + ':' + path))}</code></pre></details>`,
    )
    .join('')
  const cloneUrl = html(origin) + '/release-source/git'
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rollcall · Source code</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f6f6f8;color:#232335;font:16px/1.5 Inter,Arial,sans-serif}nav{background:#212032;color:#fff}nav div,main{max-width:930px;margin:auto;padding:17px max(20px,4vw)}nav div{font-size:20px;font-weight:700}main{padding-block:34px 70px}h1{font-size:clamp(2.4rem,7vw,3.8rem);line-height:1.06;letter-spacing:-.065em;margin:14px 0}h2{font-size:1.1rem;margin-top:29px}a{color:#4936ab;text-underline-offset:3px}p{margin:10px 0;color:#55556c}code{font: .88em/1.5 ui-monospace,monospace}pre{background:#252536;color:#f5f3ff;padding:12px;border-radius:5px;overflow:auto}details{background:white;border:1px solid #dcdde5;border-radius:6px;margin:7px 0;padding:11px 15px;min-width:0}summary{cursor:pointer;font-weight:650;overflow-wrap:anywhere}summary span{color:#666777;font: .78em ui-monospace,monospace;margin-left:8px}.download{display:inline-block;background:#4936ab;color:white;font-weight:650;text-decoration:none;border-radius:5px;padding:8px 14px;margin:6px 0}</style>
</head><body><nav><div>Rollcall</div></nav><main><a href="/">Open release console</a><h1>Source code</h1><p>Code for revision <code>${html(commit.slice(0, 12))}</code> of the deployed app.</p><a class="download" href="/release-source/rollcall.zip" download>Download source ZIP</a><h2>Clone the read-only repository</h2><pre><code>git clone ${cloneUrl} rollcall</code></pre><h2>Browse the code</h2>${listings}</main></body></html>`
  writeFileSync(join(clientDir, 'source.html'), page)
}
