import fs from "fs";
import https from "https";
import { parseStringPromise } from "xml2js";

const USER_ID = "178629903";
const MAX_READ = 5;

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

async function safeParse(xml, label) {
  if (!xml || !xml.includes("<rss")) {
    console.warn(`⚠️ ${label}: invalid RSS`);
    return null;
  }
  try {
    return await parseStringPromise(xml);
  } catch {
    console.warn(`⚠️ ${label}: parse failed`);
    return null;
  }
}

/* ─────────── helpers ─────────── */

function progressBar(percent) {
  const total = 10;
  const filled = Math.round((percent / 100) * total);
  return "▰".repeat(filled) + "▱".repeat(total - filled);
}

function animatedDivider() {
  return "⋆｡˚ 📚 ⋆｡˚";
}

/* ─────────── renderers ─────────── */

function renderCurrentlyReading(items) {
  if (!items?.length) {
    return "_Not currently reading anything_";
  }

  const book = items[0];
  return `**📖 [${book.title}](${book.link}) by ${book.author_name}**`;
}

function renderProgress(items) {
  if (!items?.length) return "";

  const book = items[0];
  const progress = parseInt(book.user_reading_progress?.[0] || "0", 10);

  if (!progress) return "";

  return `\n${progressBar(progress)} **${progress}%**`;
}

function renderRead(items) {
  if (!items?.length) {
    return "_No recently read books_";
  }

  return items
    .slice(0, MAX_READ)
    .map((book) => {
      const rating = book.user_rating?.[0]
        ? `( ⭐ ${book.user_rating[0]} )`
        : "";
      return `- [${book.title}](${book.link}) by ${book.author_name} ${rating}`;
    })
    .join("\n");
}

function renderLastUpdated() {
  const now = new Date().toLocaleString("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `_Last updated: ${now} UTC_`;
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

/* ─────────── main ─────────── */

(async function main() {
  console.log("📚 Updating Goodreads…");

  const [currentlyXML, readXML] = await Promise.all([
    fetch(feeds.currentlyReading),
    fetch(feeds.read),
  ]);

  const currently = await safeParse(currentlyXML, "currently-reading");
  const read = await safeParse(readXML, "read");

  const currentlyItems = currently?.rss?.channel?.[0]?.item ?? [];
  const readItems = read?.rss?.channel?.[0]?.item ?? [];

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
    "GOODREADS-LIST",
    `${animatedDivider()}\n${renderRead(readItems)}`
  );

  readme = replaceSection(
    readme,
    "GOODREADS-LAST-UPDATED",
    renderLastUpdated()
  );

  fs.writeFileSync("README.md", readme);

  console.log("✨ Goodreads updated");
})();
