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
  const filled = Math.round((percent / 100) * total);
  return "▰".repeat(filled) + "▱".repeat(total - filled);
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

function extractProgressFromReviewPage(html) {
  if (!html) return null;

  const percentMatch = html.match(/(\d+)%/);
  const pagesMatch = html.match(/(\d+)\s*\/\s*(\d+)/);

  if (!percentMatch || !pagesMatch) return null;

  const percent = parseInt(percentMatch[1], 10);
  const current = parseInt(pagesMatch[1], 10);
  const total = parseInt(pagesMatch[2], 10);

  if (
    !Number.isFinite(percent) ||
    !Number.isFinite(current) ||
    !Number.isFinite(total) ||
    percent > 100 ||
    current > total
  ) {
    return null;
  }

  return { percent, current, total };
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

function renderProgress(progress) {
  if (!progress) {
    return "▱▱▱▱▱▱▱▱▱▱ _in progress…_";
  }

  const bar = progressBar(progress.percent);

  return `${bar} ${progress.percent}%
page ${progress.current}/${progress.total}`;
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

  let progress = null;

  if (currentlyItems.length) {
    const reviewLink = currentlyItems[0].link?.[0];
    const reviewHTML = await fetch(reviewLink);
    progress = extractProgressFromReviewPage(reviewHTML);
  }

  let readme = fs.readFileSync("README.md", "utf8");

  const sections = {
    "GOODREADS-SPOTLIGHT": renderSpotlight(readItems),
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
