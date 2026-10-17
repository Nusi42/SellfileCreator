import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// README media recorder (`npm run readme:media`): records the stills and the animation shown on
// the repository's front page from the shipped preset and the sample gear fixtures. It reuses the
// regular preview server and records the app as players see it, with the game's icons from the
// asset pack: the build fails instead of silently recording placeholders. README_PLACEHOLDERS=1
// records with the app's own placeholder art instead (no asset pack).
const baseServer = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;
const assetEnv = process.env.README_PLACEHOLDERS === '1'
  ? { SFC_GAME_ASSETS_DIR: '' }
  : { SFC_REQUIRE_GAME_ASSETS: '1' };

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
    ? { ...baseServer, reuseExistingServer: false, env: { ...(baseServer.env ?? {}), ...assetEnv } }
    : undefined,
});
