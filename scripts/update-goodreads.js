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

function progressBar(percent) {
  const total = 10;
  const filled = Math.max(
    0,
    Math.min(total, Math.round((percent / 100) * total))
  );
  return "▰".repeat(filled) + "▱".repeat(total - filled);
}

function getManualProgressOverride(readme) {
  const m = readme.match(
    /<!--\s*GOODREADS-PROGRESS-OVERRIDE:(\d{1,3})\s*-->/
  );
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v >= 0 && v <= 100 ? v : null;
}

function extractRssProgress(item) {
  const fields = [
    item.user_reading_progress?.[0],
    item.progress?.[0],
    item.description?.[0],
    item["content:encoded"]?.[0],
  ];

  for (const f of fields) {
    if (!f) continue;
    const m = String(f).match(/(\d{1,3})\s*%/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function extractPagesFromHtml(html) {
  const patterns = [
    /(\d+)\s*of\s*(\d+)\s*pages/i,
    /page\s*(\d+)\s*of\s*(\d+)/i,
    /(\d+)\s*\/\s*(\d+)/,
  ];

  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      const current = parseInt(m[1], 10);
      const total = parseInt(m[2], 10);
      if (total > 0) return { current, total };
    }
  }
  return null;
}

async function scrapeProgressFromReviewPage(reviewUrl) {
  const html = await fetch(reviewUrl);
  if (!html) return null;
  return extractPagesFromHtml(html);
}

async function renderProgress(items, manualOverride) {
  if (!items?.length) return "";

  if (manualOverride != null) {
    saveCache({ percent: manualOverride, source: "manual" });
    return `${progressBar(manualOverride)} **${manualOverride}% · manual override**`;
  }

  const cached = loadCache();
  if (cached?.percent != null && cached?.source) {
    return `${progressBar(cached.percent)} **≈${cached.percent}% · inferred (${cached.source})**`;
  }

  const item = items[0];
  const reviewUrl = item?.link?.[0];

  if (reviewUrl) {
    const pages = await scrapeProgressFromReviewPage(reviewUrl);
    if (pages) {
      const percent = Math.floor((pages.current / pages.total) * 100);
      saveCache({
        percent,
        current: pages.current,
        total: pages.total,
        source: "html",
      });
      return `${progressBar(percent)} **≈${percent}% · inferred from html**`;
    }
  }

  const rss = extractRssProgress(item);
  if (rss != null) {
    saveCache({ percent: rss, source: "rss" });
    return `${progressBar(rss)} **≈${rss}% · inferred from rss**`;
  }

  return "▱▱▱▱▱▱▱▱▱▱ _in progress…_";
}

function renderCurrentlyReading(items) {
  if (!items?.length) {
    return `↳ 📖 currently reading\n\n_Not currently reading anything_`;
  }
  const b = items[0];
  return `↳ 📖 currently reading\n\n📘 **[${b.title}](${b.link}) by ${b.author_name}**`;
}

function renderRead(items) {
  if (!items?.length) return "_No recently read books_";
  const books = items.slice(0, MAX_READ);

  const cells = books.map((b) => {
    const rating = parseInt(b.user_rating?.[0] || "0", 10);
    const glow = rating >= 4 ? " ✨" : "";
    return `
<td style="padding:12px; vertical-align:top;">
  <div style="border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px;">
    <strong>📘 <a href="${b.link}">${b.title}</a></strong><br/>
    <sub>${b.author_name}</sub><br/>
    ⭐ ${rating}${glow}
  </div>
</td>`;
  });

  const rows = [];
  for (let i = 0; i < cells.length; i += 3) {
    rows.push(`<tr>${cells.slice(i, i + 3).join("")}</tr>`);
  }

  return `<table><tbody>${rows.join("")}</tbody></table>`;
}

function renderLastUpdated() {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const time = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
  return `_⏳ last updated on ${date} at ${time}_`;
}

function replaceSection(content, tag, replacement) {
  const r = new RegExp(
    `<!-- ${tag}:START -->[\\s\\S]*?<!-- ${tag}:END -->`,
    "m"
  );
  return content.replace(
    r,
    `<!-- ${tag}:START -->\n${replacement}\n<!-- ${tag}:END -->`
  );
}

(async function main() {
  const [currentlyXML, readXML] = await Promise.all([
    fetch(feeds.currentlyReading),
    fetch(feeds.read),
  ]);

  const currently = await safeParse(currentlyXML);
  const read = await safeParse(readXML);

  const currentlyItems = currently?.rss?.channel?.[0]?.item ?? [];
  const readItems = read?.rss?.channel?.[0]?.item ?? [];

  let readme = fs.readFileSync("README.md", "utf8");
  const manual = getManualProgressOverride(readme);

  const progressMarkup = await renderProgress(currentlyItems, manual);

  readme = replaceSection(
    readme,
    "CURRENTLY-READING-LIST",
    renderCurrentlyReading(currentlyItems)
  );

  readme = replaceSection(
    readme,
    "GOODREADS-CURRENT-PROGRESS",
    progressMarkup
  );

  readme = replaceSection(
    readme,
    "GOODREADS-LIST",
    `✦ 📚 recent reads\n\n${renderRead(readItems)}`
  );

  readme = replaceSection(
    readme,
    "GOODREADS-LAST-UPDATED",
    renderLastUpdated()
  );

  fs.writeFileSync("README.md", readme);
  console.log("✨ README updated (v2.1 experimental)");
})();
