import fs from "fs";
import https from "https";
import { parseStringPromise } from "xml2js";

const USER_ID = "178629903";
const MAX_READ = 5;

const feeds = {
  currentlyReading: `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=currently-reading`,
  read: `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=read`,
};

/**
 * Fetch URL as text with headers Goodreads accepts
 */
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

/**
 * Safely parse RSS
 */
async function safeParse(xml, label) {
  if (!xml || !xml.trim().startsWith("<")) {
    console.warn(`⚠️ ${label}: response is not XML, skipping`);
    return null;
  }

  if (!xml.includes("<rss")) {
    console.warn(`⚠️ ${label}: response is not RSS, skipping`);
    return null;
  }

  try {
    return await parseStringPromise(xml);
  } catch {
    console.warn(`⚠️ ${label}: XML parse failed, skipping`);
    return null;
  }
}

/**
 * Render currently reading
 */
function renderCurrentlyReading(items) {
  if (!items || !items.length) {
    return "_Not currently reading anything_";
  }

  const book = items[0];
  return `**📖 [${book.title}](${book.link}) by ${book.author_name}**`;
}

/**
 * Render read books (with spaced stars)
 */
function renderRead(items) {
  if (!items || !items.length) {
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

/**
 * Replace section between markers
 */
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

/**
 * Render last updated timestamp
 */
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

(async function main() {
  console.log("📚 Fetching Goodreads RSS feeds…");

  const [currentlyXML, readXML] = await Promise.all([
    fetch(feeds.currentlyReading),
    fetch(feeds.read),
  ]);

  const currentlyParsed = await safeParse(
    currentlyXML,
    "currently-reading"
  );
  const readParsed = await safeParse(readXML, "read");

  const currentlyItems =
    currentlyParsed?.rss?.channel?.[0]?.item ?? [];
  const readItems =
    readParsed?.rss?.channel?.[0]?.item ?? [];

  console.log(`📖 Currently reading: ${currentlyItems.length}`);
  console.log(`📚 Recently read: ${readItems.length}`);

  let readme = fs.readFileSync("README.md", "utf8");

  readme = replaceSection(
    readme,
    "CURRENTLY-READING-LIST",
    renderCurrentlyReading(currentlyItems)
  );

  readme = replaceSection(
    readme,
    "GOODREADS-LIST",
    renderRead(readItems)
  );

  readme = replaceSection(
    readme,
    "GOODREADS-LAST-UPDATED",
    renderLastUpdated()
  );

  fs.writeFileSync("README.md", readme);

  console.log("✅ README updated successfully");
})();
