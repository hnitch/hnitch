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

function loadCache() {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (typeof c.percent === "number") return c;
  } catch {}
  return null;
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

/* ---------- CARD ---------- */

function renderReadingCard({ progress, velocity, eta }) {
  if (!progress && !velocity && !eta) return "";

  const progressLine = progress
    ? `<div style="margin-bottom:12px;">
        ${progressBar(progress.percent)}
        <span style="opacity:0.9; margin-left:6px;">
          ${progress.percent}%
        </span>
      </div>`
    : "";

  const velocityLine = velocity
    ? `<div style="font-size:0.95em; opacity:0.95;">
        📊 <strong>reading velocity:</strong>
        ${velocityLabel(velocity)} (${velocity.toFixed(2)} books/day)
      </div>`
    : "";

  const etaLine = eta
    ? `<div style="margin-top:6px; font-size:0.95em; opacity:0.95;">
        ⏳ <strong>ETA:</strong>
        ${eta.label} · ${eta.confidenceEmoji} ${eta.confidenceLabel} confidence
      </div>`
    : "";

  return `
<div style="
  margin-top:18px;
  margin-bottom:26px;
  padding:18px 20px;
  border:1px solid rgba(255,255,255,0.14);
  border-radius:20px;
  background:linear-gradient(
    180deg,
    rgba(255,255,255,0.06),
    rgba(255,255,255,0.015)
  );
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.03),
    0 8px 30px rgba(0,0,0,0.35);
">
  ${progressLine}
  ${velocityLine}
  ${etaLine}
</div>`;
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

  const read = await safeParse(readXML);
  const readItems = read?.rss?.channel?.[0]?.item ?? [];

  let readme = fs.readFileSync("README.md", "utf8");

  const manual = getManualProgressOverride(readme);
  let cache = loadCache();

  let progress = null;
  if (manual != null) {
    progress = { percent: manual };
    saveCache({ percent: manual, source: "manual" });
  } else if (cache?.percent != null) {
    progress = cache;
  }

  const velocity = computeVelocity(readItems);
  const eta = estimateETA(velocity, progress?.percent);

  readme = replaceSection(
    readme,
    "GOODREADS-READING-CARD",
    renderReadingCard({ progress, velocity, eta })
  );

  fs.writeFileSync("README.md", readme);
  console.log("✨ README updated (v2.1)");
})();
