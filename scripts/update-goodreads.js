import fs from "fs";
import https from "https";
import { parseStringPromise } from "xml2js";

const USER_ID = "178629903";
const MAX_READ = 6;

const feeds = {
  currentlyReading: `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=currently-reading`,
  read: `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=read`,
};

const shelfPage = `https://www.goodreads.com/review/list/${USER_ID}?shelf=currently-reading`;

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
  const filled = Math.max(
    0,
    Math.min(total, Math.round((percent / 100) * total))
  );
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

function extractPageProgress(s) {
  if (!s) return null;

  const str = String(s);
  const match = str.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i);

  if (!match) return null;

  const current = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);

  if (!current || !total) return null;

  const percent = Math.round((current / total) * 100);

  return { current, total, percent };
}

function extractProgressFromItem(item) {
  if (!item) return null;

  const tryFields = [
    item.user_reading_progress && item.user_reading_progress[0],
    item.user_progress && item.user_progress[0],
    item.progress && item.progress[0],
    item["gd:progress"] && item["gd:progress"][0],
    item["atom:progress"] && item["atom:progress"][0],
    item["media:progress"] && item["media:progress"][0],
    item["percentage"] && item["percentage"][0],
    item.description && item.description[0],
    item["content:encoded"] && item["content:encoded"][0],
  ];

  for (const val of tryFields) {
    if (!val) continue;

    const page = extractPageProgress(val);
    if (page) return page;

    const percent = extractNumberFromString(val);
    if (percent != null) return { percent };
  }

  return null;
}

function extractProgressFromHTML(html) {
  if (!html) return null;

  const matches = [...html.matchAll(/page\s+(\d+)\s+of\s+(\d+)/gi)];

  for (const match of matches) {
    const current = parseInt(match[1], 10);
    const total = parseInt(match[2], 10);

    if (
      current > 0 &&
      total > 0 &&
      current <= total &&
      total < 5000
    ) {
      const percent = Math.round((current / total) * 100);
      return { current, total, percent };
    }
  }

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

function renderProgress(items, shelfHTML) {
  if (!items?.length) return "";

  const item = items[0];

  let progress = extractProgressFromItem(item);

  if (!progress && shelfHTML) {
    progress = extractProgressFromHTML(shelfHTML);
  }

  if (!progress) {
    return "▱▱▱▱▱▱▱▱▱▱ _in progress…_";
  }

  const percent = progress.percent;
  const bar = progressBar(percent);

  if (progress.current && progress.total) {
    return `${bar} ${percent}%
page ${progress.current} / ${progress.total}`;
  }

  return `${bar} ${percent}%`;
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
  const [currentlyXML, readXML, shelfHTML] = await Promise.all([
    fetch(feeds.currentlyReading),
    fetch(feeds.read),
    fetch(shelfPage),
  ]);

  const currently = await safeParse(currentlyXML);
  const read = await safeParse(readXML);

  const currentlyItems = currently?.rss?.channel?.[0]?.item ?? [];
  const readItems = read?.rss?.channel?.[0]?.item ?? [];

  let readme = fs.readFileSync("README.md", "utf8");

  const sections = {
    "GOODREADS-SPOTLIGHT": renderSpotlight(readItems),
    "CURRENTLY-READING-LIST": renderCurrentlyReading(currentlyItems),
    "GOODREADS-CURRENT-PROGRESS": renderProgress(currentlyItems, shelfHTML),
    "GOODREADS-LIST": `✦ 📚 recent reads\n\n${renderRead(readItems)}`,
    "GOODREADS-LAST-UPDATED": renderLastUpdated(),
  };

  for (const tag in sections) {
    readme = replaceSection(readme, tag, sections[tag]);
  }

  fs.writeFileSync("README.md", readme);

  console.log("✨ README updated");
})();
