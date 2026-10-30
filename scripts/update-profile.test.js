import assert from "node:assert/strict";
import test from "node:test";
import { parseStringPromise } from "xml2js";
import { instagramOgAvatarUrl, musicFallback, normaliseBook, parseHistoryCard, readAppleMusic, renderAppleMusic, renderBookCurrent, renderBookTile, shouldRefreshInstagram, signalPresentation, staleInstagramData, stars } from "./update-profile.js";

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
    assert.ok(svg.includes(`>${expected}</text>`));
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
  assert.equal(ratingMood(3.75).color, "#ffe58c");
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
  assert.match(renderBookTile({ title: "Example", published: "2026-10-12" }, null, 1), /published October 2026/);
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


test('public Goodreads fallback moves a finished book and preserves full review and half stars', async () => {
 const {parsePublicGoodreads}=await import('./goodreads-fallback.js');
 const previous={current:{bookId:'1',title:'Book',pages:266,review:'',rating:0,progress:{page:134}},recent:[]};
 const profile='<div id="shelves"><a href="?shelf=currently-reading">currently-reading (0)</a></div>';
 const updates=`<table class="newsfeedUpdates"><tr class="update" data-timestamp="October 28, 2026 07:32"><td><div class="updateAction"><a href="/user/show/178629903-haarshaan">haarshaan</a> rated a book ${[10,10,10,10,6].map(n=>`<span class="staticStar p${n}"></span>`).join('')}</div><a class="bookTitle" href="/book/show/1-book">Book</a></td></tr><tr class="update no_border"><td><span id="reviewTextContainer9"><span id="freeTextContainerreview9">short</span><span id="freeTextreview9">Full review<br>with context.</span><a data-text-id="9">more</a></span></td></tr></table>`;
 const result=parsePublicGoodreads(profile,updates,previous);
 assert.equal(result.current,null);assert.equal(result.recent[0].rating,4.5);
 assert.equal(result.recent[0].review,'Full review with context.');assert.equal(result.recent[0].pages,266);
 assert.equal(result.recent[0].progress,undefined);
 assert.throws(()=>parsePublicGoodreads('<title>Sign in</title>',updates,previous));
 assert.throws(()=>parsePublicGoodreads(profile,updates.replace('p6','p3'),previous));
 assert.throws(()=>parsePublicGoodreads(profile,updates.replace('/user/show/178629903-haarshaan','/user/show/999'),previous));
});

test('public fallback imports a new current edition from the profile page', async()=>{
 const {publicGoodreads,parseEdition}=await import('./goodreads-fallback.js');
 const profile='<div id="shelves"><a href="?shelf=currently-reading">currently-reading (1)</a></div><div id="currentlyReadingReviews"><a class="bookTitle" href="/book/show/456-new">New book</a></div>';
 const updates='<table class="newsfeedUpdates"><tr class="update" data-timestamp="2026-10-29"><td><div class="updateAction"><a href="/user/show/178629903">haarshaan</a> rated a book '+Array(5).fill('<span class="staticStar p10"></span>').join('')+'</div><a class="bookTitle" href="/book/show/123-old">Old book</a></td></tr><tr class="update no_border"><td id="reviewTextContainer9"><span id="freeTextreview9">Loved it.</span></td></tr></table>';
 const html='<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{apolloState:{b:{__typename:'Book',legacyId:456,title:'New book',webUrl:'https://www.goodreads.com/book/show/456',primaryContributorEdge:{node:{__ref:'a'}},details:{numPages:390,publicationTime:1767225600000}},a:{name:'Author'}}}}})+'</script>';
 let requests=0;
 const result=await publicGoodreads(profile,updates,{current:null,recent:[{bookId:'123',title:'Old book'}]},async url=>{requests++;assert.match(url,/\/456$/);return html;});
 assert.equal(requests,1);assert.equal(result.current.title,'New book');assert.equal(result.current.pages,390);assert.equal(result.current.rating,0);assert.equal(result.recent[0].review,'Loved it.');
 assert.throws(()=>parseEdition(html,'789'),/mismatched/);
});
