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

async function safeParse(xml) {
  if (!xml || !xml.includes("<rss")) return null;
  try {
    return await parseStringPromise(xml);
  } catch {
    return null;
  }
}

function pulseSymbol() {
  const frames = ["✨", "💫", "✦", "✧"];
  return frames[new Date().getMinutes() % frames.length];
}

function readingArrow() {
  const frames = ["↳", "↠", "⇢"];
  return frames[new Date().getMinutes() % frames.length];
}

function progressBar(percent) {
  const total = 10;
  const filled = Math.round((percent / 100) * total);
  const pulse = ["▰", "▮"][new Date().getMinutes() % 2];
  return pulse.repeat(filled) + "▱".repeat(total - filled);
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
  if (!items?.length) return "";

  const book = items[0];
  const rating = parseInt(book.user_rating?.[0] || "0", 10);
  const stars = rating ? "★".repeat(rating) : "";
  const label = ratingLabel(rating);

  return `${pulseSymbol()} recently finished

📕 **[${book.title}](${book.link})**  
by ${book.author_name}  
${stars} — ${label}`;
}

function renderCurrentlyReading(items) {
  if (!items?.length) {
    return `${readingArrow()} 📖 currently reading

_Not currently reading anything_`;
  }

  const book = items[0];
  return `${readingArrow()} 📖 currently reading

📘 **[${book.title}](${book.link}) by ${book.author_name}**`;
}

function renderProgress(items) {
  if (!items?.length) return "";

  const raw = items[0].user_reading_progress?.[0];
  const progress = parseInt(raw || "0", 10);

  if (!progress) {
    return "▱▱▱▱▱▱▱▱▱▱ _in progress…_";
  }

  return `${progressBar(progress)} **${progress}%**`;
}

function renderRead(items) {
  if (!items?.length) return "_No recently read books_";

  return items
    .slice(0, MAX_READ)
    .map((book) => {
      const rating = parseInt(book.user_rating?.[0] || "0", 10);
      const glow = rating === 5 ? ` ${pulseSymbol()}` : "";
      return `• [${book.title}](${book.link}) by ${book.author_name} ( ⭐ ${rating} )${glow}`;
    })
    .join("\n");
}

function renderLastUpdated() {
  const diffMs = Date.now() - Date.now();

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let label = "just now";

  if (minutes >= 1 && minutes < 60) {
    label = `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  } else if (hours >= 1 && hours < 24) {
    label = `${hours} hour${hours === 1 ? "" : "s"} ago`;
  } else if (days >= 1) {
    label = `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return `_⏳ updated ${label}_`;
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
})();
