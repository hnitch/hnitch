import fs from "node:fs/promises";
import path from "node:path";
import { parseStringPromise } from "xml2js";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "assets", "activity");
const DATA_FILE = path.join(ROOT, "data", "activity.json");

const SOURCES = {
  goodreads: {
    current: "https://www.goodreads.com/review/list_rss/178629903?shelf=currently-reading",
    read: "https://www.goodreads.com/review/list_rss/178629903?shelf=read",
  },
  letterboxd: "https://letterboxd.com/hnitch/rss/",
  appleMusic: "https://music-profile.rayriffy.com/theme/dark.svg?uid=000568.fa0178bfed7a4356a5b20a996b4824a4.1200",
};

const theme = {
  bg: "#171427", panel: "#211c33", line: "#3b3153", text: "#fffaf5",
  muted: "#b9aecf", lavender: "#b9a4ff", mint: "#8edfd4",
  yellow: "#ffe58c", coral: "#ff9f9a",
};

function decode(value = "") {
  return String(value).replaceAll("&amp;", "&").replaceAll("&#039;", "'")
    .replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

function escapeXml(value = "") {
  return decode(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function shorten(value, max) {
  const clean = decode(value).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml, image/svg+xml",
      "User-Agent": "hnitch-profile/3.0 (+https://github.com/hnitch/hnitch)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function first(value) { return Array.isArray(value) ? value[0] : value; }

function normaliseBook(item = {}) {
  return {
    title: decode(first(item.title)), author: decode(first(item.author_name)),
    link: decode(first(item.link)), rating: Number(first(item.user_rating)) || 0,
  };
}

async function readGoodreads() {
  const [currentXml, readXml] = await Promise.all([
    fetchText(SOURCES.goodreads.current), fetchText(SOURCES.goodreads.read),
  ]);
  const [currentFeed, readFeed] = await Promise.all([
    parseStringPromise(currentXml), parseStringPromise(readXml),
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
  if (!rating) return "not rated";
  return `${"★".repeat(Math.floor(rating))}${rating % 1 ? "½" : ""}`;
}

function svgShell({ label, accent, body, height = 270, wide = false }) {
  const width = wide ? 860 : 420;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${theme.bg}"/><stop offset="1" stop-color="${theme.panel}"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".26"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="20" fill="url(#bg)"/>
  <circle cx="${width - 18}" cy="16" r="105" fill="url(#glow)"/>
  <rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="19.5" fill="none" stroke="${theme.line}"/>
  ${body}
</svg>`;
}

function renderReading(data) {
  const current = data.current;
  const rows = data.recent.map((book, index) => {
    const y = 174 + index * 21;
    return `<text x="28" y="${y}" fill="${theme.text}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12">${escapeXml(shorten(book.title, 35))}</text>
    <text x="392" y="${y}" fill="${theme.yellow}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" text-anchor="end">${escapeXml(stars(book.rating))}</text>`;
  }).join("\n");
  const body = `<text x="28" y="36" fill="${theme.mint}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" letter-spacing="1.6">GOODREADS / ON THE NIGHTSTAND</text>
  <text x="28" y="77" fill="${theme.text}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20" font-weight="700">${escapeXml(shorten(current?.title || "between books", 31))}</text>
  <text x="28" y="101" fill="${theme.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12">${escapeXml(current ? `by ${shorten(current.author, 40)}` : "the next obsession is loading…")}</text>
  <path d="M28 126h364" stroke="${theme.line}"/>
  <text x="28" y="151" fill="${theme.lavender}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10" letter-spacing="1.4">RECENTLY READ</text>
  ${rows}`;
  return svgShell({ label: "hn's Goodreads activity", accent: theme.mint, body });
}

function renderWatching(data) {
  const rows = data.recent.map((film, index) => {
    const y = 84 + index * 42;
    return `<circle cx="32" cy="${y - 5}" r="3" fill="${film.liked ? theme.coral : theme.lavender}"/>
    <text x="46" y="${y}" fill="${theme.text}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13" font-weight="600">${escapeXml(shorten(film.title, 29))}</text>
    <text x="46" y="${y + 16}" fill="${theme.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10">${escapeXml(film.year)}${film.liked ? "  ·  loved" : ""}</text>
    <text x="392" y="${y + 5}" fill="${theme.yellow}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" text-anchor="end">${escapeXml(stars(film.rating))}</text>`;
  }).join("\n");
  const body = `<text x="28" y="36" fill="${theme.lavender}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" letter-spacing="1.6">LETTERBOXD / RECENTLY WATCHED</text>${rows}`;
  return svgShell({ label: "hn's Letterboxd activity", accent: theme.lavender, body });
}

function renderListening(data) {
  const body = `<text x="34" y="38" fill="${theme.coral}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" letter-spacing="1.6">APPLE MUSIC / LAST HEARD</text>
  <g transform="translate(36 65)" fill="${theme.lavender}" opacity=".85"><rect x="0" y="20" width="8" height="24" rx="4"/><rect x="16" y="8" width="8" height="36" rx="4"/><rect x="32" y="0" width="8" height="44" rx="4"/><rect x="48" y="13" width="8" height="31" rx="4"/><rect x="64" y="25" width="8" height="19" rx="4"/></g>
  <text x="134" y="88" fill="${theme.text}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="23" font-weight="700">${escapeXml(shorten(data.title, 48))}</text>
  <text x="134" y="116" fill="${theme.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13">${escapeXml(shorten(data.artist, 65))}</text>
  <text x="826" y="103" fill="${theme.yellow}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="22" text-anchor="end">♫</text>`;
  return svgShell({ label: `${data.title} by ${data.artist}`, accent: theme.coral, body, height: 148, wide: true });
}

async function readPrevious() {
  try { return JSON.parse(await fs.readFile(DATA_FILE, "utf8")); } catch { return {}; }
}

async function withFallback(name, reader, previous) {
  try { return await reader(); }
  catch (error) {
    if (previous[name]) {
      console.warn(`warning: ${name} refresh failed; keeping the last good data (${error.message})`);
      return previous[name];
    }
    throw error;
  }
}

async function main() {
  const previous = await readPrevious();
  const [goodreads, letterboxd, appleMusic] = await Promise.all([
    withFallback("goodreads", readGoodreads, previous),
    withFallback("letterboxd", readLetterboxd, previous),
    withFallback("appleMusic", readAppleMusic, previous),
  ]);
  const activity = { goodreads, letterboxd, appleMusic };
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(OUTPUT_DIR, "reading.svg"), renderReading(goodreads)),
    fs.writeFile(path.join(OUTPUT_DIR, "watching.svg"), renderWatching(letterboxd)),
    fs.writeFile(path.join(OUTPUT_DIR, "listening.svg"), renderListening(appleMusic)),
    fs.writeFile(DATA_FILE, `${JSON.stringify(activity, null, 2)}\n`),
  ]);
  console.log("profile activity refreshed ✨");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
