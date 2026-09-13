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

const appleMusicPath = "M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z";

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

function cleanText(value = "") {
  return decode(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchResponse(url, accept) {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      "User-Agent": "hnitch-profile/3.2 (+https://github.com/hnitch/hnitch)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response;
}

async function fetchText(url) {
  return (await fetchResponse(url, "application/rss+xml, application/xml, text/xml, image/svg+xml, application/json")).text();
}

async function fetchDataUri(url) {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const response = await fetchResponse(url, "image/avif,image/webp,image/png,image/jpeg,image/*");
    const type = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
  } catch (error) {
    console.warn(`warning: artwork unavailable (${error.message})`);
    return null;
  }
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
    cover: decode(first(item.book_large_image_url) || first(item.book_medium_image_url)),
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
  const description = decode(first(item.description));
  const poster = description.match(/<img[^>]+src="([^"]+)"/)?.[1] || "";
  const paragraphs = [...description.matchAll(/<p>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanText(match[1]))
    .filter((paragraph) => paragraph && !paragraph.startsWith("Watched on"));
  return {
    title: decode(first(item["letterboxd:filmTitle"]) || first(item.title)),
    year: decode(first(item["letterboxd:filmYear"])),
    rating: Number(first(item["letterboxd:memberRating"])) || 0,
    liked: first(item["letterboxd:memberLike"]) === "Yes",
    link: decode(first(item.link)),
    poster: decode(poster),
    review: paragraphs[0] || "",
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

async function lookupAppleMusic(title, artist) {
  try {
    const query = encodeURIComponent(`${artist} ${title}`);
    const payload = JSON.parse(await fetchText(`https://itunes.apple.com/search?term=${query}&entity=song&limit=25`));
    const exact = payload.results?.find((item) =>
      item.trackName?.toLowerCase() === title.toLowerCase()
      && item.artistName?.toLowerCase().includes(artist.toLowerCase())
    );
    if (exact) {
      return {
        album: exact.collectionName || "",
        artwork: exact.artworkUrl100?.replace("100x100bb", "600x600bb") || "",
        link: exact.trackViewUrl || "https://music.apple.com/",
      };
    }

    // Apple's older Search API can lag behind brand-new releases. The public
    // Apple Music search page usually has them immediately, so use its direct
    // track result while keeping the live card's own embedded artwork.
    const html = await fetchText(`https://music.apple.com/us/search?term=${query}`);
    const slug = title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-");
    const trackLink = html.match(new RegExp(`https://music\\.apple\\.com/us/album/${slug}/[^"& ]+\\?i=\\d+`, "i"))?.[0];
    if (!trackLink) return null;
    const singleName = `${title} - Single`;
    return {
      album: html.toLowerCase().includes(singleName.toLowerCase()) ? singleName : "Apple Music release",
      artwork: "",
      link: decode(trackLink),
    };
  } catch (error) {
    console.warn(`warning: Apple catalogue lookup failed (${error.message})`);
    return null;
  }
}

async function readAppleMusic() {
  const svg = await fetchText(SOURCES.appleMusic);
  const title = decode(svg.match(/class="song-title[^>]*>([^<]+)</)?.[1]);
  const artist = decode(svg.match(/class="song-artist[^>]*>([^<]+)</)?.[1]);
  if (!title || !artist) throw new Error("Apple Music card did not contain track metadata");
  const embeddedArtwork = svg.match(/<img[^>]+class="cover-image"[^>]+src="([^"]+)"/)?.[1]
    || svg.match(/<img[^>]+src="([^"]+)"[^>]+class="cover-image"/)?.[1]
    || "";
  const percentage = Number(svg.match(/slider-pill-inner" style="width:([\d.]+)%/)?.[1]) || 0;
  const times = [...svg.matchAll(/class="slider-content[^>]*>([^<]+)</g)].map((match) => decode(match[1]));
  const catalogue = await lookupAppleMusic(title, artist);
  const artworkData = catalogue?.artwork
    ? await fetchDataUri(catalogue.artwork)
    : embeddedArtwork;
  return {
    data: {
      title,
      artist,
      album: catalogue?.album || "album metadata not listed",
      link: catalogue?.link || "https://music.apple.com/",
      percentage,
      elapsed: times[0] || "",
      remaining: times[1] || "",
    },
    artworkData,
  };
}

function stars(rating) {
  if (!rating) return "unrated";
  return `${"★".repeat(Math.floor(rating))}${rating % 1 ? "½" : ""}`;
}

function bookVerdict(rating) {
  return ["no rating yet", "straight to jail", "fine, with a side eye", "hmm, this is alright", "this one cooked", "literally obsessed"][rating] || "read and filed away";
}

function wrapLines(value, maxChars) {
  const words = String(value).trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= maxChars) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrappedText({ x, y, width, height, value, size, weight = 600, color = theme.text, lineHeight = 1.2, italic = false }) {
  let fittedSize = size;
  let lines = [];
  let step = fittedSize * lineHeight;
  let maxLines = Math.max(1, Math.floor(height / step));
  while (fittedSize >= 10) {
    step = fittedSize * lineHeight;
    maxLines = Math.max(1, Math.floor(height / step));
    const maxChars = Math.max(8, Math.floor(width / (fittedSize * .56)));
    lines = wrapLines(value, maxChars);
    if (lines.length <= maxLines) break;
    fittedSize -= 1;
  }
  const tspans = lines.map((line, index) => `<tspan x="${x}" y="${(y + fittedSize + (index * step)).toFixed(1)}">${escapeXml(line)}</tspan>`).join("");
  return `<text fill="${color}" font-size="${fittedSize}" font-weight="${weight}" font-style="${italic ? "italic" : "normal"}">${tspans}</text>`;
}

function cover({ dataUri, x, y, width, height, radius = 12, id = "cover" }) {
  if (!dataUri) {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#302641"/><path d="M${x + width * .34} ${y + height * .42}h${width * .32}M${x + width * .34} ${y + height * .52}h${width * .24}" stroke="${theme.lavender}" stroke-width="4" stroke-linecap="round" opacity=".65"/>`;
  }
  return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"/></clipPath></defs><image href="${dataUri}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
}

function renderBookCurrent(book, artwork) {
  const item = book || { title: "between books", author: "the next obsession is loading", rating: 0 };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="246" viewBox="0 0 860 246" role="img" aria-label="Currently reading ${escapeXml(item.title)}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#18131f"/><stop offset="1" stop-color="#282019"/></linearGradient><style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}</style></defs>
  <rect x="1" y="1" width="858" height="244" rx="24" fill="url(#bg)" stroke="#5b4937" stroke-width="2"/>
  <circle cx="817" cy="16" r="140" fill="#e9c995" opacity=".055"/>
  ${cover({ dataUri: artwork, x: 24, y: 24, width: 132, height: 198, radius: 10 })}
  <g class="sans"><rect x="188" y="28" width="150" height="28" rx="14" fill="#e9c995" opacity=".12"/><circle cx="207" cy="42" r="4" fill="#e9c995"/><text x="220" y="47" fill="#e9c995" font-size="11" font-weight="800" letter-spacing="1.2">CURRENTLY READING</text>
  ${wrappedText({ x: 188, y: 75, width: 610, height: 92, value: item.title, size: 31, weight: 820, lineHeight: 1.04 })}
  <text x="190" y="202" fill="${theme.muted}" font-size="15" font-weight="600">by ${escapeXml(item.author)}</text></g>
  </svg>`;
}

function renderBookTile(book, artwork, index) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="172" viewBox="0 0 420 172" role="img" aria-label="${escapeXml(book.title)} by ${escapeXml(book.author)}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.bg}"/><stop offset="1" stop-color="#251e2c"/></linearGradient><style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}</style></defs>
  <rect x="1" y="1" width="418" height="170" rx="19" fill="url(#bg)" stroke="${theme.line}" stroke-width="2"/>
  ${cover({ dataUri: artwork, x: 16, y: 16, width: 94, height: 140, radius: 9 })}
  <g class="sans"><text x="130" y="27" fill="#e9c995" font-size="9.5" font-weight="800" letter-spacing="1.4">READ RECEIPT / 0${index + 1}</text>
  ${wrappedText({ x: 130, y: 42, width: 266, height: 58, value: book.title, size: 17, weight: 790, lineHeight: 1.08 })}
  <text x="130" y="112" fill="${theme.muted}" font-size="11.5" font-weight="600">${escapeXml(book.author)}</text><text x="130" y="141" fill="${theme.yellow}" font-size="12" font-weight="800">${escapeXml(stars(book.rating))}</text><text x="396" y="141" fill="${theme.muted}" font-size="10.5" font-weight="650" text-anchor="end">${escapeXml(bookVerdict(book.rating))}</text></g>
  </svg>`;
}

function renderFilmTile(film, artwork, index) {
  const note = film.review || (film.liked ? "liked. evidence duly noted." : "logged without further comment.");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="198" viewBox="0 0 420 198" role="img" aria-label="${escapeXml(film.title)} (${escapeXml(film.year)})">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#111820"/><stop offset="1" stop-color="#1d2731"/></linearGradient><style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}</style></defs>
  <rect x="1" y="1" width="418" height="196" rx="19" fill="url(#bg)" stroke="#344654" stroke-width="2"/>
  ${cover({ dataUri: artwork, x: 16, y: 16, width: 108, height: 166, radius: 9 })}
  <g class="sans"><g transform="translate(144 21)"><circle cx="8" cy="8" r="8" fill="#ff8000"/><circle cx="22" cy="8" r="8" fill="#00e054"/><circle cx="36" cy="8" r="8" fill="#40bcf4"/></g><text x="400" y="32" fill="#718696" font-size="9.5" font-weight="800" text-anchor="end" letter-spacing="1.2">WATCH 0${index + 1}</text>
  ${wrappedText({ x: 144, y: 52, width: 252, height: 54, value: film.title, size: 17, weight: 800, lineHeight: 1.08 })}
  <text x="144" y="119" fill="${theme.muted}" font-size="11.5" font-weight="650">${escapeXml(film.year)}${film.liked ? "  ·  ♥ liked" : ""}</text><text x="396" y="119" fill="${theme.yellow}" font-size="12" font-weight="800" text-anchor="end">${escapeXml(stars(film.rating))}</text>
  ${wrappedText({ x: 144, y: 137, width: 252, height: 45, value: `“${note}”`, size: 10.5, weight: 560, color: "#94a5b1", lineHeight: 1.2, italic: true })}</g>
  </svg>`;
}

function renderAppleMusic(data, artwork) {
  const progress = Math.max(0, Math.min(100, data.percentage || 0));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="270" viewBox="0 0 860 270" role="img" aria-label="${escapeXml(data.title)} by ${escapeXml(data.artist)} on Apple Music">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1a111b"/><stop offset=".55" stop-color="#24162b"/><stop offset="1" stop-color="#2d1421"/></linearGradient><radialGradient id="disc"><stop stop-color="#342a38"/><stop offset=".28" stop-color="#0a080c"/><stop offset=".32" stop-color="#fa243c"/><stop offset=".38" stop-color="#0a080c"/><stop offset="1" stop-color="#17131a"/></radialGradient><style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}.spin{animation:spin 12s linear infinite;transform-origin:243px 135px}@keyframes spin{to{transform:rotate(360deg)}}</style></defs>
  <rect x="1" y="1" width="858" height="268" rx="25" fill="url(#bg)" stroke="#623247" stroke-width="2"/><circle class="spin" cx="243" cy="135" r="91" fill="url(#disc)" stroke="#453a49"/><circle cx="243" cy="135" r="10" fill="#ffe8ee"/>
  ${cover({ dataUri: artwork, x: 28, y: 45, width: 180, height: 180, radius: 15, id: "artwork" })}
  <g class="sans"><g transform="translate(356 27) scale(1.08)"><path d="${appleMusicPath}" fill="#fa243c"/></g><text x="390" y="48" fill="#ff8293" font-size="12" font-weight="800" letter-spacing="1.4">APPLE MUSIC / NOW SPINNING</text>
  ${wrappedText({ x: 356, y: 73, width: 458, height: 67, value: data.title, size: 30, weight: 830, lineHeight: 1.03 })}
  <text x="357" y="158" fill="${theme.text}" font-size="17" font-weight="720">${escapeXml(data.artist)}</text><text x="357" y="184" fill="#bd9eae" font-size="12.5" font-weight="600">album · ${escapeXml(data.album)}</text>
  <rect x="357" y="213" width="445" height="5" rx="2.5" fill="#493242"/><rect x="357" y="213" width="${(445 * progress / 100).toFixed(1)}" height="5" rx="2.5" fill="#fa243c"/><text x="357" y="240" fill="#9e8190" font-size="10.5" font-weight="650">${escapeXml(data.elapsed || "last heard")}</text><text x="802" y="240" fill="#9e8190" font-size="10.5" font-weight="650" text-anchor="end">${escapeXml(data.remaining || "open in music ↗")}</text></g>
  </svg>`;
}

async function readPrevious() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function readSource(name, reader, previous) {
  try {
    const result = await reader();
    return { fresh: true, ...(result?.data ? result : { data: result }) };
  } catch (error) {
    if (previous[name]) {
      console.warn(`warning: ${name} refresh failed; keeping the last good data (${error.message})`);
      return { fresh: false, data: previous[name] };
    }
    throw error;
  }
}

async function writeGoodreadsAssets(data) {
  const currentArt = await fetchDataUri(data.current?.cover);
  const recentArt = await Promise.all(data.recent.map((book) => fetchDataUri(book.cover)));
  const writes = [fs.writeFile(path.join(OUTPUT_DIR, "goodreads-current.svg"), renderBookCurrent(data.current, currentArt))];
  data.recent.forEach((book, index) => writes.push(fs.writeFile(path.join(OUTPUT_DIR, `goodreads-${index + 1}.svg`), renderBookTile(book, recentArt[index], index))));
  await Promise.all(writes);
}

async function writeLetterboxdAssets(data) {
  const artwork = await Promise.all(data.recent.map((film) => fetchDataUri(film.poster)));
  await Promise.all(data.recent.map((film, index) => fs.writeFile(path.join(OUTPUT_DIR, `letterboxd-${index + 1}.svg`), renderFilmTile(film, artwork[index], index))));
}

function grid(items, prefix, alt) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    const cells = items.slice(index, index + 2).map((item, offset) => {
      const number = index + offset + 1;
      return `<td width="50%" valign="top"><a href="${escapeXml(item.link)}"><img src="./assets/activity/${prefix}-${number}.svg" width="100%" alt="${escapeXml(`${alt}: ${item.title}`)}" /></a></td>`;
    }).join("\n    ");
    rows.push(`<tr>\n    ${cells}\n  </tr>`);
  }
  return `<table>\n  ${rows.join("\n  ")}\n</table>`;
}

function goodreadsMarkup(data) {
  const currentLink = data.current?.link || "https://www.goodreads.com/user/show/178629903";
  return `<div align="center"><a href="https://www.goodreads.com/user/show/178629903"><img src="./assets/brands/goodreads.svg" height="42" alt="Goodreads" /></a><br/><sub>the shelf is public. the opinions are unfortunately also public.</sub></div>\n\n<br/>\n\n<a href="${escapeXml(currentLink)}"><img src="./assets/activity/goodreads-current.svg" width="100%" alt="currently reading ${escapeXml(data.current?.title || "nothing")}" /></a>\n\n${grid(data.recent, "goodreads", "Read")}`;
}

function letterboxdMarkup(data) {
  return `<div align="center"><a href="https://letterboxd.com/hnitch/"><img src="./assets/brands/letterboxd.svg" width="230" alt="Letterboxd" /></a><br/><sub>films watched. stars assigned. feelings were involved.</sub></div>\n\n<br/>\n\n${grid(data.recent, "letterboxd", "Watched")}`;
}

function appleMusicMarkup(data) {
  return `<a href="${escapeXml(data.link || "https://music.apple.com/")}"><img src="./assets/activity/apple-music.svg" width="100%" alt="listening to ${escapeXml(data.title)} by ${escapeXml(data.artist)}" /></a>`;
}

function replaceSection(content, name, replacement) {
  const pattern = new RegExp(`(^[\\t ]*)<!-- ${name}:START -->[\\s\\S]*?<!-- ${name}:END -->`, "m");
  if (!pattern.test(content)) throw new Error(`README is missing the ${name} markers`);
  return content.replace(pattern, (_match, indent) => {
    const body = replacement.split("\n").map((line) => `${indent}${line}`).join("\n");
    return `${indent}<!-- ${name}:START -->\n${body}\n${indent}<!-- ${name}:END -->`;
  });
}

async function updateReadme(data, updatedAt) {
  let readme = await fs.readFile(README_FILE, "utf8");
  readme = replaceSection(readme, "GOODREADS-FEED", goodreadsMarkup(data.goodreads));
  readme = replaceSection(readme, "LETTERBOXD-FEED", letterboxdMarkup(data.letterboxd));
  readme = replaceSection(readme, "APPLE-MUSIC-FEED", appleMusicMarkup(data.appleMusic));
  readme = replaceSection(readme, "PROFILE-LAST-UPDATED", `<relative-time datetime="${updatedAt}">a few seconds ago</relative-time>`);
  await fs.writeFile(README_FILE, readme);
}

function dataChanged(previous, current) {
  const old = { goodreads: previous.goodreads, letterboxd: previous.letterboxd, appleMusic: previous.appleMusic };
  return JSON.stringify(old) !== JSON.stringify(current);
}

async function main() {
  const previous = await readPrevious();
  const [goodreadsResult, letterboxdResult, appleMusicResult] = await Promise.all([
    readSource("goodreads", readGoodreads, previous),
    readSource("letterboxd", readLetterboxd, previous),
    readSource("appleMusic", readAppleMusic, previous),
  ]);
  const current = {
    goodreads: goodreadsResult.data,
    letterboxd: letterboxdResult.data,
    appleMusic: appleMusicResult.data,
  };
  const updatedAt = dataChanged(previous, current) || !previous.updatedAt ? new Date().toISOString() : previous.updatedAt;

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const writes = [];
  if (goodreadsResult.fresh) writes.push(writeGoodreadsAssets(current.goodreads));
  if (letterboxdResult.fresh) writes.push(writeLetterboxdAssets(current.letterboxd));
  if (appleMusicResult.fresh) writes.push(fs.writeFile(path.join(OUTPUT_DIR, "apple-music.svg"), renderAppleMusic(current.appleMusic, appleMusicResult.artworkData)));
  await Promise.all(writes);
  await Promise.all([
    fs.writeFile(DATA_FILE, `${JSON.stringify({ ...current, updatedAt }, null, 2)}\n`),
    updateReadme(current, updatedAt),
  ]);
  console.log("profile activity refreshed ✨");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
