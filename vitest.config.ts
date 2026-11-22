import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  define: { __DEEPSPACE_APP_ID__: JSON.stringify('rollcall-unit') },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['prerender.test.ts', 'src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
  },
})
