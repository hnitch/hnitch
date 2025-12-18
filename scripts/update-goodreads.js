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
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function renderCurrentlyReading(items) {
  if (!items.length) return "_Not currently reading anything_";

  const book = items[0];
  return `**📖 [${book.title} ](${book.link}) by ${book.author_name}**`;
}

function renderRead(items) {
  return items.slice(0, MAX_READ).map((book) => {
    const rating = book.user_rating?.[0]
      ? `(⭐️${book.user_rating[0]})`
      : "";
    return `- [${book.title}](${book.link}) by ${book.author_name} ${rating}`;
  }).join("\n");
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

  const currently = await parseStringPromise(currentlyXML);
  const read = await parseStringPromise(readXML);

  const currentlyItems =
    currently?.rss?.channel?.[0]?.item ?? [];
  const readItems =
    read?.rss?.channel?.[0]?.item ?? [];

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

  fs.writeFileSync("README.md", readme);
})();
