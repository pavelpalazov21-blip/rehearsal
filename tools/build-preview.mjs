import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const result = await build({
  entryPoints: ['tools/preview-entry.tsx'],
  outdir: 'dist/preview',
  bundle: true,
  jsx: 'automatic',
  minify: true,
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
})
const css = result.outputFiles.find((file) => file.path.endsWith('.css')).text
const js = result.outputFiles
  .find((file) => file.path.endsWith('.js'))
  .text.replace(/<\/script/gi, '<\\/script')
const reset =
  '*{box-sizing:border-box}html,body{margin:0;background:#f6f6f8}button,input{font:inherit}button{color:inherit}button,ol{margin:0}svg{vertical-align:middle}[hidden]{display:none!important}'
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Rollcall · Local release console</title><style>${reset}${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`
const path = resolve(process.argv[2] ?? 'Rollcall-Preview.html')
writeFileSync(path, html)
console.log('Saved', path)
