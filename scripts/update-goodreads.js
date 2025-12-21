import fs from "fs";
import https from "https";
import { parseStringPromise } from "xml2js";

const USER_ID = "178629903";
const MAX_READ = 6;
const CACHE_FILE = ".goodreads-progress-cache.json";

const feeds = {
  currentlyReading: `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=currently-reading`,
  read: `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=read`,
};

function fetch(url) {
  return new Promise((resolve) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; GitHubActions/1.0; +https://github.com/)",
            Accept: "text/html,application/rss+xml,application/xml",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve(data));
        }
      )
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
  const p = clamp(percent, 0, 100);
  const filled = Math.round((p / 100) * 10);
  return "▰".repeat(filled) + "▱".repeat(10 - filled);
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(data) {
  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify({ ...data, updatedAt: Date.now() }, null, 2)
  );
}

function getManualProgressOverride(readme) {
  const m = readme.match(/GOODREADS-PROGRESS-OVERRIDE:(\d{1,3})/);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v >= 0 && v <= 100 ? v : null;
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

  if (days <= 0) return null;

  const raw = (dates.length - 1) / days;
  return clamp(raw, 0.05, 1.2);
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
  let confidence = "medium";

  if (typeof progressPercent === "number") {
    remainingPages = avgPages * (1 - progressPercent / 100);
    confidence = "high";
  }

  const days = clamp(remainingPages / pagesPerDay, 0.5, 14);

  let label;
  if (days < 1) label = "today / tomorrow";
  else if (days < 2) label = "1–2 days";
  else if (days < 4) label = "2–4 days";
  else if (days < 7) label = "within a week";
  else label = "1–2 weeks";

  return { label, confidence };
}

/* ---------- PROGRESS ---------- */

async function renderProgress(item, readme, cache) {
  const manual = getManualProgressOverride(readme);
  if (manual != null) {
    saveCache({ percent: manual, source: "manual" });
    return {
      percent: manual,
      label: `manual override`,
    };
  }

  if (cache.percent != null) {
    return {
      percent: cache.percent,
      label: `inferred (${cache.source})`,
    };
  }

  return null;
}

/* ---------- RENDER ---------- */

function renderCurrentlyReading(item) {
  if (!item) {
    return `↳ 📖 currently reading\n\n_Not currently reading anything_`;
  }
  return `↳ 📖 currently reading\n\n📘 **[${item.title}](${item.link}) by ${item.author_name}**`;
}

function renderVelocity(v) {
  if (!v) return "_velocity unknown_";
  return `**reading velocity:** ${velocityLabel(v)} (${v.toFixed(2)} books/day)`;
}

function renderETA(eta) {
  if (!eta) return "_ETA unavailable_";
  return `**ETA:** ${eta.label} · ${eta.confidence} confidence`;
}

function renderLastUpdated() {
  return `_⏳ last updated on ${new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  })}_`;
}

function replaceSection(content, tag, replacement) {
  return content.replace(
    new RegExp(`<!-- ${tag}:START -->[\\s\\S]*?<!-- ${tag}:END -->`, "m"),
    `<!-- ${tag}:START -->\n${replacement}\n<!-- ${tag}:END -->`
  );
}

/* ---------- MAIN ---------- */

(async function main() {
  const [currentlyXML, readXML] = await Promise.all([
    fetch(feeds.currentlyReading),
    fetch(feeds.read),
  ]);

  const currently = await safeParse(currentlyXML);
  const read = await safeParse(readXML);

  const currentlyItem = currently?.rss?.channel?.[0]?.item?.[0];
  const readItems = read?.rss?.channel?.[0]?.item ?? [];

  let readme = fs.readFileSync("README.md", "utf8");
  const cache = loadCache();

  const velocity = computeVelocity(readItems);
  const progress = await renderProgress(currentlyItem, readme, cache);
  const eta = estimateETA(velocity, progress?.percent);

  readme = replaceSection(
    readme,
    "CURRENTLY-READING-LIST",
    renderCurrentlyReading(currentlyItem)
  );

  readme = replaceSection(
    readme,
    "GOODREADS-CURRENT-PROGRESS",
    progress
      ? `${progressBar(progress.percent)} **${progress.percent}% · ${progress.label}**`
      : "▱▱▱▱▱▱▱▱▱▱ _in progress…_"
  );

  readme = replaceSection(readme, "GOODREADS-VELOCITY", renderVelocity(velocity));
  readme = replaceSection(readme, "GOODREADS-ETA", renderETA(eta));
  readme = replaceSection(readme, "GOODREADS-LAST-UPDATED", renderLastUpdated());

  fs.writeFileSync("README.md", readme);
  console.log("✨ README updated (v2.1)");
})();
