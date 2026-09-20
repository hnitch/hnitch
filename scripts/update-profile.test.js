import assert from "node:assert/strict";
import test from "node:test";
import { instagramOgAvatarUrl, readFableProgress, renderBookCurrent, shouldRefreshInstagram } from "./update-profile.js";

const now = Date.parse("2026-09-20T12:00:00.000Z");

test("Instagram refresh is elapsed-time based, not tied to a five-minute UTC window", () => {
  const cached = "data:image/jpeg;base64,abc";
  assert.equal(shouldRefreshInstagram({ avatarHash: "abc" }, cached, now), true);
  assert.equal(shouldRefreshInstagram({ lastSuccessAt: "2026-09-19T12:01:00.000Z" }, cached, now), false);
  assert.equal(shouldRefreshInstagram({ lastSuccessAt: "2026-09-19T11:59:00.000Z" }, cached, now), true);
  assert.equal(shouldRefreshInstagram({ lastSuccessAt: "2026-09-18T00:00:00.000Z", lastAttemptAt: "2026-09-20T10:00:00.000Z" }, cached, now), false);
  assert.equal(shouldRefreshInstagram({ lastSuccessAt: "2026-09-18T00:00:00.000Z", lastAttemptAt: "2026-09-20T05:00:00.000Z" }, cached, now), true);
});

test("Instagram metadata uses the named profile and a constrained image host", () => {
  const title = '<meta property="og:title" content="hn (&#064;hnitch) &#x2022; Instagram photos and videos" />';
  assert.equal(instagramOgAvatarUrl(`${title}<meta property="og:image" content="https://scontent.cdninstagram.com/avatar.jpg?x=1&amp;y=2" />`), "https://scontent.cdninstagram.com/avatar.jpg?x=1&y=2");
  assert.equal(instagramOgAvatarUrl(`${title}<meta property="og:image" content="https://example.com/avatar.jpg" />`), null);
  assert.equal(instagramOgAvatarUrl('<meta property="og:title" content="Someone else" /><meta property="og:image" content="https://scontent.cdninstagram.com/avatar.jpg" />'), null);
});

test("Fable is optional without exposing or inventing progress", async () => {
  const previousToken = process.env.FABLE_AUTH_TOKEN;
  delete process.env.FABLE_AUTH_TOKEN;
  try {
    assert.equal(await readFableProgress({ title: "Verity", author: "Colleen Hoover" }), null);
  } finally {
    if (previousToken === undefined) delete process.env.FABLE_AUTH_TOKEN;
    else process.env.FABLE_AUTH_TOKEN = previousToken;
  }
});

test("authenticated Fable response can override only the matching progress", async () => {
  const previousToken = process.env.FABLE_AUTH_TOKEN;
  const previousFetch = global.fetch;
  const calls = [];
  process.env.FABLE_AUTH_TOKEN = "test-token";
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), auth: options.headers.Authorization });
    const payload = String(url).includes("books?limit=")
      ? { results: [{ book: { title: "Verity", authors: [{ name: "Colleen Hoover" }], page_count: 336 }, reading_progress: { current_page: 128, page_count: 320 } }], next: null }
      : { results: [{ id: "current-list", system_type: "current_reading", privacy: "everyone" }] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    assert.deepEqual(await readFableProgress({ title: "Verity", author: "Colleen Hoover" }), {
      page: 128, total: 320, percent: 40, source: "fable",
    });
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.auth === "JWT test-token"));
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.FABLE_AUTH_TOKEN;
    else process.env.FABLE_AUTH_TOKEN = previousToken;
  }
});

test("current-book card handles percentage-only progress", () => {
  const svg = renderBookCurrent({
    title: "Verity",
    author: "Colleen Hoover",
    progress: { page: null, total: null, percent: 23, source: "fable" },
  }, null);
  assert.match(svg, /23% read/);
  assert.doesNotMatch(svg, /null/);
});
