import assert from "node:assert/strict";
import test from "node:test";
import { parseStringPromise } from "xml2js";
import { instagramOgAvatarUrl, musicFallback, normaliseBook, parseHistoryCard, readAppleMusic, readLetterboxd, renderAppleMusic, renderBookCurrent, renderBookTile, renderFilmTile, shouldRefreshInstagram, signalPresentation, staleInstagramData, stars } from "./update-profile.js";
import { parseEdition, publicGoodreads, refreshGoodreadsMetadata } from "./goodreads-fallback.js";

test("Apple Music owns its delay note without increasing card height", () => {
  const svg = renderAppleMusic({ title: "Example", artist: "Artist", source: "apple-history", playbackState: "recent" }, null);
  assert.match(svg, /height="270" viewBox="0 0 860 270"/);
  assert.match(svg, /updates may be delayed , not live/);
  assert.match(svg, /<g transform="translate\(0 -19\)"><rect x="357" y="211"/);
  assert.match(svg, /<tspan x="405" y="168">/);
  assert.match(svg, /font-style="italic">a little behind the beat/);
  assert.match(svg, /y="48"[^>]*>OPEN IN APPLE MUSIC/);
  const unavailable = renderAppleMusic({ title: "Waiting", artist: "", source: "unavailable", playbackState: "unknown" }, null);
  assert.match(unavailable, /history paused · reconnect to resume/);
});
import { ratingMood } from "./rating-colors.js";
import { dataChanged, freshnessMarkup, readingBadgeLabel, recordFeedChecks, renderReadingBadge, readSource, requireRssChannel } from "./update-profile.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const now = Date.parse("2026-09-20T12:00:00.000Z");

test("unverified history and preview tracks cannot survive as actual playback", () => {
  for (const source of ["apple-history", "music-app-preview", "unavailable"]) {
    const safe = musicFallback({ title: "The Abyss", source, observedAt: "2026-09-20T11:59:30Z" }, now);
    assert.equal(safe.source, "unavailable");
    assert.equal(safe.isNowPlaying, false);
    assert.doesNotMatch(renderAppleMusic(safe, null), /The Abyss|RECENTLY PLAYED|NOW PLAYING/);
  }
});

test("Music.app observations are retained but stale playback is not advertised as live", () => {
  const previous = { source: "music-app", title: "Confirmed song", playbackState: "playing", observedAt: "2026-09-20T11:59:30Z" };
  assert.equal(musicFallback(previous, now).isNowPlaying, true);
  const stale = musicFallback(previous, now + 5 * 60_000);
  assert.equal(stale.title, "Confirmed song");
  assert.equal(stale.isNowPlaying, false);
  assert.equal(stale.playbackState, "stopped");
  assert.equal(musicFallback({ ...previous, observedAt: "invalid" }, now).source, "unavailable");
});

