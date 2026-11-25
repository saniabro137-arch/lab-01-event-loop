import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3077';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'PORT=3077 npm run server',
    url: baseURL + '/health',
    reuseExistingServer: false,
    timeout: 30_000
  }
});
