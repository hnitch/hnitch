import fs from "node:fs/promises";
import path from "node:path";

import { mergeReviewSummaryResults } from "./review-summary.js";

const ROOT = process.cwd();
const ACTIVITY_FILE = path.join(ROOT, "data", "activity.json");
const CACHE_FILE = path.join(ROOT, "data", "review-summaries.json");
const VOICE_FILE = path.join(ROOT, ".github", "prompts", "goodreads-voice.md");
const responseFile = process.env.REVIEW_RESPONSE_FILE || process.argv[2];

if (!responseFile) {
  throw new Error("Set REVIEW_RESPONSE_FILE or pass the Copilot response file as the first argument");
}

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await fs.readFile(filename, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

const [activity, cache, voiceInstructions, response] = await Promise.all([
  readJson(ACTIVITY_FILE, {}),
  readJson(CACHE_FILE, {}),
  fs.readFile(VOICE_FILE, "utf8"),
  fs.readFile(responseFile, "utf8"),
]);
const books = activity.goodreads?.recent || [];
const result = mergeReviewSummaryResults(books, response, {
  cache,
  voiceInstructions,
});

for (const item of result.warnings) {
  console.warn(`warning: ${item.code}${item.title ? ` (${item.title})` : ""}: ${item.message}`);
}
if (!result.stats.generated) {
  throw new Error("The model returned no usable Goodreads review summaries");
}

await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
await fs.writeFile(CACHE_FILE, `${JSON.stringify(result.cache, null, 2)}\n`);
console.log(`Saved ${result.stats.generated} new Goodreads review ${result.stats.generated === 1 ? "summary" : "summaries"}`);