test("scheduled music refresh does not reuse the disputed UID without explicit reconnection", async (t) => {
  const originalEvent = process.env.MUSIC_EVENT_JSON;
  const originalUid = process.env.APPLE_MUSIC_HISTORY_UID;
  t.after(() => {
    for (const [key, value] of [["MUSIC_EVENT_JSON", originalEvent], ["APPLE_MUSIC_HISTORY_UID", originalUid]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  delete process.env.MUSIC_EVENT_JSON;
  delete process.env.APPLE_MUSIC_HISTORY_UID;
  const result = await readAppleMusic({ source: "apple-history", title: "The Abyss" });
  assert.equal(result.data.source, "unavailable");
  process.env.MUSIC_EVENT_JSON = JSON.stringify({ state: "stopped" });
  assert.equal((await readAppleMusic({ source: "apple-history", title: "The Abyss" })).data.source, "unavailable");
});

test("history card parsing rejects error cards rather than promoting them to songs", () => {
  assert.throws(() => parseHistoryCard('<svg><text>Reconnect Apple Music</text></svg>'), /track metadata/);
  assert.deepEqual(parseHistoryCard('<h1 class="song-title text-gray-500">Song &amp; Song</h1><h2 class="song-artist">Artist</h2>'), { title: "Song & Song", artist: "Artist" });
});

test("Goodreads RSS preserves all twenty quarter-star increments end to end", async () => {
  const fractions = ["", "¼", "½", "¾"];
  for (let quarters = 1; quarters <= 20; quarters += 1) {
    const rating = quarters / 4;
    const feed = await parseStringPromise(`<item><title>Example</title><user_rating>${rating}</user_rating></item>`);
    const book = normaliseBook(feed.item);
    assert.equal(book.rating, rating);
    const expected = "★".repeat(Math.floor(rating)) + fractions[quarters % 4];
    assert.equal(stars(book.rating), expected);
    const svg = renderBookTile(book, null, 0);
    assert.equal((svg.match(/<clipPath id="rating-star-/g) || []).length, 5);
    for(let i=0;i<5;i++) assert.ok(svg.includes(`id="rating-star-${i}"><rect width="${20*Math.max(0,Math.min(1,rating-i))}" height="20"`));
    assert.ok(!/[¼½¾]/.test(svg));
    assert.ok(svg.includes(`>${rating}</text>`));
    assert.ok(svg.includes(`aria-label="${rating} out of 5 stars"`));
    await parseStringPromise(svg);
  }
});

test("missing and invalid ratings do not become fabricated stars", () => {
  for (const value of [undefined, null, "", "not rated", -1, 6, Infinity, NaN]) {
    assert.equal(normaliseBook({ user_rating: [value] }).rating, 0);
    assert.equal(stars(value), "unrated");
  }
  assert.equal(stars(3.3), "3.3 ★");
  assert.equal(stars(3.5), "★★★½"); // Letterboxd's half stars remain unchanged.
});

test("quarter-star colours use the actual rating without rounding up", () => {
  assert.equal(ratingMood(2.75).color, "#ff9f9a");
  assert.equal(ratingMood(3.25).color, "#ffe58c");
  assert.equal(ratingMood(3.75).color, "#8edfd4");
  assert.equal(ratingMood(4.25).color, "#8edfd4");
});

test("signal reflects the last actual feed change, not the last scheduled check", () => {
  const changedAt = "2026-09-20T11:50:00.000Z";
  assert.deepEqual(signalPresentation(changedAt, new Date(now)), {
    fresh: true,
    datetime: changedAt,
    fallback: "10 minutes ago",
  });
  assert.equal(signalPresentation(changedAt, new Date(now + 5 * 60_000)).fresh, false);
  assert.equal(signalPresentation("not a date", new Date(now)).fallback, "awaiting a signal");
  assert.equal(signalPresentation("2026-09-20T12:01:00.000Z", new Date(now)).fresh, false);
});

test("mobile timestamp fallback stays relative with singular and plural units", () => {
  for (const [minutes, expected] of [[0, "just now"], [1, "1 minute ago"], [52, "52 minutes ago"], [60, "1 hour ago"], [120, "2 hours ago"], [1440, "1 day ago"], [2880, "2 days ago"]]) {
    const at = new Date(now - minutes * 60_000).toISOString();
    assert.equal(signalPresentation(at, new Date(now)).fallback, expected);
  }
  const markup = freshnessMarkup(new Date(now - 52 * 60_000).toISOString(), { checkedAt: new Date(now - 60_000).toISOString() }, new Date(now));
  assert.match(markup, />52 minutes ago<\/relative-time>/);
  assert.match(markup, />1 minute ago<\/relative-time>/);
});

test("Instagram refresh is elapsed-time based, not tied to a five-minute UTC window", () => {
  const cached = "data:image/jpeg;base64,abc";
  assert.equal(shouldRefreshInstagram({ avatarHash: "abc" }, cached, now), true);
  assert.equal(shouldRefreshInstagram({ lastSuccessAt: "2026-09-19T12:01:00.000Z" }, cached, now), false);
  assert.equal(shouldRefreshInstagram({ lastSuccessAt: "2026-09-19T11:59:00.000Z" }, cached, now), true);
  assert.equal(shouldRefreshInstagram({ lastSuccessAt: "2026-09-18T00:00:00.000Z", lastAttemptAt: "2026-09-20T10:00:00.000Z" }, cached, now), false);
  assert.equal(shouldRefreshInstagram({ lastSuccessAt: "2026-09-18T00:00:00.000Z", lastAttemptAt: "2026-09-20T05:00:00.000Z" }, cached, now), true);
});

test("a failed Instagram retry preserves the last verified avatar hash", () => {
  const previous = { username: "hnitch", avatarHash: "verified-avatar-hash" };
  assert.deepEqual(staleInstagramData(previous, "data:image/jpeg;base64,abc", "2026-09-20T12:00:00.000Z"), {
    ...previous,
    lastAttemptAt: "2026-09-20T12:00:00.000Z",
  });
});

test("Instagram metadata uses the named profile and a constrained image host", () => {
  const title = '<meta property="og:title" content="hn (&#064;hnitch) &#x2022; Instagram photos and videos" />';
  assert.equal(instagramOgAvatarUrl(`${title}<meta property="og:image" content="https://scontent.cdninstagram.com/avatar.jpg?x=1&amp;y=2" />`), "https://scontent.cdninstagram.com/avatar.jpg?x=1&y=2");
  assert.equal(instagramOgAvatarUrl(`${title}<meta property="og:image" content="https://example.com/avatar.jpg" />`), null);
  assert.equal(instagramOgAvatarUrl('<meta property="og:title" content="Someone else" /><meta property="og:image" content="https://scontent.cdninstagram.com/avatar.jpg" />'), null);
});

test("current-book card handles percentage-only progress", () => {
  const svg = renderBookCurrent({
    title: "Verity",
    author: "Colleen Hoover",
    progress: { page: null, total: null, percent: 23, source: "shortcut" },
  }, null);
  assert.match(svg, /23% read/);
  assert.match(svg, /VIEW ON GOODREADS ↗/);
  assert.doesNotMatch(svg, /null/);
});

test("finished-book card separates source publication facts from personal reading facts", () => {
  const svg = renderBookTile({
    title: "A Very Long Book Title That Needs Space to Wrap Beside Its Publication Details",
    author: "Example Author",
    pages: 341,
    readAt: "2026-09-20T00:00:00Z",
    published: "2018",
    averageRating: 4.28,
    rating: 2,
    review: "",
  }, null, 0);
  assert.match(svg, /published 2018/);
  assert.match(svg, /GR avg 4\.28/);
  assert.match(svg, /341p · read Sep 2026/);
  assert.match(svg, /M632 65v52/);
  assert.doesNotMatch(svg, /published Sep 2026/);
  assert.match(renderBookTile({ title: "Example", published: "2026-10-12" }, null, 1), /published Oct 2026/);
  const current = renderBookCurrent({ title: "Example", published: "2026-10-12", averageRating: 4.28, pages: 341 }, null);
  assert.match(current, /341 pages · Oct 2026 · GR avg 4\.28/);
});

test("Letterboxd uses the general opening and switches the label on release day", async () => {
  const url = "https://letterboxd.com/film/example/";
  const undated = "https://letterboxd.com/film/undated/";
  const listings = (url, general) => `<meta property="og:url" content="${url}">
    <script type="application/ld+json">{"@type":"Movie","url":"${url}","dateCreated":"2026-10-03"}</script>
    <section id="tab-panel-releases-by-date">
      <h3 class="release-table-title">Premiere</h3>
      <div class="release-table"><div class="cell"><h5 class="date">03 Oct 2026</h5></div></div>
      <h3 class="release-table-title">Theatrical limited</h3>
      <div class="release-table"><div class="cell"><h5 class="date">30 Oct 2026</h5></div></div>
      ${general ? `<h3 class="release-table-title">Theatrical</h3>
        <div class="release-table">
          <div class="cell"><h5 class="date">20 Nov 2026</h5></div>
          <div class="cell"><h5 class="date">19 Nov 2026</h5></div>
        </div>` : ""}
    </section>`;
  const rss = (rewatch = "") => `<rss><channel>
    <item><title>Example</title><link>https://letterboxd.com/hnitch/film/example/${rewatch}</link>
      <letterboxd:filmYear>2026</letterboxd:filmYear><letterboxd:watchedDate>2026-11-12</letterboxd:watchedDate>
    </item><item><title>Undated film</title><link>https://letterboxd.com/hnitch/film/undated/</link>
      <letterboxd:filmYear>2026</letterboxd:filmYear>
    </item></channel></rss>`;
  const requests = [];
  const checkedAt = new Date("2026-11-18T15:30:00Z");
  const previous = { recent: [{ link: url, released: "2026-10-03" }] };
  const { data, metadataChecks } = await readLetterboxd(previous, { [url]: checkedAt.toISOString() }, async target => {
    requests.push(target);
    return target.endsWith("/rss/") ? rss() : listings(target, target === url);
  }, checkedAt);
  assert.equal(requests.length, 3);
  assert.equal(data.recent[0].releaseDate, "2026-11-19");
  assert.equal(data.recent[0].releaseUpcoming, true);
  assert.equal(data.recent[1].releaseDate, undefined);
  assert.match(renderFilmTile(data.recent[0], null, 0), /releases Nov 2026/);
  assert.match(renderFilmTile(data.recent[1], null, 1), />2026<\/text>/);
  const previousRequestCount = requests.length;
  const again = await readLetterboxd(data, metadataChecks, async target => {
    requests.push(target);
    return rss("1/");
  }, new Date("2026-11-18T16:00:00Z"));
  assert.deepEqual(requests.slice(previousRequestCount), ["https://letterboxd.com/hnitch/rss/"]);
  assert.equal(again.data.recent[0].releaseDate, "2026-11-19");
  assert.match(renderFilmTile(again.data.recent[0], null, 0), /released Nov 2026/);
  assert.equal(again.metadataChecks[undated], metadataChecks[undated]);
});

test("Letterboxd uses a series' first air date when its release listings are empty", async () => {
  const { data } = await readLetterboxd(null, {}, async target => {
    if (target.endsWith("/rss/")) return `<rss><channel><item><title>Series</title>
      <link>https://letterboxd.com/hnitch/film/series/</link><letterboxd:filmYear>2026</letterboxd:filmYear>
      <tmdb:tvId>123</tmdb:tvId></item></channel></rss>`;
    if (target === "https://letterboxd.com/film/series/") return '<meta property="og:url" content="https://letterboxd.com/film/series/">';
    assert.equal(target, "https://www.themoviedb.org/tv/123");
    return `<script type="application/ld+json">
      {"@type":"TVSeries","url":"https://www.themoviedb.org/tv/123-series","startDate":"2026-10-07T00:00:00Z"}
    </script>`;
  }, new Date("2026-11-15T00:00:00Z"));
  assert.equal(data.recent[0].releaseDate, "2026-10-07");
});

test("reading badge adapts without introducing an external image dependency", async () => {
  assert.equal(readingBadgeLabel(null), "between books , allegedly");
  assert.equal(readingBadgeLabel({ title: "A Book" }), "currently reading , probably");
  for (const book of [null, { title: "A Book" }]) {
    const svg = renderReadingBadge(book);
    assert.match(svg, /height="28"/);
    assert.match(svg, /rx="14"/);
    assert.doesNotMatch(svg, /<image|<script|shields\.io/);
    await parseStringPromise(svg);
  }
});

test("review link cue is visible without changing card height or inventing a written review", () => {
  const written = renderBookTile({ title: "Book", review: "beautiful prose", rating: 3.25 }, null, 0);
  assert.match(written, /read full review ↗/);
  assert.match(written, /width="860" height="242"/);
  const unwritten = renderBookTile({ title: "Book", review: "" }, null, 0);
  assert.match(unwritten, /view on Goodreads ↗/);
  assert.doesNotMatch(unwritten, /read full review ↗/);
});

test("a rated book with a review placeholder shows both the score and the placeholder", () => {
  const book = normaliseBook({ title: ["Book"], user_rating: ["3.75"], user_review: ["RTC..."] });
  assert.equal(book.review, "");
  const svg = renderBookTile(book, null, 0);
  assert.match(svg, /aria-label="3\.75 out of 5 stars"/);
  assert.match(svg, />RTC\.\.\.<\/text>/);
  assert.doesNotMatch(svg, /rating pending|read (?:the )?full review/);
});

test("check timestamps advance independently of content changes", () => {
  const at = new Date(now).toISOString();
  const source = { goodreads: { current: null, recent: [] }, letterboxd: { recent: [] }, appleMusic: {}, instagram: { username: "hnitch", avatarHash: "a" } };
  const checks = recordFeedChecks({}, { goodreads: { checkStatus: "ok" } }, new Date(now));
  assert.equal(checks.checkedAt, at);
  assert.equal(checks.sources.goodreads.lastSuccessAt, at);
  assert.equal(dataChanged({ ...source, feedChecks: {} }, { ...source, feedChecks: checks }), false);
  assert.equal(dataChanged(source, { ...source, goodreads: { current: { title: "New book" }, recent: [] } }), true);
});

test("failed, paused, and cached sources cannot receive invented success timestamps", () => {
  const oldAt = "2026-09-19T12:00:00.000Z";
  const old = { sources: { goodreads: { checkedAt: oldAt, lastSuccessAt: oldAt } } };
  const checks = recordFeedChecks(old, {
    goodreads: { checkStatus: "delayed" },
    appleMusic: { checkStatus: "paused" },
    instagram: { checkStatus: "delayed-cached", data: { lastAttemptAt: oldAt, lastSuccessAt: "2026-09-18T12:00:00Z" } },
    letterboxd: { checkStatus: "ok" },
  }, new Date(now));
  assert.equal(checks.sources.goodreads.lastSuccessAt, oldAt);
  assert.equal(checks.sources.goodreads.checkedAt, new Date(now).toISOString());
  assert.equal(checks.sources.appleMusic.lastSuccessAt, null);
  assert.equal(checks.sources.appleMusic.checkedAt, null);
  assert.equal(checks.sources.instagram.checkedAt, oldAt);
  assert.equal(checks.sources.instagram.status, "delayed");
  const markup = freshnessMarkup(oldAt, checks, new Date(now));
  assert.doesNotMatch(markup.replace(/<[^>]*>/g, ""), /delayed|paused/);
  assert.match(markup, /Goodreads delayed; Instagram delayed; Apple Music paused/);
  assert.match(markup, /signal-delayed/);
  assert.equal((markup.match(/<br\/>/g) || []).length, 2); // GitHub's kbd line-height needs a small inter-line gap.
  assert.doesNotMatch(markup, /width="100%"|<table/);
});

test("freshness strip handles first run and separate healthy check and change clocks", () => {
  assert.match(freshnessMarkup(null, null, new Date(now)), /awaiting first check/);
  const changedAt = "2026-09-19T12:00:00.000Z";
  const checks = recordFeedChecks({}, { goodreads: { checkStatus: "ok" } }, new Date(now));
  const markup = freshnessMarkup(changedAt, checks, new Date(now));
  assert.match(markup, /signal-idle/);
  assert.match(markup, /signal-fresh/);
  assert.match(markup, new RegExp(`datetime="${changedAt}"`));
  assert.match(markup, new RegExp(`datetime="${checks.checkedAt}"`));
  assert.match(markup, /content change/);
  assert.match(markup, /feeds checked/);
});

test("upstream failures keep fallback rendering but report delayed checks", async () => {
  const failing = async () => { throw new Error("test source unavailable"); };
  const books = { current: null, recent: [] };
  const result = await readSource("goodreads", failing, { goodreads: books });
  assert.equal(result.data, books);
  assert.equal(result.checkStatus, "delayed");
  assert.equal(result.fresh, false);
  const music = await readSource("appleMusic", failing, {});
  assert.equal(music.fresh, true); // Rewrite the honest fallback card.
  assert.equal(music.checkStatus, "delayed"); // Never advertise a successful poll.
  const paused = await readSource("appleMusic", async () => ({ data: {}, checkStatus: "paused" }), {});
  assert.equal(paused.checkStatus, "paused");
});

test("HTML and malformed source responses cannot clear a shelf or fake healthy checks", () => {
  for (const feed of [{}, { html: {} }, { rss: {} }, { rss: { channel: [""] } }]) {
    assert.throws(() => requireRssChannel(feed), /valid RSS channel/);
  }
  assert.doesNotThrow(() => requireRssChannel({ rss: { channel: [{ title: ["Shelf"] }] } }));
});

test("hero heading uses portable outlines, retaining the accessible title and dimensions", async () => {
  const svg = await fs.readFile(new URL("../assets/hero.svg", import.meta.url), "utf8");
  assert.match(svg, /width="880" height="300"/);
  assert.match(svg, /data-typeface="HelveticaNeue-MediumItalic"/);
  assert.match(svg, /aria-label="hii , i'm hn"/);
  assert.match(svg, /<path d="M/);
  assert.doesNotMatch(svg, /@font-face|font-size="57" font-weight="700"/);
  await parseStringPromise(svg);
});

test("cached rendering keeps both timestamps and the compact strip without increasing card counts", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hnitch-status-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "assets/activity"), { recursive: true });
  await fs.mkdir(path.join(root, "data"));
  const repo = new URL("../", import.meta.url);
  const snapshot = JSON.parse(await fs.readFile(new URL("data/activity.json", repo), "utf8"));
  snapshot.feedChecks = recordFeedChecks({}, { goodreads: { checkStatus: "ok" } }, new Date(now));
  const data = JSON.stringify(snapshot);
  await fs.writeFile(path.join(root, "data/activity.json"), data);
  await fs.copyFile(new URL("README.md", repo), path.join(root, "README.md"));
  await fs.copyFile(new URL("data/book-notes.json", repo), path.join(root, "data/book-notes.json"));
  execFileSync(process.execPath, [fileURLToPath(new URL("update-profile.js", import.meta.url)), "--render-cached"], { cwd: root });
  assert.equal(await fs.readFile(path.join(root, "data/activity.json"), "utf8"), data);
  const readme = await fs.readFile(path.join(root, "README.md"), "utf8");
  assert.ok(readme.includes(`datetime="${snapshot.updatedAt}"`));
  assert.ok(readme.includes(`datetime="${snapshot.feedChecks.checkedAt}"`));
  assert.equal((readme.match(/alt="Read:/g) || []).length, snapshot.goodreads.recent.length);
  assert.equal((readme.match(/alt="Watched:/g) || []).length, snapshot.letterboxd.recent.length);
  assert.match(readme, /reading-status\.svg\?v=/);
  assert.match(readme, /<!-- PROFILE-FRESHNESS:END -->\s*<\/div>\s*<br\/>\s*<!-- GOODREADS-FEED:START -->/);
  assert.doesNotMatch(readme, /img\.shields\.io\/badge\/currently/);
  const finished = snapshot.goodreads.recent[0];
  await fs.writeFile(path.join(root, "data/book-editions.json"), JSON.stringify({ [finished.bookId]: { total: 777 } }));
  execFileSync(process.execPath, [fileURLToPath(new URL("update-profile.js", import.meta.url)), "--render-cached"], { cwd: root });
  const corrected = JSON.parse(await fs.readFile(path.join(root, "data/activity.json"), "utf8"));
  assert.equal(corrected.goodreads.recent[0].pages, 777);
  assert.equal(corrected.updatedAt, snapshot.updatedAt);
  assert.deepEqual(corrected.feedChecks, snapshot.feedChecks);
  assert.match(await fs.readFile(path.join(root, "assets/activity/goodreads-1.svg"), "utf8"), /777p/);
});

test("wrapped waiting title has breathing room before its playback explanation", () => {
  const svg = renderAppleMusic(musicFallback(), null);
  const headingLines = [...svg.matchAll(/<tspan x="356" y="(\d+)">/g)].map(m => Number(m[1]));
  const subtitle = svg.match(/<text[^>]*font-size="(\d+)"[^>]*><tspan x="357" y="(\d+)">no verified playback available/);
  assert.equal(headingLines.length, 2);
  assert.ok(subtitle, "the waiting explanation is visible");
  const subtitleTop = Number(subtitle[2]) - Number(subtitle[1]);
  assert.ok(subtitleTop - Math.max(...headingLines) >= 14, "keep a clear gap after the wrapped title");
  assert.ok(192 - Number(subtitle[2]) >= 20, "keep space above the status pill too");
});

test("Goodreads preserves an RTC placeholder with emoji and accepts a later written review", async () => {
 const { goodreadsReview } = await import('./goodreads-fallback.js');
 for (const text of ['rtc 🤭', 'R. T. C. ✨', 'review to come 🫶🏽']) {
  assert.deepEqual(goodreadsReview(text), { review: '', reviewPlaceholder: text });
 }
 const book = { title: 'Book', rating: null, ratingSource: 'unavailable', displayRating: 4.3 };
 const pending = renderBookTile({ ...book, review: 'rtc 🤭' }, null, 0);
 assert.match(pending, />rtc 🤭<\/text>/);
 assert.match(pending, />view on Goodreads ↗<\/text>/);
 assert.doesNotMatch(pending, /read (?:the )?full review|>4\.3<\/text>/);
 assert.match(pending, /fill="#8edfd4"/);
 const review = 'RTC was my placeholder. I loved every page once I got past the opening.';
 assert.deepEqual(goodreadsReview(review), { review });
 const written = renderBookTile({ ...book, review, reviewPlaceholder: 'rtc 🤭' }, null, 0);
 assert.match(written, />read the full review ↗<\/text>/);
 assert.doesNotMatch(written, />rtc 🤭<\/text>/);
});

test('public Goodreads fallback moves a finished book and preserves full review without guessing ambiguous fractions', async () => {
 const {parsePublicGoodreads}=await import('./goodreads-fallback.js');
 const previous={current:{bookId:'1',title:'Book',pages:266,review:'',rating:0,progress:{page:134}},recent:[]};
 const profile='<div id="shelves"><a href="?shelf=currently-reading">currently-reading (0)</a></div>';
 const updates=`<table class="newsfeedUpdates"><tr class="update" data-timestamp="October 28, 2026 07:32"><td><div class="updateAction"><a href="/user/show/178629903-haarshaan">haarshaan</a> rated a book ${[10,10,10,10,6].map(n=>`<span class="staticStar p${n}"></span>`).join('')}</div><a class="bookTitle" href="/book/show/1-book">Book</a></td></tr><tr class="update no_border"><td><span id="reviewTextContainer9"><span id="freeTextContainerreview9">short</span><span id="freeTextreview9">Full review<br>with context.</span><a data-text-id="9">more</a></span></td></tr></table>`;
 const result=parsePublicGoodreads(profile,updates,previous);
 assert.equal(result.current,null);assert.equal(result.recent[0].rating,null);
 assert.equal(result.recent[0].ratingSource,"unavailable");
 assert.equal(result.recent[0].displayRating,4.6);
 const unknownExact=renderBookTile(result.recent[0],null,0);
 assert.match(unknownExact,/id="rating-star-4"/);
 assert.doesNotMatch(unknownExact,/rating pending|>4\.6<\/text>/);
 const exactReview=updates.replace('Full review<br>with context.', "The previous book was a 4.5 star for me. I'm keeping this at 4.75 rather than giving it the full five stars.");
 const explicit=parsePublicGoodreads(profile,exactReview,previous).recent[0];
 assert.equal(explicit.rating,4.75);
 assert.equal(explicit.ratingSource,'review-text');
 assert.equal(parsePublicGoodreads(profile,updates.replace('Full review<br>with context.','The previous book was a 4.5 star for me.'),previous).recent[0].rating,null);
 assert.equal(parsePublicGoodreads(profile,updates.replace('Full review<br>with context.',"I'm giving this 4.25 stars."),previous).recent[0].rating,4.25);
 assert.equal(parsePublicGoodreads(profile,updates.replace('Full review<br>with context.',"I'm giving this 3.75 stars."),previous).recent[0].rating,null);
 for(const rating of [4.25,4.5,4.75]) {
  const exact={current:{...previous.current,rating,ratingSource:"numeric-feed"},recent:[]};
  assert.equal(parsePublicGoodreads(profile,updates,exact).recent[0].rating,rating);
 }
 assert.equal(result.recent[0].review,'Full review with context.');assert.equal(result.recent[0].pages,266);
 assert.equal(result.recent[0].progress,undefined);
 const withoutReview=updates.replace(/<tr class="update no_border">.*?<\/tr>/, '<tr class="feedFooterReview" id="update_comment_stuff_Review9"><td></td></tr>');
 const ratedOnly=parsePublicGoodreads(profile,withoutReview.replace('p6','p10'),previous).recent[0];
 assert.equal(ratedOnly.rating,5);
 assert.equal(ratedOnly.review,'');
 assert.equal(ratedOnly.link,'https://www.goodreads.com/review/show/9');
 assert.throws(()=>parsePublicGoodreads('<title>Sign in</title>',updates,previous));
 const quarterStar = parsePublicGoodreads(profile, updates.replace('p6', 'p3'), previous);
 assert.equal(quarterStar.current, null);
 assert.equal(quarterStar.recent[0].rating, null);
 assert.equal(quarterStar.recent[0].displayRating, 4.3);
 assert.equal(quarterStar.recent[0].readAt, 'October 28, 2026 07:32');
 assert.equal(parsePublicGoodreads(profile, updates.replace('p6','p3').replace('Full review<br>with context.', "I'm giving this 4.25 stars."), previous).recent[0].rating, 4.25);
 const unknown = parsePublicGoodreads(profile, updates.replace('p6', 'p99'), previous);
 assert.equal(unknown.current, null);
 assert.equal(unknown.recent[0].rating, null);
 assert.equal(unknown.recent[0].displayRating, undefined);
 assert.match(renderBookTile(unknown.recent[0], null, 0), />rated on Goodreads<\/text>/);
 assert.throws(()=>parsePublicGoodreads(profile,updates.replace('/user/show/178629903-haarshaan','/user/show/999'),previous));
});

test('public fallback imports a new current edition from the profile page', async()=>{
 const profile='<div id="shelves"><a href="?shelf=currently-reading">currently-reading (1)</a></div><div id="currentlyReadingReviews"><a class="bookTitle" href="/book/show/456-new">New book</a></div>';
 const updates='<table class="newsfeedUpdates"><tr class="update" data-timestamp="2026-10-29"><td><div class="updateAction"><a href="/user/show/178629903">haarshaan</a> rated a book '+Array(5).fill('<span class="staticStar p10"></span>').join('')+'</div><a class="bookTitle" href="/book/show/123-old">Old book</a></td></tr><tr class="update no_border"><td id="reviewTextContainer9"><span id="freeTextreview9">Loved it.</span></td></tr></table>';
 const state = {
  b: {
   __typename: 'Book', legacyId: 456, title: 'New book', titleComplete: 'New book (Series, #2)',
   webUrl: 'https://www.goodreads.com/book/show/456', primaryContributorEdge: {node: {__ref: 'a'}},
   details: {numPages: 390, publicationTime: Date.parse('2026-10-12')}, work: {__ref: 'w'},
  },
  w: {__typename: 'Work', stats: {averageRating: 4.42}, details: {publicationTime: Date.parse('2026-09-12')}},
  a: {name: 'Author'},
 };
 const html = `<script id="__NEXT_DATA__">${JSON.stringify({props: {pageProps: {apolloState: state}}})}</script>
   <script type="application/ld+json">{"@type":"Book","name":"Other book","aggregateRating":{"ratingValue":1.2}}</script>`;
 let requests=0;
 const result=await publicGoodreads(profile,updates,{current:null,recent:[{bookId:'123',title:'Old book'}]},async id=>{requests++;assert.equal(id,'456');return parseEdition(html,id);});
 assert.equal(requests,1);assert.equal(result.current.title,'New book');assert.equal(result.current.pages,390);assert.equal(result.current.rating,0);assert.equal(result.recent[0].review,'Loved it.');
 assert.equal(result.current.averageRating, 4.42);
 assert.equal(result.current.published, '2026-10-12');
 assert.ok(result.current.readingSessionId);
 const again=await publicGoodreads(profile,updates,result,async()=>{throw Error('unexpected fetch');});
 assert.equal(again.current.readingSessionId,result.current.readingSessionId);
 const reread=await publicGoodreads(profile,updates,{current:null,recent:[result.current,...result.recent]},async()=>{throw Error('unexpected fetch');});
 assert.notEqual(reread.current.readingSessionId,result.current.readingSessionId);
 assert.equal(reread.current.progress,undefined);
 assert.throws(()=>parseEdition(html,'789'),/mismatched/);
});

test("Goodreads enriches an existing read receipt and retains confirmed facts during an outage", async () => {
  const book = { bookId: "123", pages: 450, published: "2026", averageRating: null, readAt: "2026-11-05", rating: 3.75 };
  const shelf = { current: null, recent: [book] };
  const { data, metadataChecks } = await refreshGoodreadsMetadata(shelf, shelf, async id => {
    assert.equal(id, book.bookId);
    return { pages: 420, published: "2026-10-08", averageRating: 4.13, rating: 0 };
  }, { now: new Date("2026-11-12") });
  assert.deepEqual(data.recent[0], { ...book, published: "2026-10-08", averageRating: 4.13 });
  let requests = 0;
  const unavailable = async () => {
    requests++;
    throw Error("Edition page temporarily unavailable");
  };
  const again = await refreshGoodreadsMetadata(shelf, data, unavailable, {
    checks: metadataChecks, now: new Date("2026-11-12T12:00:00Z"),
  });
  assert.equal(requests, 0);
  assert.deepEqual(again, { data, metadataChecks });
  const delayed = await refreshGoodreadsMetadata(shelf, data, unavailable, {
    checks: metadataChecks, now: new Date("2026-11-13T12:00:00Z"),
  });
  assert.equal(requests, 1);
  assert.deepEqual(delayed.data, data);
  assert.equal(dataChanged({ goodreads: data, metadataChecks }, { goodreads: delayed.data, metadataChecks: delayed.metadataChecks }), false);
});
