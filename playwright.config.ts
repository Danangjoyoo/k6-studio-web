import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    headless: true,
    video: "off",
  },
  reporter: "line",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
