import { defineConfig } from '@playwright/test'
import { chromiumLaunchOptions } from 'deepspace/testing'
const port = Number(process.env.DEEPSPACE_PORT ?? 5192)
const hosted = process.env.REHEARSAL_TEST_LIVE === '1'
const baseURL = hosted
  ? 'https://rollcall-pavel.app.space'
  : 'http://127.0.0.1:' + port
export default defineConfig({
  testDir: '.',
  testMatch: hosted ? 'studio-collab.spec.ts' : '**/*.spec.ts',
  workers: 1,
  timeout: 90000,
  retries: 0,
  use: {
    baseURL,
    headless: true,
    launchOptions: process.env.ROLLCALL_CHROMIUM
      ? {
          executablePath: process.env.ROLLCALL_CHROMIUM,
          args: ['--no-sandbox', '--no-zygote'],
        }
      : chromiumLaunchOptions(),
  },
  webServer: hosted
    ? undefined
    : {
        command: process.env.REHEARSAL_TEST_BUILD
          ? 'node tests/support/serve-built.mjs ' + port
          : 'node tests/support/serve-platform.mjs ' + port,
        cwd: '..',
        url: baseURL,
        timeout: 90000,
        stdout: process.env.REHEARSAL_TEST_TRACE ? 'pipe' : 'ignore',
        reuseExistingServer: false,
      },
})
