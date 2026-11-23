import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReleasedSource } from '../src/components/ReleasedSource'
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
      'objects/info/packs',
      ...readdirSync(join(temp, 'objects/pack'))
        .filter((f) => /\.(pack|idx)$/.test(f))
        .map((f) => 'objects/pack/' + f),
    ]
    for (const file of files) {
      mkdirSync(dirname(join(cloneDir, file)), { recursive: true })
      cpSync(join(temp, file), join(cloneDir, file))
    }
    // Git may pack refs after fetch/repack; a public dumb-HTTP snapshot
    // still needs a readable loose branch ref for anonymous clients.
    mkdirSync(join(cloneDir, 'refs/heads'), { recursive: true })
    writeFileSync(join(cloneDir, 'refs/heads/main'), commit + '\n')
    git(
      'archive',
      '--format=zip',
      '--prefix=Rehearsal/',
      '--output=' + join(output, 'rehearsal.zip'),
      commit,
    )
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }

  const files = [
    ['Room state and permissions', 'src/rehearsal/studio/engine.ts'],
    ['JavaScript evaluator', 'src/rehearsal/studio/repair.ts'],
    ['Seven incident definitions', 'src/rehearsal/studio/scenarios.ts'],
    ['SQLite room and notifications', 'src/rehearsal/studio-room.ts'],
    ['Authenticated actions and coach', 'src/rehearsal/studio-actions.ts'],
    ['Three-role browser acceptance', 'tests/studio-collab.spec.ts'],
    ['Project overview', 'README.md'],
  ]
  const release = {
    commit,
    origin,
    files: files.map(([label, path]) => ({
      label,
      path,
      content: git('show', commit + ':' + path),
    })),
  }
  const markup = renderToStaticMarkup(
    createElement(ReleasedSource, { release }),
  )
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/favicon.ico"><title>Rehearsal · Source code</title></head><body>${markup}</body></html>`
  writeFileSync(join(output, 'listing.json'), JSON.stringify(release))
  writeFileSync(join(output, 'document.txt'), page)
  mkdirSync(join(clientDir, 'rehearsal-source'), { recursive: true })
  writeFileSync(join(clientDir, 'rehearsal-source/index.html'), page)
  writeFileSync(join(clientDir, 'source.html'), page)
}
