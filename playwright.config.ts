import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'apps/web/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? undefined, args: ['--autoplay-policy=no-user-gesture-required'] },
    viewport: { width: 1280, height: 800 },
  },
  webServer: { command: 'pnpm --filter @shed/web preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
  reporter: 'list',
});
