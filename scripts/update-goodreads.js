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

/* ---------- PROGRESS EXTRACTION (2.0-STABLE) ---------- */

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

/* ---------- VELOCITY + ETA ---------- */

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

function estimateETA(velocity, progress) {
  if (!velocity) return null;

  const avgPages = 350;
  const pagesPerDay = avgPages * velocity;
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

/* ---------- INSIGHTS TABLE ---------- */

function renderInsights({ progress, velocity, eta }) {
  if (!velocity && !eta && progress == null) return "";

  const rows = [];

  if (velocity) {
    rows.push(
      `| 📊 *reading velocity* | ${velocityLabel(velocity)} · ${velocity.toFixed(
        2
      )} books/day |`
    );
  }

  if (eta) {
    rows.push(
      `| ⏳ *eta* | ${eta.label} · ${eta.confidenceEmoji} ${eta.confidenceLabel} confidence |`
    );
  }

  if (progress != null) {
    rows.push(
      `| 📖 *progress* | ${progress}% · ${progressBar(progress)} |`
    );
  }

  return `
| | |
|---|---|
${rows.join("\n")}
`;
}

/* ---------- RECENTLY FINISHED (FIXED) ---------- */

function glowForRating(rating) {
  if (rating === 5) return " ✨✨";
  if (rating === 4) return " ✨";
  return "";
}

function ratingLabel(rating) {
  switch (rating) {
    case 5:
      return "literally obsesseddd !!! 😝";
    case 4:
      return "this one cooked 🤭";
    case 3:
      return "mixed feelings / good ish 🫠";
    case 2:
      return "not for me 😟";
    case 1:
      return "straight to jailll 😦";
    default:
      return "no rating yet ❌";
  }
}

function renderSpotlight(items) {
  if (!items.length) return "";

  const book = items[0];
  const rating = parseInt(book.user_rating?.[0] || "0", 10);
  const stars = rating ? "★".repeat(rating) : "";
  const glow = glowForRating(rating);

  return `${pulseSymbol()} recently finished

<table>
  <tr>
    <td style="padding:14px; border:1px solid rgba(255,255,255,0.14); border-radius:14px;">
      <strong>📕 <a href="${book.link}">${book.title}</a></strong><br/>
      <sub>${book.author_name}</sub><br/><br/>
      ${stars}${glow} — ${ratingLabel(rating)}
    </td>
  </tr>
</table>`;
}

/* ---------- RECENT READS ---------- */

function renderRead(items) {
  const books = items.slice(0, MAX_READ);
  if (!books.length) return "_No recently read books_";

  const cells = books.map((b) => {
    const r = parseInt(b.user_rating?.[0] || "0", 10);
    const glow = r >= 4 ? " ✨" : "";
    return `
<td style="padding:12px; vertical-align:top;">
  <div style="border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px;">
    <strong>📘 <a href="${b.link}">${b.title}</a></strong><br/>
    <sub>${b.author_name}</sub><br/>
    ⭐ ${r}${glow}
  </div>
</td>`;
  });

  const rows = [];
  for (let i = 0; i < cells.length; i += 3) {
    rows.push(`<tr>${cells.slice(i, i + 3).join("")}</tr>`);
  }

  return `<table><tbody>${rows.join("")}</tbody></table>`;
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

  const velocity = computeVelocity(readItems);
  const eta = estimateETA(velocity, progress);

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
    renderInsights({ progress, velocity, eta })
  );

  readme = replaceSection(
    readme,
    "GOODREADS-SPOTLIGHT",
    renderSpotlight(readItems)
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
  console.log("✨ README updated (v2.1 – final)");
})();
