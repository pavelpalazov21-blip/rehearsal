import { defineConfig } from '@playwright/test'
import { chromiumLaunchOptions } from 'deepspace/testing'
const port = Number(process.env.DEEPSPACE_PORT ?? 5192)
const baseURL = 'http://127.0.0.1:' + port
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 45000,
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
  webServer: {
    command:
      'npx vite --mode rollcall-local --host 127.0.0.1 --strictPort --port ' +
      port,
    cwd: '..',
    url: baseURL,
    timeout: 90000,
    reuseExistingServer: false,
  },
})
