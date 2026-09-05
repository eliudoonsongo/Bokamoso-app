import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3107",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: { reducedMotion: "reduce" },
    ...devices["Desktop Chrome"],
    channel: "chrome",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3107",
    url: "http://127.0.0.1:3107",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: ".next-test",
      BOKAMOSO_STORAGE: "sqlite",
      BOKAMOSO_DB_PATH: `data/test-${process.pid}.sqlite`,
      GEMINI_API_KEY: "",
      ADMIN_UPLOAD_KEY: "",
    },
  },
});