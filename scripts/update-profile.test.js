import assert from "node:assert/strict";
import test from "node:test";
import { parseStringPromise } from "xml2js";
import { instagramOgAvatarUrl, normaliseBook, renderBookCurrent, renderBookTile, shouldRefreshInstagram, signalPresentation, staleInstagramData, stars } from "./update-profile.js";
import { ratingMood } from "./review-moods.js";

const now = Date.parse("2026-09-20T12:00:00.000Z");

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
    fallback: "20 Sept 2026, 11:50 UTC",
  });
  assert.equal(signalPresentation(changedAt, new Date(now + 5 * 60_000)).fresh, false);
  assert.equal(signalPresentation("not a date", new Date(now)).fallback, "awaiting a signal");
  assert.equal(signalPresentation("2026-09-20T12:01:00.000Z", new Date(now)).fresh, false);
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
