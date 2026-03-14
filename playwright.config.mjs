import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3007",
  },
  webServer: {
    command: "PORT=3007 node serve.mjs . --no-open",
    port: 3007,
    reuseExistingServer: false,
  },
});
