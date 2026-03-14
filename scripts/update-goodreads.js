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
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
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

function progressBar(percent) {
  const total = 10;
  const filled = Math.round((percent / 100) * total);
  return "▰".repeat(filled) + "▱".repeat(total - filled);
}

function extractProgress(description) {
  if (!description) return null;

  const match = description.match(/read\s*(\d+)\s*of\s*(\d+)/i);
  if (!match) return null;

  const current = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  const percent = Math.round((current / total) * 100);

  return { current, total, percent };
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

function renderProgress(progress) {
  if (!progress) return "▱▱▱▱▱▱▱▱▱▱ _in progress…_";

  const bar = progressBar(progress.percent);

  return `${bar} ${progress.percent}%
page ${progress.current}/${progress.total}`;
}

function renderRead(items) {
  if (!items?.length) return "_No recently read books_";

  const books = items.slice(0, MAX_READ);

  const cells = books.map((book) => {
    const rating = parseInt(book.user_rating?.[0] || "0", 10);

    return `
<td style="padding:12px; vertical-align:top;">
<div style="border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px;">
<strong>📘 <a href="${book.link}">${book.title}</a></strong><br/>
<sub>${book.author_name}</sub><br/>
⭐ ${rating}
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
  const regex = new RegExp(`<!-- ${tag}:START -->[\\s\\S]*?<!-- ${tag}:END -->`, "m");

  return content.replace(regex, `<!-- ${tag}:START -->\n${replacement}\n<!-- ${tag}:END -->`);
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

  let progress = null;

  if (currentlyItems.length) {
    const description = currentlyItems[0].description?.[0] || "";
    progress = extractProgress(description);
  }

  let readme = fs.readFileSync("README.md", "utf8");

  const sections = {
    "CURRENTLY-READING-LIST": renderCurrentlyReading(currentlyItems),
    "GOODREADS-CURRENT-PROGRESS": renderProgress(progress),
    "GOODREADS-LIST": `✦ 📚 recent reads\n\n${renderRead(readItems)}`,
    "GOODREADS-LAST-UPDATED": renderLastUpdated(),
  };

  for (const tag in sections) {
    readme = replaceSection(readme, tag, sections[tag]);
  }

  fs.writeFileSync("README.md", readme);

  console.log("✨ README updated");
})();
