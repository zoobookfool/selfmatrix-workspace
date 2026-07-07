import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./web/tests",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    viewport: { width: 1280, height: 720 },
    colorScheme: "dark",
  },
});
