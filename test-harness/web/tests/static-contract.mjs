#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.join(__dirname, "..", "index.html"), "utf8");

const required = [
  'data-testid="stream-tile-yami"',
  'data-testid="stream-context-menu"',
  'data-testid="stream-volume"',
  'data-testid="speaker-overlay-yami"',
  'data-testid="speaker-context-menu"',
  'data-testid="speaker-volume"',
  "1080p 60 FPS",
  "配信の音量",
  "やみさんの音量",
];

const missing = required.filter((needle) => !html.includes(needle));
if (missing.length > 0) {
  console.error(`Missing web harness contract markers: ${missing.join(", ")}`);
  process.exit(1);
}

if (html.includes("ライブ配信中")) {
  console.error("The harness must not use the ambiguous ライブ配信中 status text.");
  process.exit(1);
}

console.log("PASS web static contract");
