import fs from "node:fs/promises";
import path from "node:path";
import { parseStringPromise } from "xml2js";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "assets", "activity");
const DATA_FILE = path.join(ROOT, "data", "activity.json");
const README_FILE = path.join(ROOT, "README.md");

const SOURCES = {
  goodreads: {
    current: "https://www.goodreads.com/review/list_rss/178629903?shelf=currently-reading",
    read: "https://www.goodreads.com/review/list_rss/178629903?shelf=read",
  },
  letterboxd: "https://letterboxd.com/hnitch/rss/",
  appleMusic: "https://music-profile.rayriffy.com/theme/dark.svg?uid=000568.fa0178bfed7a4356a5b20a996b4824a4.1200",
};

const theme = {
  bg: "#151120",
  panel: "#211832",
  panelSoft: "#282039",
  line: "#403454",
  text: "#fffaf5",
  muted: "#bdb1ca",
  lavender: "#b9a4ff",
  mint: "#8edfd4",
  yellow: "#ffe58c",
  coral: "#ff9f9a",
};

function decode(value = "") {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&#039;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function escapeXml(value = "") {
  return decode(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml, image/svg+xml",
      "User-Agent": "hnitch-profile/3.1 (+https://github.com/hnitch/hnitch)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normaliseBook(item = {}) {
  return {
    title: decode(first(item.title)),
    author: decode(first(item.author_name)),
    link: decode(first(item.link)),
    rating: Number(first(item.user_rating)) || 0,
  };
}

async function readGoodreads() {
  const [currentXml, readXml] = await Promise.all([
    fetchText(SOURCES.goodreads.current),
    fetchText(SOURCES.goodreads.read),
  ]);
  const [currentFeed, readFeed] = await Promise.all([
    parseStringPromise(currentXml),
    parseStringPromise(readXml),
  ]);
  const currentItems = currentFeed?.rss?.channel?.[0]?.item ?? [];
  const readItems = readFeed?.rss?.channel?.[0]?.item ?? [];
  return {
    current: currentItems[0] ? normaliseBook(currentItems[0]) : null,
    recent: readItems.slice(0, 4).map(normaliseBook),
  };
}

function normaliseFilm(item = {}) {
  return {
    title: decode(first(item["letterboxd:filmTitle"]) || first(item.title)),
    year: decode(first(item["letterboxd:filmYear"])),
    rating: Number(first(item["letterboxd:memberRating"])) || 0,
    liked: first(item["letterboxd:memberLike"]) === "Yes",
    link: decode(first(item.link)),
  };
}

async function readLetterboxd() {
  const feed = await parseStringPromise(await fetchText(SOURCES.letterboxd));
  const items = feed?.rss?.channel?.[0]?.item ?? [];
  const seen = new Set();
  const recent = [];
  for (const item of items) {
    const film = normaliseFilm(item);
    const key = `${film.title}:${film.year}`;
    if (!film.title || seen.has(key)) continue;
    seen.add(key);
    recent.push(film);
    if (recent.length === 4) break;
  }
  return { recent };
}

async function readAppleMusic() {
  const svg = await fetchText(SOURCES.appleMusic);
  const title = svg.match(/class="song-title[^>]*>([^<]+)</)?.[1];
  const artist = svg.match(/class="song-artist[^>]*>([^<]+)</)?.[1];
  if (!title || !artist) throw new Error("Apple Music card did not contain track metadata");
  return { title: decode(title), artist: decode(artist) };
}

function stars(rating) {
  if (!rating) return "unrated";
  return `${"★".repeat(Math.floor(rating))}${rating % 1 ? "½" : ""}`;
}

function foreignText({ x, y, width, height, value, size, weight = 600, color = theme.text, lineHeight = 1.2, align = "left" }) {
  return `<foreignObject x="${x}" y="${y}" width="${width}" height="${height}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:${size}px;font-weight:${weight};line-height:${lineHeight};color:${color};text-align:${align};overflow-wrap:anywhere;word-break:normal;">${escapeXml(value)}</div>
  </foreignObject>`;
}

function svgShell({ label, accent, body, height = 450, wide = false }) {
  const width = wide ? 860 : 420;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.bg}"/><stop offset="1" stop-color="${theme.panel}"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".25"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}.pulse{animation:pulse 3s ease-in-out infinite}@keyframes pulse{50%{opacity:.4}}</style>
  </defs>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="23" fill="url(#bg)" stroke="${theme.line}" stroke-width="2"/>
  <circle cx="${width - 12}" cy="12" r="120" fill="url(#glow)"/>
  ${body}
</svg>`;
}

function renderReading(data) {
  const current = data.current;
  const rows = data.recent.map((book, index) => {
    const y = 236 + index * 54;
    return `<rect x="20" y="${y - 11}" width="380" height="48" rx="12" fill="${index % 2 ? theme.panelSoft : "#251d35"}" opacity=".78"/>
    ${foreignText({ x: 35, y: y - 1, width: 274, height: 38, value: book.title, size: 12.5, weight: 650, lineHeight: 1.18 })}
    <text x="385" y="${y + 17}" fill="${theme.yellow}" class="sans" font-size="11" font-weight="700" text-anchor="end">${escapeXml(stars(book.rating))}</text>`;
  }).join("\n");

  const currentTitle = current?.title || "between books";
  const currentAuthor = current ? `by ${current.author}` : "the next obsession is loading";
  const body = `<g class="sans">
    <text x="24" y="38" fill="${theme.mint}" font-size="11" font-weight="800" letter-spacing="1.7">GOODREADS / NOW READING</text>
    <g transform="translate(25 69)"><rect width="35" height="76" rx="6" fill="${theme.mint}" opacity=".15" stroke="${theme.mint}"/><path d="M11 0v76" stroke="${theme.mint}" opacity=".5"/><path d="M18 22h9M18 30h9" stroke="${theme.mint}" stroke-width="2" stroke-linecap="round"/></g>
    ${foreignText({ x: 76, y: 67, width: 315, height: 79, value: currentTitle, size: 21, weight: 800, lineHeight: 1.08 })}
    <text x="77" y="164" fill="${theme.muted}" font-size="12.5" font-weight="550">${escapeXml(currentAuthor)}</text>
    <path d="M24 184h372" stroke="${theme.line}"/>
    <text x="24" y="204" fill="${theme.lavender}" font-size="10" font-weight="800" letter-spacing="1.5">RECENTLY SHELVED</text>
    ${rows}
    <text x="24" y="468" fill="${theme.muted}" font-size="9.5" font-weight="600">tap the card. inspect the reading receipts.</text>
  </g>`;
  return svgShell({ label: "hn's Goodreads activity", accent: theme.mint, body, height: 485 });
}

function renderWatching(data) {
  const rows = data.recent.map((film, index) => {
    const y = 71 + index * 87;
    return `<rect x="20" y="${y - 12}" width="380" height="75" rx="14" fill="${index % 2 ? theme.panelSoft : "#251d35"}" opacity=".78"/>
    <circle cx="38" cy="${y + 7}" r="5" fill="${film.liked ? theme.coral : theme.lavender}"/>
    ${foreignText({ x: 54, y: y - 1, width: 275, height: 46, value: film.title, size: 14, weight: 750, lineHeight: 1.12 })}
    <text x="54" y="${y + 50}" fill="${theme.muted}" class="sans" font-size="10.5" font-weight="600">${escapeXml(film.year)}${film.liked ? "  ·  loved" : ""}</text>
    <text x="385" y="${y + 25}" fill="${theme.yellow}" class="sans" font-size="11" font-weight="750" text-anchor="end">${escapeXml(stars(film.rating))}</text>`;
  }).join("\n");

  const body = `<g class="sans">
    <text x="24" y="38" fill="${theme.lavender}" font-size="11" font-weight="800" letter-spacing="1.7">LETTERBOXD / THE WATCH LOG</text>
    <path d="M334 22h62v22h-62z" fill="none" stroke="${theme.lavender}" stroke-opacity=".45"/><path d="M346 22v22M359 22v22M372 22v22M385 22v22" stroke="${theme.lavender}" stroke-opacity=".35"/>
    ${rows}
    <text x="24" y="468" fill="${theme.muted}" font-size="9.5" font-weight="600">ratings were made with feelings, not science.</text>
  </g>`;
  return svgShell({ label: "hn's Letterboxd activity", accent: theme.lavender, body, height: 485 });
}

function renderListening(data) {
  const body = `<g class="sans">
    <text x="34" y="39" fill="${theme.coral}" font-size="11" font-weight="800" letter-spacing="1.8">APPLE MUSIC / CAUGHT IN THE HEADPHONES</text>
    <g class="pulse" transform="translate(40 78)" fill="${theme.lavender}"><rect y="22" width="9" height="30" rx="4.5"/><rect x="18" y="6" width="9" height="46" rx="4.5"/><rect x="36" width="9" height="52" rx="4.5"/><rect x="54" y="13" width="9" height="39" rx="4.5"/><rect x="72" y="28" width="9" height="24" rx="4.5"/></g>
    ${foreignText({ x: 148, y: 70, width: 590, height: 60, value: data.title, size: 28, weight: 820, lineHeight: 1.05 })}
    <text x="149" y="146" fill="${theme.muted}" font-size="14" font-weight="600">${escapeXml(data.artist)}</text>
    <circle cx="798" cy="104" r="30" fill="${theme.coral}" opacity=".12"/><text x="798" y="114" fill="${theme.coral}" font-size="27" font-weight="800" text-anchor="middle">♫</text>
  </g>`;
  return svgShell({ label: `${data.title} by ${data.artist}`, accent: theme.coral, body, height: 180, wide: true });
}

async function readPrevious() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function withFallback(name, reader, previous) {
  try {
    return await reader();
  } catch (error) {
    if (previous[name]) {
      console.warn(`warning: ${name} refresh failed; keeping the last good data (${error.message})`);
      return previous[name];
    }
    throw error;
  }
}

function dataChanged(previous, current) {
  const previousActivity = {
    goodreads: previous.goodreads,
    letterboxd: previous.letterboxd,
    appleMusic: previous.appleMusic,
  };
  return JSON.stringify(previousActivity) !== JSON.stringify(current);
}

async function updateReadme(updatedAt) {
  const readme = await fs.readFile(README_FILE, "utf8");
  const marker = /<!-- PROFILE-LAST-UPDATED:START -->[\s\S]*?<!-- PROFILE-LAST-UPDATED:END -->/;
  if (!marker.test(readme)) throw new Error("README is missing the profile update markers");
  const replacement = `<!-- PROFILE-LAST-UPDATED:START -->\n    <relative-time datetime="${updatedAt}">a few seconds ago</relative-time>\n    <!-- PROFILE-LAST-UPDATED:END -->`;
  await fs.writeFile(README_FILE, readme.replace(marker, replacement));
}

async function main() {
  const previous = await readPrevious();
  const [goodreads, letterboxd, appleMusic] = await Promise.all([
    withFallback("goodreads", readGoodreads, previous),
    withFallback("letterboxd", readLetterboxd, previous),
    withFallback("appleMusic", readAppleMusic, previous),
  ]);
  const current = { goodreads, letterboxd, appleMusic };
  const updatedAt = dataChanged(previous, current) || !previous.updatedAt
    ? new Date().toISOString()
    : previous.updatedAt;
  const activity = { ...current, updatedAt };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(OUTPUT_DIR, "reading.svg"), renderReading(goodreads)),
    fs.writeFile(path.join(OUTPUT_DIR, "watching.svg"), renderWatching(letterboxd)),
    fs.writeFile(path.join(OUTPUT_DIR, "listening.svg"), renderListening(appleMusic)),
    fs.writeFile(DATA_FILE, `${JSON.stringify(activity, null, 2)}\n`),
    updateReadme(updatedAt),
  ]);
  console.log("profile activity refreshed ✨");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
