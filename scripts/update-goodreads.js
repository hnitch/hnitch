import fs from "fs";
import https from "https";
import { parseStringPromise } from "xml2js";

const USER_ID = "178629903";
const MAX_READ = 6;

/* ---------- FEEDS ---------- */

const feeds = {
  currentlyReading: `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=currently-reading`,
  read: `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=read`,
};

/* ---------- FETCH ---------- */

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; GitHubActions/1.0; +https://github.com/)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
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

/* ---------- HELPERS ---------- */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function pulseSymbol() {
  const frames = ["✨", "💫", "✦"];
  return frames[new Date().getMinutes() % frames.length];
}

function progressBar(percent) {
  const total = 10;
  const filled = clamp(Math.round((percent / 100) * total), 0, total);
  const pulse = ["▰", "▮"][new Date().getMinutes() % 2];
  return pulse.repeat(filled) + "▱".repeat(total - filled);
}

/* ---------- PROGRESS EXTRACTION (STABLE) ---------- */

function extractNumberFromString(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{1,3})\s*%/);
  return m ? parseInt(m[1], 10) : null;
}

function extractProgressFromItem(item) {
  if (!item) return null;

  const fields = [
    item.user_reading_progress?.[0],
    item.user_progress?.[0],
    item.progress?.[0],
    item["gd:progress"]?.[0],
    item["atom:progress"]?.[0],
    item["media:progress"]?.[0],
  ];

  for (const f of fields) {
    if (!f) continue;
    const val = typeof f === "object" ? f._ : f;
    const n = extractNumberFromString(val);
    if (n != null) return n;
  }

  const text =
    item.description?.[0] ||
    item["content:encoded"]?.[0] ||
    item.title?.[0] ||
    "";

  return extractNumberFromString(text);
}

/* ---------- READING PACE (REWORKED) ---------- */

function computeReadingPace(readItems) {
  const now = Date.now();
  const WINDOW = 1000 * 60 * 60 * 24 * 30; // 30 days

  const recent = readItems.filter((b) => {
    const t = new Date(b.pubDate?.[0]).getTime();
    return now - t <= WINDOW;
  });

  if (!recent.length) return null;

  const booksPerMonth = recent.length;

  let label;
  if (booksPerMonth >= 12) label = "on a roll 🔥";
  else if (booksPerMonth >= 6) label = "actively reading 📖";
  else if (booksPerMonth >= 3) label = "casual pace 🐢";
  else label = "slow burn 💤";

  return { booksPerMonth, label };
}

/* ---------- ETA ---------- */

function estimateETA(pace, progress) {
  if (!pace) return null;

  const avgPages = 350;
  const pagesPerDay = (pace.booksPerMonth * avgPages) / 30;

  const remaining =
    progress != null ? avgPages * (1 - progress / 100) : avgPages * 0.5;

  const days = clamp(remaining / pagesPerDay, 0.5, 14);

  let label;
  if (days < 1) label = "today / tomorrow";
  else if (days < 2) label = "1–2 days";
  else if (days < 4) label = "2–4 days";
  else label = "within a week";

  return {
    label,
    confidenceEmoji: progress != null ? "🟢" : "🟡",
    confidenceLabel: progress != null ? "high" : "medium",
  };
}

/* ---------- RENDERERS ---------- */

function renderCurrentlyReading(items) {
  if (!items.length) {
    return `↳ 📖 currently reading\n\n_Not currently reading anything_`;
  }
  const b = items[0];
  return `↳ 📖 currently reading\n\n📘 **[${b.title}](${b.link}) by ${b.author_name}**`;
}

function renderProgress(items) {
  if (!items.length) return "";
  const p = extractProgressFromItem(items[0]);
  if (p == null) return "▱▱▱▱▱▱▱▱▱▱ _in progress…_";
  return `${progressBar(p)} **${p}%**`;
}

/* ---------- INSIGHTS TABLE (FIXED RENDERING) ---------- */

function renderInsights({ progress, pace, eta }) {
  if (!pace && !eta && progress == null) return "";

  const rows = [];

  if (pace) {
    rows.push(
      `| 📊 *reading pace* | ${pace.label} · ~${pace.booksPerMonth} books/month |`
    );
  }

  if (eta) {
    rows.push(
      `| ⏳ *book completion eta* | ${eta.label} · ${eta.confidenceEmoji} ${eta.confidenceLabel} confidence |`
    );
  }

  if (progress != null) {
    rows.push(
      `| 📖 *progress* | ${progress}% · ${progressBar(progress)} |`
    );
  }

  return `
| insight | details |
|---|---|
${rows.join("\n")}
`;
}

/* ---------- LAST UPDATED ---------- */

function renderLastUpdated() {
  const d = new Date();
  return `_⏳ last updated on ${d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} at ${d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  })}_`;
}

/* ---------- REPLACE ---------- */

function replaceSection(content, tag, replacement) {
  const regex = new RegExp(
    `<!-- ${tag}:START -->[\\s\\S]*?<!-- ${tag}:END -->`,
    "m"
  );
  return content.replace(
    regex,
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

  const currentlyItems = currently?.rss?.channel?.[0]?.item ?? [];
  const readItems = read?.rss?.channel?.[0]?.item ?? [];

  const progress =
    currentlyItems.length > 0
      ? extractProgressFromItem(currentlyItems[0])
      : null;

  const pace = computeReadingPace(readItems);
  const eta = estimateETA(pace, progress);

  let readme = fs.readFileSync("README.md", "utf8");

  readme = replaceSection(
    readme,
    "CURRENTLY-READING-LIST",
    renderCurrentlyReading(currentlyItems)
  );

  readme = replaceSection(
    readme,
    "GOODREADS-CURRENT-PROGRESS",
    renderProgress(currentlyItems)
  );

  readme = replaceSection(
    readme,
    "GOODREADS-READING-CARD",
    renderInsights({ progress, pace, eta })
  );

  readme = replaceSection(
    readme,
    "GOODREADS-LAST-UPDATED",
    renderLastUpdated()
  );

  fs.writeFileSync("README.md", readme);
  console.log("✨ README updated (v2.1 – final, fixed)");
})();
