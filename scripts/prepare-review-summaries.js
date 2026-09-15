import fs from "node:fs/promises";
import path from "node:path";

import {
  buildReviewSummaryBatchRequest,
  prepareReviewSummaryCandidates,
} from "./review-summary.js";

const ROOT = process.cwd();
const ACTIVITY_FILE = path.join(ROOT, "data", "activity.json");
const CACHE_FILE = path.join(ROOT, "data", "review-summaries.json");
const VOICE_FILE = path.join(ROOT, ".github", "prompts", "goodreads-voice.md");
const TEMP_DIR = path.join(ROOT, ".tmp");

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await fs.readFile(filename, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function setActionOutput(name, value) {
  const line = `${name}=${String(value)}\n`;
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, line);
  } else {
    console.log(line.trim());
  }
}

const [activity, cache, voiceInstructions] = await Promise.all([
  readJson(ACTIVITY_FILE, {}),
  readJson(CACHE_FILE, {}),
  fs.readFile(VOICE_FILE, "utf8"),
]);
const books = activity.goodreads?.recent || [];
const plan = prepareReviewSummaryCandidates(books, { cache, voiceInstructions });
const batch = buildReviewSummaryBatchRequest(plan.candidates, { voiceInstructions });

await fs.mkdir(TEMP_DIR, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(TEMP_DIR, "goodreads-review-system.txt"), `${batch.systemPrompt}\n`),
  fs.writeFile(path.join(TEMP_DIR, "goodreads-review-prompt.txt"), `${batch.prompt}\n`),
]);
await Promise.all([
  setActionOutput("pending", plan.candidates.length > 0),
  setActionOutput("count", plan.candidates.length),
]);

if (plan.candidates.length) {
  console.log(`${plan.candidates.length} Goodreads review ${plan.candidates.length === 1 ? "summary" : "summaries"} queued`);
} else {
  console.log("All written Goodreads reviews already have current summaries");
}
