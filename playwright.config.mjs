import { defineConfig, devices } from "@playwright/test";

const PORTA = 4173;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORTA}`,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.mjs/ }
  ],
  webServer: { command: `node scripts/serve.mjs ${PORTA}`, port: PORTA, reuseExistingServer: !process.env.CI }
});
