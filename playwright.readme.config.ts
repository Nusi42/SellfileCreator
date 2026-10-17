import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// README media recorder (`npm run readme:media`): records the stills and the animation shown on
// the repository's front page from the shipped preset and the sample gear fixtures. It reuses the
// regular preview server but always builds WITHOUT the asset pack, so the recordings show
// only the project's own placeholder art, never game artwork.
const baseServer = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

export default defineConfig({
  ...base,
  testDir: './tests/readme',
  // Recordings are sequential by nature (one browser, deterministic frames).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  projects: [
    {
      name: 'readme-media',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: baseServer
    ? { ...baseServer, reuseExistingServer: false, env: { ...(baseServer.env ?? {}), SFC_GAME_ASSETS_DIR: '' } }
    : undefined,
});
