import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const harnessUrl = pathToFileURL(path.join(__dirname, "..", "index.html")).toString();

test("stream tile context menu exposes stream volume controls", async ({ page }) => {
  await page.goto(harnessUrl);
  await page.getByTestId("stream-tile-yami").click({ button: "right", position: { x: 220, y: 160 } });

  await expect(page.getByTestId("stream-context-menu")).toBeVisible();
  await expect(page.getByText("配信の音量")).toBeVisible();
  await expect(page.getByTestId("stream-volume")).toHaveValue("100");
  await expect(page.getByText("配信をポップアウト")).toBeVisible();
});

test("speaker overlay context menu exposes per-user volume controls", async ({ page }) => {
  await page.goto(harnessUrl);
  await page.getByTestId("speaker-overlay-yami").click({ button: "right" });

  await expect(page.getByTestId("speaker-context-menu")).toBeVisible();
  await expect(page.getByText("やみさんの音量")).toBeVisible();
  await expect(page.getByTestId("speaker-volume")).toHaveValue("100");
});
