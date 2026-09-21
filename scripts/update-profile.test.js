import assert from "node:assert/strict";
import test from "node:test";
import { instagramOgAvatarUrl, renderBookCurrent, shouldRefreshInstagram, signalPresentation, staleInstagramData } from "./update-profile.js";

const now = Date.parse("2026-09-20T12:00:00.000Z");

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
