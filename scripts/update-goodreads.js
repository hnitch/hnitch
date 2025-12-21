import fs from "fs";
import https from "https";
import { parseStringPromise } from "xml2js";

const USER_ID = "178629903";
const CACHE_FILE = ".goodreads-progress-cache.json";

const feeds = {
  currentlyReading: `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=currently-reading`,
  read: `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=read`,
};

function fetch(url) {
  return new Promise((resolve) => {
    https
      .get(url, { headers: { "User-Agent": "GitHubActions/1.0" } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", () => resolve(null));
  });
}

async function safeParse(xml) {
  if (!xml || !xml.includes("<rss")) return null;
  try {
    return await parseStringPromise(xml);
  } catch {
    return null;
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function progressBar(percent) {
  const filled = Math.round((percent / 100) * 10);
  return "▰".repeat(filled) + "▱".repeat(10 - filled);
}

/* ---------- CACHE ---------- */

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveCache(data) {
  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify({ ...data, updatedAt: Date.now() }, null, 2)
  );
}

/* ---------- VELOCITY ---------- */

function computeVelocity(readItems) {
  if (readItems.length < 2) return null;

  const dates = readItems
    .slice(0, 3)
    .map((b) => new Date(b.pubDate?.[0]).getTime())
    .filter(Boolean);

  if (dates.length < 2) return null;

  const days =
    (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24);

  return clamp((dates.length - 1) / days, 0.05, 1.2);
}

function velocityLabel(v) {
  if (v >= 0.7) return "locked in 🔥";
  if (v >= 0.35) return "steady 📖";
  if (v >= 0.15) return "slow 🐢";
  return "slump 💤";
}

/* ---------- ETA ---------- */

function estimateETA(velocity, progressPercent) {
  if (!velocity) return null;

  const avgPages = 350;
  const pagesPerDay = avgPages * velocity;

  let remainingPages = avgPages * 0.5;
  let confidenceEmoji = "🟡";
  let confidenceLabel = "medium";

  if (typeof progressPercent === "number") {
    remainingPages = avgPages * (1 - progressPercent / 100);
    confidenceEmoji = "🟢";
    confidenceLabel = "high";
  }

  const days = clamp(remainingPages / pagesPerDay, 0.5, 14);

  let label;
  if (days < 1) label = "today / tomorrow";
  else if (days < 2) label = "1–2 days";
  else if (days < 4) label = "2–4 days";
  else label = "within a week";

  return { label, confidenceEmoji, confidenceLabel };
}

/* ---------- RENDER TABLE ---------- */

function renderReadingTable({ progress, velocity, eta }) {
  const rows = [];

  if (velocity) {
    rows.push(
      `| **Reading velocity** | ${velocityLabel(velocity)} (${velocity.toFixed(
        2
      )} books/day) |`
    );
  }

  if (eta) {
    rows.push(
      `| **ETA** | ${eta.label} · ${eta.confidenceEmoji} ${eta.confidenceLabel} confidence |`
    );
  }

  if (progress) {
    rows.push(
      `| **Progress** | ${progress.percent}% ${progressBar(progress.percent)} |`
    );
  }

  if (!rows.length) return "";

  return `
| 📊 **Reading insights** | |
|---|---|
${rows.join("\n")}
`;
}

/* ---------- UTIL ---------- */

function replaceSection(content, tag, replacement) {
  return content.replace(
    new RegExp(`<!-- ${tag}:START -->[\\s\\S]*?<!-- ${tag}:END -->`, "m"),
    `<!-- ${tag}:START -->\n${replacement}\n<!-- ${tag}:END -->`
  );
}

function renderLastUpdated() {
  return `_⏳ last updated on ${new Date().toUTCString()}_`;
}

/* ---------- MAIN ---------- */

(async function main() {
  const readXML = await fetch(feeds.read);
  const read = await safeParse(readXML);
  const readItems = read?.rss?.channel?.[0]?.item ?? [];

  let readme = fs.readFileSync("README.md", "utf8");

  const cache = loadCache();
  const progress = cache?.percent != null ? cache : null;

  const velocity = computeVelocity(readItems);
  const eta = estimateETA(velocity, progress?.percent);

  readme = replaceSection(
    readme,
    "GOODREADS-READING-CARD",
    renderReadingTable({ progress, velocity, eta })
  );

 
  readme = replaceSection(
    readme,
    "GOODREADS-LAST-UPDATED",
    renderLastUpdated()
  );

  fs.writeFileSync("README.md", readme);
  console.log("✨ README updated (v2.1)");
})();
