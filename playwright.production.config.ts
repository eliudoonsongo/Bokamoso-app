import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const uploadKey = "local-production-atlas-test-key";

export default defineConfig({
  ...base,
  testMatch: "**/atlas*.spec.ts",
  outputDir: "test-results/production",
  use: {
    ...base.use,
    baseURL: "https://127.0.0.1:3110",
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { "x-admin-key": uploadKey },
  },
  webServer: {
    command: "node tests/fixtures/production-server.mjs",
    url: "https://127.0.0.1:3110",
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: ".next-build",
      BOKAMOSO_STORAGE: "sqlite",
      BOKAMOSO_DB_PATH: `data/production-test-${process.pid}.sqlite`,
      NVIDIA_API_KEY: "",
      GEMINI_API_KEY: "",
      ADMIN_UPLOAD_KEY: uploadKey,
    },
  },
});