import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseStringPromise } from "xml2js";
import { prepareReviewSummaryCandidates } from "./review-summary.js";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "assets", "activity");
const DATA_FILE = path.join(ROOT, "data", "activity.json");
const README_FILE = path.join(ROOT, "README.md");
const REVIEW_SUMMARY_CACHE_FILE = path.join(ROOT, "data", "review-summaries.json");
const REVIEW_VOICE_FILE = path.join(ROOT, ".github", "prompts", "goodreads-voice.md");
const DISCORD_USER_ID = "690729789702537336";
const MUSIC_PROFILE_URL = "https://music.apple.com/profile/hnitch";
const RENDER_VERSION = "3.6.0";
const SIGNAL_FRESH_MS = 15 * 60_000;

const SOURCES = {
  goodreads: {
    current: "https://www.goodreads.com/review/list_rss/178629903?shelf=currently-reading",
    read: "https://www.goodreads.com/review/list_rss/178629903?shelf=read",
    progress: "https://www.goodreads.com/user_status/list/178629903?format=rss",
  },
  letterboxd: "https://letterboxd.com/hnitch/rss/",
  appleMusicRecent: "https://music-profile.rayriffy.com/theme/dark.svg?uid=000568.fa0178bfed7a4356a5b20a996b4824a4.1200",
  discord: `https://api.lanyard.rest/v1/users/${DISCORD_USER_ID}`,
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

function displayText(value = "") {
  return decode(value).replace(/\s*,\s*/g, " , ");
}

function escapeDisplay(value = "") {
  return escapeXml(displayText(value));
}

function cleanText(value = "") {
  return decode(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cacheBusted(url) {
  const target = new URL(url);
  target.searchParams.set("refresh", String(Math.floor(Date.now() / 60_000)));
  return target.toString();
}

async function fetchResponse(url, accept, { bypassCache = false } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: accept,
          "Cache-Control": bypassCache ? "no-cache" : "max-age=0",
          Pragma: bypassCache ? "no-cache" : "",
          "User-Agent": "hnitch-profile/3.4 (+https://github.com/hnitch/hnitch)",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return response;
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      lastError = new Error(`${url} returned ${response.status}`);
      if (!retryable || attempt === 2) throw lastError;
      const retryHeader = response.headers.get("retry-after");
      const retrySeconds = retryHeader === null ? Number.NaN : Number(retryHeader);
      const retryDate = retryHeader && !Number.isFinite(retrySeconds) ? Date.parse(retryHeader) : Number.NaN;
      const retryDelay = Number.isFinite(retrySeconds)
        ? retrySeconds * 1_000
        : Number.isFinite(retryDate)
          ? retryDate - Date.now()
          : 500 * (2 ** attempt);
      await delay(Math.max(250, Math.min(retryDelay, 5_000)));
    } catch (error) {
      lastError = error;
      if (attempt === 2 || / returned 4\d\d$/.test(error.message)) throw error;
      await delay(500 * (2 ** attempt));
    }
  }
  throw lastError;
}

async function fetchText(url, options) {
  return (await fetchResponse(url, "application/rss+xml, application/xml, text/xml, text/html, image/svg+xml, application/json", options)).text();
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
  const book = first(item.book) || {};
  return {
    bookId: decode(first(item.book_id)),
    title: decode(first(item.title)),
    author: decode(first(item.author_name)),
    link: decode(first(item.link)),
    rating: Number(first(item.user_rating)) || 0,
    cover: decode(first(item.book_large_image_url) || first(item.book_medium_image_url)),
    pages: Number(first(item.num_pages) || first(book.num_pages)) || null,
    averageRating: Number(first(item.average_rating) || first(book.average_rating)) || null,
    published: decode(first(item.book_published)),
    dateAdded: decode(first(item.user_date_added) || first(item.pubDate)),
    readAt: decode(first(item.user_read_at)),
    review: cleanText(first(item.user_review)),
  };
}

function normaliseMatchText(value = "") {
  return decode(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\.{2,}$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseProgressTitle(value = "") {
  const title = cleanText(value);
  const page = title.match(/\bis on page\s+(\d+)\s+of\s+(\d+)\s+of\s+(.+)$/i);
  if (page) {
    return {
      page: Number(page[1]),
      total: Number(page[2]),
      percent: Math.round((Number(page[1]) / Number(page[2])) * 100),
      label: page[3],
    };
  }
  const percent = title.match(/\bis\s+(\d+(?:\.\d+)?)%\s+done with\s+(.+)$/i);
  if (!percent) return null;
  return {
    page: null,
    total: null,
    percent: Math.round(Number(percent[1])),
    label: percent[2],
  };
}

async function findCurrentProgress(statusFeed, current) {
  if (!current) return null;
  const currentTitle = normaliseMatchText(current.title);
  const startedAt = Date.parse(current.dateAdded) || 0;
  const items = statusFeed?.rss?.channel?.[0]?.item ?? [];
  for (const item of items) {
    const parsed = parseProgressTitle(first(item.title));
    const publishedAt = Date.parse(first(item.pubDate)) || 0;
    if (!parsed || publishedAt < startedAt) continue;
    const label = normaliseMatchText(parsed.label);
    if (label.length < 12 || !currentTitle.startsWith(label)) continue;
    const link = decode(first(item.link));
    let detail;
    try {
      detail = await fetchText(link);
    } catch (error) {
      console.warn(`warning: Goodreads progress detail unavailable (${error.message})`);
      continue;
    }
    const bookId = detail.match(/href=["'](?:https:\/\/www\.goodreads\.com)?\/book\/show\/(\d+)/i)?.[1];
    if (bookId !== current.bookId) continue;
    return { ...parsed, updatedAt: new Date(publishedAt).toISOString(), link };
  }
  return null;
}

async function readGoodreads() {
  const [currentXml, readXml, progressXml] = await Promise.all([
    fetchText(SOURCES.goodreads.current),
    fetchText(SOURCES.goodreads.read),
    fetchText(SOURCES.goodreads.progress),
  ]);
  const [currentFeed, readFeed, progressFeed] = await Promise.all([
    parseStringPromise(currentXml),
    parseStringPromise(readXml),
    parseStringPromise(progressXml),
  ]);
  const currentItems = currentFeed?.rss?.channel?.[0]?.item ?? [];
  const readItems = readFeed?.rss?.channel?.[0]?.item ?? [];
  const current = currentItems[0] ? normaliseBook(currentItems[0]) : null;
  if (current) current.progress = await findCurrentProgress(progressFeed, current);
  return {
    current,
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

function parseMusicEvent() {
  const raw = process.env.MUSIC_EVENT_JSON?.trim();
  if (!raw || raw === "null" || raw === "{}") return null;
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    throw new Error("MUSIC_EVENT_JSON is not valid JSON");
  }
  const states = new Set(["playing", "paused", "stopped"]);
  const state = states.has(event.state) ? event.state : "stopped";
  return {
    state,
    title: cleanText(event.title).slice(0, 240),
    artist: cleanText(event.artist).slice(0, 240),
    album: cleanText(event.album).slice(0, 240),
    duration: Math.max(0, Number(event.duration) || 0),
    position: Math.max(0, Number(event.position) || 0),
    observedAt: Number.isNaN(Date.parse(event.observedAt)) ? new Date().toISOString() : new Date(event.observedAt).toISOString(),
    preview: event.preview === true,
  };
}

async function readMusicAppEvent(event, previous) {
  if (event.state === "stopped" && !event.title) {
    if (!previous?.title) throw new Error("Music.app stopped without a previous track");
    return {
      data: {
        ...previous,
        source: event.preview ? "music-app-preview" : "music-app",
        playbackState: "stopped",
        isNowPlaying: false,
        observedAt: event.observedAt,
      },
    };
  }
  if (!event.title) throw new Error("Music.app event is missing its track title");
  const sameTrack = normaliseMatchText(previous?.title) === normaliseMatchText(event.title)
    && (!event.artist || normaliseMatchText(previous?.artist) === normaliseMatchText(event.artist));
  const catalogue = event.artist ? await lookupAppleMusic(event.title, event.artist) : null;
  const artworkData = catalogue?.artwork ? await fetchDataUri(catalogue.artwork) : null;
  return {
    data: {
      title: event.title,
      artist: event.artist || (sameTrack && previous?.artist) || "artist metadata not listed",
      album: event.album || catalogue?.album || (sameTrack && previous?.album) || "album metadata not listed",
      link: catalogue?.link || (sameTrack && previous?.link) || MUSIC_PROFILE_URL,
      duration: event.duration,
      position: event.position,
      source: event.preview ? "music-app-preview" : "music-app",
      playbackState: event.state,
      isNowPlaying: event.state === "playing",
      observedAt: event.observedAt,
    },
    artworkData,
  };
}

async function readAppleMusic(previous) {
  const musicEvent = parseMusicEvent();
  if (musicEvent) return readMusicAppEvent(musicEvent, previous);

  const svg = await fetchText(cacheBusted(SOURCES.appleMusicRecent), { bypassCache: true });
  const title = decode(svg.match(/class="song-title[^>]*>([^<]+)</)?.[1]);
  const artist = decode(svg.match(/class="song-artist[^>]*>([^<]+)</)?.[1]);
  if (!title || !artist) throw new Error("Apple Music card did not contain track metadata");
  const embeddedArtwork = svg.match(/<img[^>]+class="cover-image"[^>]+src="([^"]+)"/)?.[1]
    || svg.match(/<img[^>]+src="([^"]+)"[^>]+class="cover-image"/)?.[1]
    || "";
  const catalogue = await lookupAppleMusic(title, artist);
  const artworkData = catalogue?.artwork
    ? await fetchDataUri(catalogue.artwork)
    : embeddedArtwork;
  return {
    data: {
      title,
      artist,
      album: catalogue?.album || "album metadata not listed",
      link: catalogue?.link || MUSIC_PROFILE_URL,
      duration: 0,
      source: "apple-history",
      playbackState: "recent",
      isNowPlaying: false,
      observedAt: null,
    },
    artworkData,
  };
}

function discordActivityLabel(source) {
  if (source.spotify?.song) {
    return `listening to ${source.spotify.song}${source.spotify.artist ? ` by ${source.spotify.artist}` : ""}`;
  }
  const richActivity = source.activities?.find((item) => item.type !== 4);
  const activity = richActivity || source.activities?.find((item) => item.type === 4);
  if (!activity) return "no public activity right now";
  const verbs = { 0: "playing", 2: "listening to", 3: "watching", 4: "status" };
  const verb = verbs[activity.type] || "doing";
  const subject = activity.type === 4
    ? activity.state
    : activity.details || activity.state || activity.name;
  return subject ? `${verb} ${subject}` : "activity is keeping a low profile";
}

async function readLanyard() {
  const payload = JSON.parse(await fetchText(SOURCES.discord));
  if (!payload.success || !payload.data?.discord_user) throw new Error("Lanyard did not return a Discord profile");
  return payload.data;
}

async function readDiscord(source) {
  const user = source.discord_user;
  const guild = user.primary_guild?.identity_enabled ? user.primary_guild : null;
  const validStatuses = new Set(["online", "idle", "dnd", "offline"]);
  const avatarExtension = user.avatar?.startsWith("a_") ? "gif" : "png";
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${avatarExtension}?size=256`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) >> 22n) % 6}.png`;
  const devices = [
    source.active_on_discord_desktop && "desktop",
    source.active_on_discord_mobile && "mobile",
    source.active_on_discord_web && "web",
    source.active_on_discord_embedded && "embedded",
  ].filter(Boolean);
  const createdAt = Number((BigInt(user.id) >> 22n) + 1420070400000n);
  const guildBadgeUrl = guild?.badge
    ? `https://cdn.discordapp.com/clan-badges/${guild.identity_guild_id}/${guild.badge}.png?size=64`
    : "";
  const [avatarData, guildBadgeData] = await Promise.all([
    fetchDataUri(avatarUrl),
    fetchDataUri(guildBadgeUrl),
  ]);
  return {
    data: {
      id: user.id,
      displayName: user.display_name || user.global_name || user.username,
      username: user.username,
      status: validStatuses.has(source.discord_status) ? source.discord_status : "unknown",
      guildTag: guild?.tag || "",
      guildBadgeUrl,
      memberSince: new Date(createdAt).getUTCFullYear(),
      devices,
      activity: discordActivityLabel(source),
      avatarUrl,
    },
    avatarData,
    guildBadgeData,
  };
}

function stars(rating) {
  if (!rating) return "unrated";
  return `${"★".repeat(Math.floor(rating))}${rating % 1 ? "½" : ""}`;
}

function bookVerdict(rating) {
  return ["no rating yet", "straight to jail", "fine, with a side eye", "hmm, this is alright", "this one cooked", "literally obsessed"][rating] || "read and filed away";
}

function reviewFallback(book = {}) {
  return cleanText(book.review)
    ? bookVerdict(book.rating)
    : "no written statement was left at the scene";
}

function monthYear(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function wrapLines(value, maxChars) {
  const words = String(value).trim().split(/\s+/).flatMap((word) => {
    if (word.length <= maxChars) return [word];
    return word.match(new RegExp(`.{1,${maxChars}}`, "g")) || [word];
  });
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
    const maxChars = Math.max(8, Math.floor(width / (fittedSize * .62)));
    lines = wrapLines(value, maxChars);
    if (lines.length <= maxLines) break;
    if (fittedSize === 10) {
      lines = lines.slice(0, maxLines);
      break;
    }
    fittedSize -= 1;
  }
  const tspans = lines.map((line, index) => `<tspan x="${x}" y="${Math.round(y + fittedSize + (index * step))}">${escapeDisplay(line)}</tspan>`).join("");
  return `<text fill="${color}" font-size="${fittedSize}" font-weight="${weight}" font-style="${italic ? "italic" : "normal"}">${tspans}</text>`;
}

function assetVersion(value) {
  return createHash("sha256").update(JSON.stringify([RENDER_VERSION, value])).digest("hex").slice(0, 10);
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (!total) return "";
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function cover({ dataUri, x, y, width, height, radius = 12, id = "cover" }) {
  if (!dataUri) {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#302641"/><path d="M${x + width * .34} ${y + height * .42}h${width * .32}M${x + width * .34} ${y + height * .52}h${width * .24}" stroke="${theme.lavender}" stroke-width="4" stroke-linecap="round" opacity=".65"/>`;
  }
  return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"/></clipPath></defs><image href="${dataUri}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
}

function renderBookCurrent(book, artwork) {
  const item = book || { title: "between books", author: "the next obsession is loading", rating: 0 };
  const facts = [
    item.pages && `${item.pages} pages`,
    item.published,
    item.averageRating && `GR avg ${item.averageRating.toFixed(2)}`,
  ].filter(Boolean).join(" · ");
  const progress = item.progress;
  const progressLabel = progress
    ? (progress.page ? `page ${progress.page} of ${progress.total} · ${progress.percent}%` : `${progress.percent}% read`)
    : "progress not shared yet";
  const progressWidth = progress ? Math.max(0, Math.min(100, progress.percent)) * 6.1 : 0;
  const progressBar = progress
    ? `<rect x="190" y="230" width="610" height="6" rx="3" fill="#4a3e35"/><rect x="190" y="230" width="${progressWidth.toFixed(1)}" height="6" rx="3" fill="#e9c995"/>`
    : `<path d="M190 233H800" stroke="#756352" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 9" opacity=".7"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="252" viewBox="0 0 860 252" role="img" aria-label="Currently reading ${escapeDisplay(item.title)}" text-rendering="geometricPrecision" shape-rendering="geometricPrecision">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#18131f"/><stop offset="1" stop-color="#282019"/></linearGradient><style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}</style></defs>
  <rect x="1" y="1" width="858" height="250" rx="24" fill="url(#bg)" stroke="#5b4937" stroke-width="2"/>
  <circle cx="817" cy="16" r="140" fill="#e9c995" opacity=".055"/>
  ${cover({ dataUri: artwork, x: 24, y: 24, width: 132, height: 198, radius: 10 })}
  <g class="sans"><rect x="188" y="24" width="205" height="30" rx="15" fill="#e9c995" opacity=".12"/><circle cx="207" cy="39" r="4" fill="#e9c995"/><text x="220" y="44" fill="#e9c995" font-size="12" font-weight="800" letter-spacing="1.05">CURRENTLY READING</text>
  ${wrappedText({ x: 188, y: 65, width: 610, height: 86, value: item.title, size: 30, weight: 800, lineHeight: 1.04 })}
  <text x="190" y="170" fill="${theme.muted}" font-size="14.5" font-weight="600">by ${escapeDisplay(item.author)}</text>
  <text x="190" y="193" fill="#a99bb4" font-size="12" font-weight="600">${escapeDisplay(facts)}</text>
  <text x="190" y="215" fill="#e9c995" font-size="12" font-weight="800" letter-spacing=".35">${escapeDisplay(progressLabel)}</text>
  ${progressBar}</g>
  </svg>`;
}

function renderBookTile(book, artwork, index) {
  const facts = [book.pages && `${book.pages}p`, book.readAt && `read ${monthYear(book.readAt)}`].filter(Boolean).join(" · ");
  const reaction = book.reviewSummary || reviewFallback(book);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="242" viewBox="0 0 860 242" role="img" aria-label="${escapeDisplay(book.title)} by ${escapeDisplay(book.author)}" text-rendering="geometricPrecision" shape-rendering="geometricPrecision">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.bg}"/><stop offset="1" stop-color="#251e2c"/></linearGradient><style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}</style></defs>
  <rect x="1" y="1" width="858" height="240" rx="25" fill="url(#bg)" stroke="${theme.line}" stroke-width="2"/>
  <circle cx="820" cy="12" r="124" fill="#b9a4ff" opacity=".045"/>
  ${cover({ dataUri: artwork, x: 24, y: 21, width: 130, height: 198, radius: 10 })}
  <g class="sans"><text x="164" y="38" fill="#e9c995" font-size="12" font-weight="800" letter-spacing="1.25">READ RECEIPT / 0${index + 1}</text>
  ${wrappedText({ x: 164, y: 51, width: 630, height: 63, value: book.title, size: 27, weight: 800, lineHeight: 1.04 })}
  <text x="164" y="136" fill="${theme.muted}" font-size="14.5" font-weight="700">${escapeDisplay(book.author)}</text>
  <text x="164" y="160" fill="#978a9f" font-size="12.5" font-weight="600">${escapeDisplay(facts)}</text>
  <text x="164" y="184" fill="${theme.yellow}" font-size="14" font-weight="800">${escapeDisplay(stars(book.rating))}</text>
  <path d="M164 194H810" stroke="#746684" stroke-width="1" opacity=".24"/>
  ${wrappedText({ x: 164, y: 198, width: 600, height: 34, value: reaction, size: 13.5, weight: 600, color: "#c8bdd3", lineHeight: 1.12, italic: true })}</g>
  </svg>`;
}

function renderFilmTile(film, artwork, index) {
  const note = film.review || (film.liked ? "liked. evidence duly noted." : "logged without further comment.");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="220" viewBox="0 0 860 220" role="img" aria-label="${escapeDisplay(film.title)} (${escapeDisplay(film.year)})" text-rendering="geometricPrecision" shape-rendering="geometricPrecision">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#111820"/><stop offset="1" stop-color="#1d2731"/></linearGradient><style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}</style></defs>
  <rect x="1" y="1" width="858" height="218" rx="25" fill="url(#bg)" stroke="#344654" stroke-width="2"/>
  <circle cx="815" cy="18" r="130" fill="#40bcf4" opacity=".04"/>
  ${cover({ dataUri: artwork, x: 24, y: 20, width: 118, height: 180, radius: 10 })}
  <g class="sans"><g transform="translate(168 25)"><circle cx="8" cy="8" r="8" fill="#ff8000"/><circle cx="22" cy="8" r="8" fill="#00e054"/><circle cx="36" cy="8" r="8" fill="#40bcf4"/></g><text x="808" y="38" fill="#8298a8" font-size="12" font-weight="800" text-anchor="end" letter-spacing="1.1">WATCH 0${index + 1}</text>
  ${wrappedText({ x: 168, y: 55, width: 630, height: 63, value: film.title, size: 28, weight: 800, lineHeight: 1.04 })}
  <text x="168" y="139" fill="${theme.muted}" font-size="14" font-weight="700">${escapeDisplay(film.year)}${film.liked ? "  ·  ♥ liked" : ""}</text><text x="808" y="139" fill="${theme.yellow}" font-size="14" font-weight="800" text-anchor="end">${escapeDisplay(stars(film.rating))}</text>
  ${wrappedText({ x: 168, y: 154, width: 630, height: 44, value: `“${note}”`, size: 13, weight: 600, color: "#a7b7c2", lineHeight: 1.18, italic: true })}</g>
  </svg>`;
}

function renderAppleMusic(data, artwork) {
  const states = {
    playing: { heading: "APPLE MUSIC / NOW PLAYING", color: "#fa243c" },
    paused: { heading: "APPLE MUSIC / PAUSED", color: "#ff9f9a" },
    stopped: { heading: "APPLE MUSIC / LAST PLAYED", color: "#b9a4ff" },
    recent: { heading: "APPLE MUSIC / RECENTLY PLAYED", color: "#b9a4ff" },
    unknown: { heading: "APPLE MUSIC / LAST SIGNAL", color: "#8f859b" },
  };
  const playback = states[data.playbackState] || states.recent;
  const duration = formatDuration(data.duration);
  const sourceLabel = data.playbackState === "playing"
    ? "PLAYING RIGHT NOW"
    : data.playbackState === "paused"
      ? "PAUSED FOR NOW"
      : data.playbackState === "unknown"
        ? "LISTENING STATUS UNAVAILABLE"
        : "RECENTLY PLAYED";
  const sourceWidth = Math.min(226, Math.max(188, 62 + (sourceLabel.length * 6.25)));
  const spinClass = data.isNowPlaying ? "spin" : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="270" viewBox="0 0 860 270" role="img" aria-label="${escapeDisplay(data.title)} by ${escapeDisplay(data.artist)} on Apple Music" text-rendering="geometricPrecision" shape-rendering="geometricPrecision">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1a111b"/><stop offset=".55" stop-color="#24162b"/><stop offset="1" stop-color="#2d1421"/></linearGradient><radialGradient id="disc"><stop stop-color="#342a38"/><stop offset=".28" stop-color="#0a080c"/><stop offset=".32" stop-color="#fa243c"/><stop offset=".38" stop-color="#0a080c"/><stop offset="1" stop-color="#17131a"/></radialGradient><style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}.spin{animation:spin 12s linear infinite;transform-origin:243px 135px}@keyframes spin{to{transform:rotate(360deg)}}</style></defs>
  <rect x="1" y="1" width="858" height="268" rx="25" fill="url(#bg)" stroke="#623247" stroke-width="2"/><circle class="${spinClass}" cx="243" cy="135" r="91" fill="url(#disc)" stroke="#453a49"/><circle cx="243" cy="135" r="10" fill="#ffe8ee"/>
  ${cover({ dataUri: artwork, x: 28, y: 45, width: 180, height: 180, radius: 15, id: "artwork" })}
  <g class="sans"><g transform="translate(356 27) scale(1.08)"><path d="${appleMusicPath}" fill="#fa243c"/></g><text x="390" y="48" fill="#ff8293" font-size="12" font-weight="800" letter-spacing="1.25">${playback.heading}</text>
  ${wrappedText({ x: 356, y: 73, width: 458, height: 67, value: data.title, size: 30, weight: 800, lineHeight: 1.03 })}
  ${wrappedText({ x: 357, y: 143, width: 445, height: 28, value: data.artist, size: 17, weight: 700, lineHeight: 1 })}
  <text x="357" y="181" fill="#9f8191" font-size="10.5" font-weight="800" letter-spacing="1">ALBUM</text>
  ${wrappedText({ x: 405, y: 166, width: duration ? 300 : 397, height: 35, value: data.album || "album metadata not listed", size: 12.5, weight: 600, color: "#c7a9b8", lineHeight: 1.06 })}
${duration ? `  <rect x="724" y="168" width="78" height="27" rx="13.5" fill="#fff" opacity=".07"/><text x="763" y="186" fill="#d9c2ce" font-size="11.5" font-weight="700" text-anchor="middle">${duration}</text>` : ""}
  <rect x="357" y="211" width="${sourceWidth}" height="36" rx="18" fill="${playback.color}" opacity=".13"/><circle cx="378" cy="229" r="5" fill="${playback.color}"/>${data.isNowPlaying ? `<circle cx="378" cy="229" r="9" fill="none" stroke="${playback.color}" opacity=".35"><animate attributeName="r" values="7;12;7" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values=".45;0;.45" dur="1.8s" repeatCount="indefinite"/></circle>` : ""}<text x="391" y="233" fill="#eadce3" font-size="11.5" font-weight="800" letter-spacing=".55">${sourceLabel}</text>
  <text x="810" y="233" fill="#d6b8c6" font-size="12" font-weight="700" text-anchor="end">OPEN IN APPLE MUSIC  ↗</text></g>
  </svg>`;
}

function renderDiscord(data, avatar, guildBadge) {
  const statuses = {
    online: { color: "#3ba55d", label: "online" },
    idle: { color: "#faa81a", label: "idle" },
    dnd: { color: "#ed4245", label: "do not disturb" },
    offline: { color: "#747f8d", label: "offline" },
    unknown: { color: "#747f8d", label: "presence unavailable" },
  };
  const presence = statuses[data.status] || statuses.unknown;
  const statusWidth = Math.min(190, Math.max(142, 48 + (presence.label.length * 6.8)));
  const deviceText = data.devices.length ? `active on ${data.devices.join(" + ")}` : "no active device showing";
  const avatarMarkup = avatar
    ? `<image href="${avatar}" x="34" y="32" width="132" height="132" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)"/>`
    : `<circle cx="100" cy="98" r="66" fill="#4b3a67"/><text x="100" y="112" fill="#fffaf5" class="sans" font-size="38" font-weight="800" text-anchor="middle">HN</text>`;
  const guildIdentity = data.guildTag
    ? `<rect x="636" y="45" width="78" height="32" rx="16" fill="#fff" opacity=".08"/>${guildBadge ? `<image href="${guildBadge}" x="648" y="52" width="18" height="18" preserveAspectRatio="xMidYMid meet"/>` : `<path d="M656 51l8 9-8 9-8-9z" fill="#ded5e5" opacity=".9"/>`}<text x="687" y="66" fill="#ded5e5" font-size="11.5" font-weight="800" text-anchor="middle">${escapeDisplay(data.guildTag)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="206" viewBox="0 0 860 206" role="img" aria-label="Discord profile for ${escapeDisplay(data.username)} , status ${escapeDisplay(presence.label)}" text-rendering="geometricPrecision" shape-rendering="geometricPrecision">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#171427"/><stop offset=".55" stop-color="#25203b"/><stop offset="1" stop-color="#172a35"/></linearGradient><linearGradient id="edge" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#5865f2"/><stop offset=".55" stop-color="#b9a4ff"/><stop offset="1" stop-color="#8edfd4"/></linearGradient><clipPath id="avatar"><circle cx="100" cy="98" r="66"/></clipPath><style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}.arrow{animation:nudge 1.8s ease-in-out infinite}@keyframes nudge{50%{transform:translateX(5px)}}</style></defs>
  <rect x="1" y="1" width="858" height="204" rx="25" fill="url(#bg)" stroke="url(#edge)" stroke-width="2"/>
  <circle cx="780" cy="20" r="138" fill="#5865f2" opacity=".07"/><circle cx="710" cy="215" r="118" fill="#8edfd4" opacity=".045"/>
  ${avatarMarkup}<circle cx="148" cy="147" r="17" fill="#171427"/><circle cx="148" cy="147" r="11" fill="${presence.color}" stroke="#fffaf5" stroke-opacity=".3" stroke-width="1"/>
  <g class="sans"><text x="198" y="42" fill="#9ba3ff" font-size="11.5" font-weight="800" letter-spacing="1.35">DISCORD / PUBLIC PRESENCE</text>
  ${wrappedText({ x: 196, y: 51, width: 390, height: 43, value: data.displayName, size: 31, weight: 800, lineHeight: 1 })}
  <text x="198" y="108" fill="#c8bdd3" font-size="14" font-weight="600">@${escapeDisplay(data.username)}</text>
  <rect x="196" y="124" width="${statusWidth.toFixed(1)}" height="30" rx="15" fill="${presence.color}" opacity=".15"/><circle cx="213" cy="139" r="4.5" fill="${presence.color}"/><text x="225" y="144" fill="#e5ddea" font-size="12" font-weight="800">${escapeDisplay(presence.label)}</text>
  ${wrappedText({ x: 198, y: 162, width: 405, height: 34, value: `${data.activity} · ${deviceText}`, size: 12, weight: 600, color: "#ada1ba", lineHeight: 1.15 })}
  <text x="620" y="68" fill="#a497ae" font-size="11.5" font-weight="800" text-anchor="end">ON DISCORD SINCE ${data.memberSince}</text>${guildIdentity}
  <rect x="638" y="111" width="174" height="48" rx="24" fill="#5865f2"/><text x="669" y="140" fill="#fff" font-size="12" font-weight="800" letter-spacing=".7">OPEN PROFILE</text><text class="arrow" x="777" y="142" fill="#fff" font-size="18" font-weight="800">↗</text></g>
  </svg>`;
}

function renderInstagram(data, avatar) {
  const avatarMarkup = avatar
    ? `<image href="${avatar}" x="31" y="28" width="134" height="134" preserveAspectRatio="xMidYMid slice" clip-path="url(#instagram-avatar)"/>`
    : `<circle cx="98" cy="95" r="67" fill="#39233d"/><text x="98" y="108" fill="#fffaf5" class="sans" font-size="35" font-weight="800" text-anchor="middle">HN</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="190" viewBox="0 0 860 190" role="img" aria-label="Instagram profile ${escapeDisplay(data.username)}" text-rendering="geometricPrecision" shape-rendering="geometricPrecision">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#211526"/><stop offset=".55" stop-color="#2b1725"/><stop offset="1" stop-color="#17252c"/></linearGradient><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#ffdc80"/><stop offset=".35" stop-color="#fc5b55"/><stop offset=".68" stop-color="#c13584"/><stop offset="1" stop-color="#833ab4"/></linearGradient><clipPath id="instagram-avatar"><circle cx="98" cy="95" r="67"/></clipPath><style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}.arrow{animation:nudge 1.8s ease-in-out infinite}@keyframes nudge{50%{transform:translateX(5px)}}</style></defs>
  <rect x="1" y="1" width="858" height="188" rx="25" fill="url(#bg)" stroke="#59304d" stroke-width="2"/><circle cx="786" cy="8" r="142" fill="#c13584" opacity=".055"/><circle cx="720" cy="194" r="120" fill="#ffdc80" opacity=".035"/>
  <circle cx="98" cy="95" r="70" fill="none" stroke="url(#ig)" stroke-width="4"/>${avatarMarkup}
  <circle cx="148" cy="145" r="25" fill="#18121d" stroke="#241725" stroke-width="3"/><rect x="130" y="127" width="36" height="36" rx="10" fill="url(#ig)"/><rect x="138" y="135" width="20" height="20" rx="6" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="148" cy="145" r="4.7" fill="none" stroke="#fff" stroke-width="2"/><circle cx="155" cy="138" r="1.8" fill="#fff"/>
  <g class="sans"><text x="195" y="47" fill="#ff9fcb" font-size="12" font-weight="800" letter-spacing="1.5">INSTAGRAM / PUBLIC CAMERA ROLL</text><text x="193" y="94" fill="#fffaf5" font-size="31" font-weight="800">@${escapeDisplay(data.username)}</text><text x="195" y="124" fill="#c3aabd" font-size="14.5" font-weight="600">photos , stories , and whatever made the grid.</text>
  <g font-size="10.5" font-weight="800" letter-spacing=".75" text-anchor="middle"><rect x="195" y="143" width="78" height="25" rx="12.5" fill="#ffdc80" opacity=".1"/><text x="234" y="160" fill="#ffdc80">PHOTOS</text><rect x="281" y="143" width="82" height="25" rx="12.5" fill="#c13584" opacity=".14"/><text x="322" y="160" fill="#ff9fcb">STORIES</text></g>
  <rect x="690" y="70" width="132" height="48" rx="24" fill="#fffaf5" opacity=".92"/><text x="723" y="99" fill="#251720" font-size="12" font-weight="800" letter-spacing=".9">OPEN</text><text class="arrow" x="778" y="101" fill="#251720" font-size="18" font-weight="800">↗</text></g></svg>`;
}

async function readPrevious() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function readReviewSummaryCache() {
  try {
    return JSON.parse(await fs.readFile(REVIEW_SUMMARY_CACHE_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function readReviewVoice() {
  try {
    return await fs.readFile(REVIEW_VOICE_FILE, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function readEmbeddedImage(filename, index = 0) {
  try {
    const svg = await fs.readFile(path.join(OUTPUT_DIR, filename), "utf8");
    return [...svg.matchAll(/<image[^>]+href="(data:[^"]+)"/g)][index]?.[1] || null;
  } catch {
    return null;
  }
}

async function chromeExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Keep looking for a browser already available on the runner.
    }
  }
  throw new Error("no Chrome executable is available for the Instagram refresh");
}

async function readInstagramAvatar() {
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: await chromeExecutable(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
    await page.goto("https://www.instagram.com/hnitch/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector('img[alt*="profile picture"]', { visible: true, timeout: 20_000 });
    await delay(1_500);
    const candidates = await page.$$('img[alt*="profile picture"]');
    let avatarUrl = "";
    for (const candidate of candidates) {
      const details = await candidate.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          naturalWidth: element.naturalWidth,
          source: element.currentSrc || element.src,
        };
      });
      if (details.width >= 80 && details.height >= 80 && details.naturalWidth >= 80 && /cdninstagram\.com/.test(details.source)) {
        avatarUrl = details.source;
        break;
      }
    }
    if (!avatarUrl) throw new Error("Instagram did not expose a usable profile image");
    const imageResponse = await page.goto(avatarUrl, { waitUntil: "networkidle0", timeout: 20_000 });
    const bytes = imageResponse ? await imageResponse.buffer() : null;
    if (!imageResponse?.ok() || !bytes || bytes.length < 1_500) throw new Error("Instagram returned an empty profile-image placeholder");
    const type = imageResponse.headers()["content-type"]?.split(";")[0] || "image/jpeg";
    const avatarData = `data:${type};base64,${bytes.toString("base64")}`;
    return {
      data: {
        username: "hnitch",
        avatarHash: createHash("sha256").update(avatarData).digest("hex").slice(0, 12),
      },
      avatarData,
    };
  } finally {
    await browser.close();
  }
}

function instagramRefreshWindow() {
  if (!process.env.GITHUB_ACTIONS) return true;
  const now = new Date();
  return now.getUTCHours() === 0 && now.getUTCMinutes() < 5;
}

async function readInstagramSource(previous, cachedAvatar) {
  if (previous && cachedAvatar && !instagramRefreshWindow()) {
    return { fresh: true, data: previous, avatarData: cachedAvatar };
  }
  try {
    return { fresh: true, ...(await readInstagramAvatar()) };
  } catch (error) {
    if (!cachedAvatar) throw error;
    console.warn(`warning: Instagram avatar refresh failed; keeping the last good image (${error.message})`);
    return {
      fresh: true,
      data: {
        username: "hnitch",
        avatarHash: createHash("sha256").update(cachedAvatar).digest("hex").slice(0, 12),
      },
      avatarData: cachedAvatar,
    };
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

async function readDiscordSource(previous, lanyardPromise) {
  try {
    const result = await readDiscord(await lanyardPromise);
    return { fresh: true, ...result };
  } catch (error) {
    if (!previous) throw error;
    console.warn(`warning: Discord presence refresh failed; keeping the last good data (${error.message})`);
    return {
      fresh: false,
      data: previous,
      avatarData: null,
      guildBadgeData: null,
    };
  }
}

async function writeGoodreadsAssets(data, cachedArtwork = {}) {
  const currentArt = (await fetchDataUri(data.current?.cover)) || cachedArtwork.current || null;
  const downloadedRecentArt = await Promise.all(data.recent.map((book) => fetchDataUri(book.cover)));
  const recentArt = downloadedRecentArt.map((artwork, index) => artwork || cachedArtwork.recent?.[index] || null);
  const writes = [fs.writeFile(path.join(OUTPUT_DIR, "goodreads-current.svg"), renderBookCurrent(data.current, currentArt))];
  data.recent.forEach((book, index) => writes.push(fs.writeFile(path.join(OUTPUT_DIR, `goodreads-${index + 1}.svg`), renderBookTile(book, recentArt[index], index))));
  await Promise.all(writes);
}

async function writeLetterboxdAssets(data) {
  const artwork = await Promise.all(data.recent.map((film) => fetchDataUri(film.poster)));
  await Promise.all(data.recent.map((film, index) => fs.writeFile(path.join(OUTPUT_DIR, `letterboxd-${index + 1}.svg`), renderFilmTile(film, artwork[index], index))));
}

function cardStack(items, prefix, alt) {
  return items.map((item, index) => {
    const number = index + 1;
    return `<a href="${escapeXml(item.link)}"><img src="./assets/activity/${prefix}-${number}.svg?v=${assetVersion(item)}" width="100%" alt="${escapeDisplay(`${alt}: ${item.title}`)}" /></a>`;
  }).join("\n\n");
}

function goodreadsMarkup(data) {
  const currentLink = data.current?.link || "https://www.goodreads.com/user/show/178629903";
  return `<div align="center"><a href="https://www.goodreads.com/user/show/178629903"><img src="./assets/brands/goodreads.svg" height="42" alt="Goodreads" /></a><br/><sub>the shelf is public. the opinions are unfortunately also public.</sub></div>\n\n<br/>\n\n<a href="${escapeXml(currentLink)}"><img src="./assets/activity/goodreads-current.svg?v=${assetVersion(data.current)}" width="100%" alt="currently reading ${escapeDisplay(data.current?.title || "nothing")}" /></a>\n\n${cardStack(data.recent, "goodreads", "Read")}`;
}

function letterboxdMarkup(data) {
  return `<div align="center"><a href="https://letterboxd.com/hnitch/"><img src="./assets/brands/letterboxd.svg" width="230" alt="Letterboxd" /></a><br/><sub>films watched. stars assigned. feelings were involved.</sub></div>\n\n<br/>\n\n${cardStack(data.recent, "letterboxd", "Watched")}`;
}

function appleMusicMarkup(data) {
  const action = data.isNowPlaying ? "now playing" : "recently played";
  return `<a href="${escapeXml(data.link || MUSIC_PROFILE_URL)}"><img src="./assets/activity/apple-music.svg?v=${assetVersion(data)}" width="100%" alt="${action} ${escapeDisplay(data.title)} by ${escapeDisplay(data.artist)}" /></a>\n<div align="center"><sub>a little behind the beat. Apple Music updates arrive in batches , not live.</sub></div>`;
}

function discordMarkup(data) {
  return `<a href="https://discord.com/users/${escapeXml(data.id)}"><img src="./assets/activity/discord.svg?v=${assetVersion(["discord-status-plain", data])}" width="100%" alt="Discord profile @${escapeDisplay(data.username)} , ${escapeDisplay(data.status)}" /></a>`;
}

function instagramMarkup(data) {
  return `<a href="https://www.instagram.com/${escapeXml(data.username)}/"><img src="./assets/activity/instagram.svg?v=${assetVersion(data)}" width="100%" alt="Instagram profile @${escapeDisplay(data.username)}" /></a>`;
}

function signalState(updatedAt) {
  const age = Date.now() - Date.parse(updatedAt);
  return Number.isFinite(age) && age >= 0 && age < SIGNAL_FRESH_MS ? "fresh" : "idle";
}

function signalMarkup(state) {
  return `<img src="./assets/signal-${state}.svg?v=3.6.0" height="14" alt="" />`;
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
  readme = replaceSection(readme, "DISCORD-FEED", discordMarkup(data.discord));
  readme = replaceSection(readme, "INSTAGRAM-FEED", instagramMarkup(data.instagram));
  readme = replaceSection(readme, "PROFILE-SIGNAL-STATE", signalMarkup(signalState(updatedAt)));
  readme = replaceSection(readme, "PROFILE-LAST-UPDATED", `<relative-time datetime="${updatedAt}">a few seconds ago</relative-time>`);
  await fs.writeFile(README_FILE, readme);
}

function dataChanged(previous, current) {
  const old = { goodreads: previous.goodreads, letterboxd: previous.letterboxd, appleMusic: previous.appleMusic, discord: previous.discord, instagram: previous.instagram };
  return JSON.stringify(old) !== JSON.stringify(current);
}

async function main() {
  const [previous, reviewSummaryCache, reviewVoiceInstructions] = await Promise.all([
    readPrevious(),
    readReviewSummaryCache(),
    readReviewVoice(),
  ]);
  const [
    cachedAppleArtwork,
    cachedDiscordAvatar,
    cachedDiscordGuildBadge,
    generatedInstagramAvatar,
    cachedGoodreadsCurrentArtwork,
    ...cachedGoodreadsRecentArtwork
  ] = await Promise.all([
    readEmbeddedImage("apple-music.svg"),
    readEmbeddedImage("discord.svg"),
    readEmbeddedImage("discord.svg", 1),
    readEmbeddedImage("instagram.svg"),
    readEmbeddedImage("goodreads-current.svg"),
    ...Array.from({ length: 4 }, (_value, index) => readEmbeddedImage(`goodreads-${index + 1}.svg`)),
  ]);
  const generatedInstagramBytes = generatedInstagramAvatar
    ? Buffer.from(generatedInstagramAvatar.split(",", 2)[1] || "", "base64").length
    : 0;
  const cachedInstagramAvatar = generatedInstagramBytes >= 1_500 ? generatedInstagramAvatar : null;
  // Start the shared request immediately before both consumers attach so a
  // fast network rejection can never become an unhandled promise.
  const lanyardPromise = readLanyard();
  const [goodreadsResult, letterboxdResult, appleMusicResult, discordResult, instagramResult] = await Promise.all([
    readSource("goodreads", readGoodreads, previous),
    readSource("letterboxd", readLetterboxd, previous),
    readSource("appleMusic", () => readAppleMusic(previous.appleMusic), previous),
    readDiscordSource(previous.discord, lanyardPromise),
    readInstagramSource(previous.instagram, cachedInstagramAvatar),
  ]);
  const current = {
    goodreads: goodreadsResult.data,
    letterboxd: letterboxdResult.data,
    appleMusic: appleMusicResult.data,
    discord: discordResult.data,
    instagram: instagramResult.data,
  };
  const reviewSummaryPlan = prepareReviewSummaryCandidates(current.goodreads?.recent || [], {
    cache: reviewSummaryCache,
    voiceInstructions: reviewVoiceInstructions,
    fallback: reviewFallback,
  });
  current.goodreads = {
    ...current.goodreads,
    recent: reviewSummaryPlan.books,
  };
  const cachedGoodreadsArtwork = {
    current: previous.goodreads?.current?.bookId === current.goodreads?.current?.bookId
      ? cachedGoodreadsCurrentArtwork
      : null,
    recent: current.goodreads.recent.map((book, index) => (
      previous.goodreads?.recent?.[index]?.bookId === book.bookId
        ? cachedGoodreadsRecentArtwork[index]
        : null
    )),
  };
  for (const item of reviewSummaryPlan.warnings) {
    console.warn(`warning: ${item.code}${item.title ? ` (${item.title})` : ""}: ${item.message}`);
  }
  const updatedAt = dataChanged(previous, current) || !previous.updatedAt ? new Date().toISOString() : previous.updatedAt;

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const writes = [];
  writes.push(writeGoodreadsAssets(current.goodreads, cachedGoodreadsArtwork));
  if (letterboxdResult.fresh) writes.push(writeLetterboxdAssets(current.letterboxd));
  if (appleMusicResult.fresh) {
    const sameTrack = normaliseMatchText(previous.appleMusic?.title) === normaliseMatchText(current.appleMusic?.title)
      && normaliseMatchText(previous.appleMusic?.artist) === normaliseMatchText(current.appleMusic?.artist);
    const artwork = (sameTrack ? cachedAppleArtwork : null) || appleMusicResult.artworkData;
    writes.push(fs.writeFile(path.join(OUTPUT_DIR, "apple-music.svg"), renderAppleMusic(current.appleMusic, artwork)));
  }
  if (discordResult.fresh) {
    const sameAvatar = previous.discord?.avatarUrl === current.discord?.avatarUrl;
    const avatar = discordResult.avatarData || (sameAvatar ? cachedDiscordAvatar : null);
    const sameGuildBadge = previous.discord?.guildBadgeUrl === current.discord?.guildBadgeUrl;
    const guildBadge = discordResult.guildBadgeData || (sameGuildBadge ? cachedDiscordGuildBadge : null);
    writes.push(fs.writeFile(path.join(OUTPUT_DIR, "discord.svg"), renderDiscord(current.discord, avatar, guildBadge)));
  }
  if (instagramResult.fresh) {
    writes.push(fs.writeFile(path.join(OUTPUT_DIR, "instagram.svg"), renderInstagram(current.instagram, instagramResult.avatarData || cachedInstagramAvatar)));
  }
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
