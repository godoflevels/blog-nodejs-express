import { defineConfig, devices } from '@playwright/test';

// Browser tests run against tests/e2e/server.mjs: the real Studio router and
// bundle with an in-memory store and a throwaway login (no MongoDB needed).
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.mjs',
  timeout: 45000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: 'http://127.0.0.1:4173/admin',
    reuseExistingServer: true,
    timeout: 20000,
  },
});
