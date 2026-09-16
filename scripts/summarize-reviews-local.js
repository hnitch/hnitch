import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildReviewSummaryBatchRequest,
  mergeReviewSummaryResults,
  prepareReviewSummaryCandidates,
} from "./review-summary.js";

const ROOT = process.cwd();
const ACTIVITY_FILE = path.join(ROOT, "data", "activity.json");
const CACHE_FILE = path.join(ROOT, "data", "review-summaries.json");
const VOICE_FILE = path.join(ROOT, ".github", "prompts", "goodreads-voice.md");
const DEFAULT_MODEL = "gpt-oss:20b";
const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

export function normaliseLocalModelName(value = DEFAULT_MODEL) {
  const model = String(value || DEFAULT_MODEL).trim();
  if (!/^[a-z0-9][a-z0-9._:/-]{0,127}$/iu.test(model)) {
    throw new Error("The local model name contains unsupported characters");
  }
  return model;
}

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await fs.readFile(filename, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function normaliseLocalModelUrl(value = DEFAULT_BASE_URL, allowRemote = false) {
  const url = new URL(value || DEFAULT_BASE_URL);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("The local model URL must use HTTP or HTTPS");
  }

  const host = url.hostname.toLowerCase();
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]).has(host);
  if (!loopback && !allowRemote) {
    throw new Error("Refusing a non-loopback model URL. Keep Ollama on localhost or explicitly set GOODREADS_ALLOW_REMOTE_MODEL=true.");
  }

  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString().replace(/\/$/u, "");
}

export function extractOllamaContent(payload) {
  const content = payload?.message?.content ?? payload?.response;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The local model returned no text response");
  }
  return content.trim();
}

export async function callLocalReviewModel({
  systemPrompt,
  prompt,
  model = DEFAULT_MODEL,
  baseUrl = DEFAULT_BASE_URL,
  allowRemote = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
} = {}) {
  const safeBaseUrl = normaliseLocalModelUrl(baseUrl, allowRemote);
  const safeModel = normaliseLocalModelName(model);
  const response = await fetchImpl(`${safeBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: safeModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      stream: false,
      format: "json",
      keep_alive: "5m",
      options: {
        temperature: 0.35,
        num_ctx: 8192,
        num_predict: 700,
      },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(`Local model request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  return extractOllamaContent(await response.json());
}

export async function main() {
  const model = normaliseLocalModelName(process.env.GOODREADS_LOCAL_MODEL || DEFAULT_MODEL);
  const baseUrl = process.env.GOODREADS_LOCAL_MODEL_URL || DEFAULT_BASE_URL;
  const allowRemote = process.env.GOODREADS_ALLOW_REMOTE_MODEL === "true";
  const [activity, cache, voiceInstructions] = await Promise.all([
    readJson(ACTIVITY_FILE, {}),
    readJson(CACHE_FILE, {}),
    fs.readFile(VOICE_FILE, "utf8"),
  ]);
  const books = activity.goodreads?.recent || [];
  const options = { cache, voiceInstructions, model };
  const plan = prepareReviewSummaryCandidates(books, options);

  if (!plan.candidates.length) {
    console.log(`All written Goodreads reviews already have current ${model} summaries`);
    return;
  }

  console.log(`Asking ${model} on localhost for ${plan.candidates.length} review ${plan.candidates.length === 1 ? "summary" : "summaries"}`);
  const batch = buildReviewSummaryBatchRequest(plan.candidates, { voiceInstructions, model });
  const response = await callLocalReviewModel({
    systemPrompt: batch.systemPrompt,
    prompt: batch.prompt,
    model,
    baseUrl,
    allowRemote,
  });
  const result = mergeReviewSummaryResults(books, response, options);

  for (const item of result.warnings) {
    console.warn(`warning: ${item.code}${item.title ? ` (${item.title})` : ""}: ${item.message}`);
  }
  if (!result.stats.generated) {
    throw new Error("The local model returned no usable Goodreads review summaries");
  }

  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, `${JSON.stringify(result.cache, null, 2)}\n`);
  console.log(`Saved ${result.stats.generated} locally generated Goodreads review ${result.stats.generated === 1 ? "summary" : "summaries"}`);
}

const invokedFile = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
