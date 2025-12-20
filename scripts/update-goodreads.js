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
    https
      .get(
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
      )
      .on("error", reject);
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

function getManualProgressOverride(readme) {
  const match = readme.match(
    /<!--\s*GOODREADS-PROGRESS-OVERRIDE:(\d{1,3})\s*-->/
  );
  if (!match) return null;
  const value = parseInt(match[1], 10);
  if (value < 0 || value > 100) return null;
  return value;
}

function extractNumberFromString(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{1,3})\s*%/);
  return m ? parseInt(m[1], 10) : null;
}

function extractProgressFromItem(item) {
  if (!item) return null;

  const fields = [
    item.user_reading_progress?.[0],
    item.progress?.[0],
    item["gd:progress"]?.[0],
    item.description?.[0],
    item["content:encoded"]?.[0],
  ];

  for (const val of fields) {
    const n = extractNumberFromString(val);
    if (n != null) return n;
  }

  return null;
}

async function scrapeProgressFromReviewPage(reviewUrl) {
  try {
    const html = await fetch(reviewUrl);
    if (!html) return null;

    const percentMatch = html.match(/(\d{1,3})\s*%/);
    if (percentMatch) {
      const value = parseInt(percentMatch[1], 10);
      if (value >= 0 && value <= 100) return value;
    }

    const fractionMatch = html.match(/(\d+)\s*\/\s*(\d+)/);
    if (fractionMatch) {
      const current = parseInt(fractionMatch[1], 10);
      const total = parseInt(fractionMatch[2], 10);
      if (total > 0) return Math.round((current / total) * 100);
    }

    return null;
  } catch {
    return null;
  }
}

function renderSpotlight(items) {
  if (!items?.length) return "";

  const book = items[0];
  const rating = parseInt(book.user_rating?.[0] || "0", 10);
  const stars = rating ? "★".repeat(rating) : "";
  const glow = glowForRating(rating);

  return `${pulseSymbol()} 📕 recently finished

<br/>

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

async function renderProgress(items, manualOverride) {
  if (!items?.length) return "";

  if (manualOverride != null) {
    return `${progressBar(manualOverride)} **${manualOverride}%**`;
  }

  const item = items[0];
  const reviewUrl = item?.link?.[0];

  if (reviewUrl) {
    const scraped = await scrapeProgressFromReviewPage(reviewUrl);
    if (scraped != null) {
      return `${progressBar(scraped)} **${scraped}%**`;
    }
  }

  const rssProgress = extractProgressFromItem(item);
  if (rssProgress != null) {
    return `${progressBar(rssProgress)} **${rssProgress}%**`;
  }

  return "▱▱▱▱▱▱▱▱▱▱ _in progress…_";
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

  const manualProgress = getManualProgressOverride(readme);
  const progressMarkup = await renderProgress(
    currentlyItems,
    manualProgress
  );

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
})();
