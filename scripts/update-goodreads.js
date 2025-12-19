import fs from "fs";
import https from "https";
import { parseStringPromise } from "xml2js";

const USER_ID = "178629903";
const MAX_READ = 6;

const feeds = {
  currentlyReading: `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=currently-reading`,
  read: `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=read`,
};

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
        res.on("data", (chunk) => (data += chunk));
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

function pulseSymbol() {
  const frames = ["✨", "💫", "✦"];
  return frames[new Date().getMinutes() % frames.length];
}

function progressBar(percent) {
  const total = 10;
  const filled = Math.max(0, Math.min(total, Math.round((percent / 100) * total)));
  const pulse = ["▰", "▮"][new Date().getMinutes() % 2];
  return pulse.repeat(filled) + "▱".repeat(total - filled);
}

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

function extractNumberFromString(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{1,3})\s*%/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function extractProgressFromItem(item) {
  if (!item) return null;

  const tryFields = [
    item.user_reading_progress && item.user_reading_progress[0],
    item.user_progress && item.user_progress[0],
    item.progress && item.progress[0],
    item['gd:progress'] && item['gd:progress'][0],
    item['atom:progress'] && item['atom:progress'][0],
    item['media:progress'] && item['media:progress'][0],
    item['percentage'] && item['percentage'][0],
  ];

  for (const val of tryFields) {
    if (val == null) continue;
    if (typeof val === "string") {
      const n = extractNumberFromString(val);
      if (n != null) return n;
    } else if (typeof val === "object") {
      if (val._) {
        const n = extractNumberFromString(val._);
        if (n != null) return n;
      } else {
        // sometimes xml2js stores value as an array with text at [0]
        const text = Array.isArray(val) ? val[0] : null;
        const n = extractNumberFromString(text);
        if (n != null) return n;
      }
    }
  }

  const description = (item.description && item.description[0]) || (item['content:encoded'] && item['content:encoded'][0]) || "";
  const nFromDesc = extractNumberFromString(description);
  if (nFromDesc != null) return nFromDesc;

  // fallback: check title or other text fields for something like "58%"
  const otherText = (item.title && item.title[0]) || (item.link && item.link[0]) || "";
  const nFromOther = extractNumberFromString(otherText);
  if (nFromOther != null) return nFromOther;

  return null;
}

function renderSpotlight(items) {
  if (!items?.length) return "";
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

function renderCurrentlyReading(items) {
  if (!items?.length) {
    return `↳ 📖 currently reading

_Not currently reading anything_`;
  }
  const book = items[0];
  return `↳ 📖 currently reading

📘 **[${book.title}](${book.link}) by ${book.author_name}**`;
}

function renderProgress(items) {
  if (!items?.length) return "";
  const item = items[0];
  const progress = extractProgressFromItem(item);

  if (progress == null) {
    console.warn("⚠️ progress not found in RSS item; dumping parsed item for debugging (first item).");
    try {
      const sample = JSON.parse(JSON.stringify(item, (k, v) => (typeof v === "function" ? String(v) : v)));
      console.warn(JSON.stringify(sample, null, 2));
    } catch (e) {
      console.warn("failed to stringify item for debug:", e);
    }
    return "▱▱▱▱▱▱▱▱▱▱ _in progress…_";
  }

  return `${progressBar(progress)} **${progress}%**`;
}

function renderRead(items) {
  if (!items?.length) return "_No recently read books_";
  const books = items.slice(0, MAX_READ);
  const cells = books.map((book) => {
    const rating = parseInt(book.user_rating?.[0] || "0", 10);
    const glow = glowForRating(rating);
    return `
<td style="padding:12px; vertical-align:top;">
  <div style="border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px;">
    <strong>📘 <a href="${book.link}">${book.title}</a></strong><br/>
    <sub>${book.author_name}</sub><br/>
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
  const datePart = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const timePart = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
  return `_⏳ last updated on ${datePart} at ${timePart}_`;
}

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

  readme = replaceSection(
    readme,
    "GOODREADS-SPOTLIGHT",
    renderSpotlight(readItems)
  );

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
    "GOODREADS-LIST",
    `✦ 📚 recent reads\n\n${renderRead(readItems)}`
  );

  readme = replaceSection(
    readme,
    "GOODREADS-LAST-UPDATED",
    renderLastUpdated()
  );

  fs.writeFileSync("README.md", readme);
  console.log("✨ README updated");
})();