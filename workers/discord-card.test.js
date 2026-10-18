import assert from "node:assert/strict";
import test from "node:test";
import { handleReadingRequest, handleRequest, handleVisitorRequest, normaliseLanyard, renderDiscordCard, shortcutBook } from "./discord-card.js";

test("shortcut book fields stay flat and safe for empty or malformed shelves", () => {
  for (const current of [null, undefined, {}, "null", { bookId: "wrong", title: "Wrong" }]) {
    assert.deepEqual(shortcutBook({ goodreads: { current } }), { available: true, bookId: "", title: "", pages: 0, progress: "", shortcutPrompt: "" });
  }
  const book = shortcutBook({ goodreads: { current: { bookId: 123, title: "Current book", pages: 384, progress: { percent: 9 } } } });
  assert.equal(book.title, "Current book");
  assert.equal(book.bookId, "123");
  assert.equal(book.progress, "9%");
  assert.match(book.shortcutPrompt, /Current book\n\nLast recorded\n9% read/);
});

test("shortcut instructions contain no sample numbers that could look like recorded progress", () => {
  const result = shortcutBook({ goodreads: { current: { bookId: 123, title: "Book", progress: { page: 249, total: 528, percent: 47 } } } });
  assert.match(result.shortcutPrompt, /Last recorded\npage 249 of 528 · 47%\n\n\nWhere did you stop\?/);
  const instructions = result.shortcutPrompt.split("Where did you stop?")[1];
  assert.doesNotMatch(instructions, /\d/);
  assert.equal(instructions, "\n\nEnter a page number or percentage (%).\n\nDifferent edition? Enter page/total.");
});

test("shortcut prompt shows recorded progress without inventing a page or completion", () => {
  const prompt = progress => shortcutBook({ goodreads: { current: { bookId: 123, title: "Book", progress } } }).shortcutPrompt;
  assert.match(prompt({ page: 0, total: 320, percent: 0 }), /page 0 of 320 · 0%/);
  assert.match(prompt({ page: 148, total: 320, percent: 46 }), /page 148 of 320 · 46%/);
  assert.match(prompt({ page: null, total: null, percent: 42 }), /42% read/);
  assert.match(prompt(null), /no progress logged yet/);
  assert.match(prompt({ page: -1, total: 320, percent: 101 }), /no progress logged yet/);
  assert.doesNotMatch(prompt(null), /undefined|null|saved/i);
});

test("shortcut feed fetches a cache-busted snapshot with a JSON content type", async () => {
  const response = await handleReadingRequest(new Request("https://example.com/reading.json"), async (url, options) => {
    assert.match(url, /main\/data\/activity.json\?refresh=\d+$/);
    assert.equal(options.cache, "no-store");
    return new Response(JSON.stringify({ goodreads: { current: null } }));
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal((await response.json()).bookId, "");
});

test("shortcut feed outages do not produce a null book or an HTML response", async () => {
  const response = await handleReadingRequest(new Request("https://example.com/reading.json"), async () => { throw new Error("offline"); });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { available: false, bookId: "", title: "", pages: 0, progress: "", error: "The current book could not be loaded. Try again shortly." });
});

const visitorRequest = new Request("https://example.com/visitors.svg?v=1");
const visitorNow = Date.parse("2026-10-12T15:00:00Z");

test("visitor badge caches a validated count and serves its own SVG", async () => {
  let cached;
  const cache = { match: async () => cached?.clone(), put: async (_key, response) => { cached = response; } };
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return new Response('<svg aria-label="CURIOUS VISITORS: 1,400"><script>untrusted</script></svg>', { headers: { "Content-Type": "image/svg+xml" } });
  };
  const result = await handleVisitorRequest(visitorRequest, fetcher, cache, visitorNow);
  assert.equal(result.status, 200);
  const badge = await result.text();
  assert.match(badge, /1,400/);
  assert.match(badge, /rx="14"/);
  assert.match(badge, />VISITORS</);
  assert.doesNotMatch(badge, /CURIOUS/);
  assert.match(result.headers.get("content-type"), /image\/svg\+xml/);
  const fresh = await handleVisitorRequest(visitorRequest, fetcher, cache, visitorNow + 10_000);
  assert.doesNotMatch(await fresh.text(), /script|untrusted/);
  assert.equal(calls, 1);
});

test("counter outages preserve the last verified count even when cache writes fail", async () => {
  const cache = {
    match: async () => new Response(JSON.stringify({ count: 1400, checkedAt: "2026-10-11T15:00:00Z" })),
    put: async () => { throw new Error("cache unavailable"); },
  };
  for (const fetcher of [async () => { throw new Error("offline"); }, async () => new Response("error", { status: 503 }), async () => new Response("not SVG")]) {
    const result = await handleVisitorRequest(visitorRequest, fetcher, cache, visitorNow);
    assert.equal(result.status, 200);
    assert.match(await result.text(), /1,400.*last verified count/);
  }
});

test("an empty or broken edge cache still returns the verified seed instead of a broken image", async () => {
  const broken = { match: async () => { throw new Error("cache unavailable"); } };
  const result = await handleVisitorRequest(visitorRequest, async () => { throw new Error("offline"); }, broken, visitorNow);
  assert.equal(result.status, 200);
  assert.match(await result.text(), /1,282/);
});

test("HEAD requests do not increment the counter and writes are rejected", async () => {
  const fetcher = async () => { throw new Error("HEAD must not fetch the counter"); };
  const head = await handleVisitorRequest(new Request(visitorRequest.url, { method: "HEAD" }), fetcher, null, visitorNow);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const post = await handleVisitorRequest(new Request(visitorRequest.url, { method: "POST" }), fetcher, null, visitorNow);
  assert.equal(post.status, 405);
});

const lanyardPresence = {
  discord_user: {
    id: "690729789702537336",
    username: "hnitch",
    global_name: "hn",
    display_name: "hn",
    avatar: "avatar-hash",
    primary_guild: {
      identity_enabled: true,
      identity_guild_id: "1098645983577001994",
      badge: "badge-hash",
      tag: "EN",
    },
  },
  discord_status: "online",
  active_on_discord_desktop: true,
  active_on_discord_mobile: false,
  active_on_discord_web: false,
  activities: [{ type: 0, details: "building something" }],
};

test("normalises Lanyard data for the original Discord card", () => {
  const data = normaliseLanyard(lanyardPresence);
  assert.equal(data.displayName, "hn");
  assert.equal(data.username, "hnitch");
  assert.equal(data.status, "online");
  assert.equal(data.guildTag, "EN");
  assert.deepEqual(data.devices, ["desktop"]);
  assert.equal(data.activity, "playing building something");
});

test("keeps the custom 860 by 206 card design", () => {
  const svg = renderDiscordCard(normaliseLanyard(lanyardPresence), null, null);
  assert.match(svg, /width="860" height="206"/);
  assert.match(svg, /DISCORD \/ PUBLIC PRESENCE/);
  assert.match(svg, /OPEN PROFILE/);
  assert.match(svg, /#3ba55d/);
  assert.doesNotMatch(svg, /lanyard\.cnrad\.dev/);
});

test("idle platform labels do not imply activity and identity details stay aligned", () => {
  const svg = renderDiscordCard(normaliseLanyard({ ...lanyardPresence, discord_status: "idle", activities: [] }), null, null);
  assert.match(svg, /· desktop/);
  assert.doesNotMatch(svg, /active on/);
  assert.match(svg, /x="812" y="42"/);
  assert.match(svg, /translate\(-386 8\)/);
  const mobile = renderDiscordCard(normaliseLanyard({ ...lanyardPresence, discord_status: "idle", active_on_discord_desktop: false, active_on_discord_mobile: true, activities: [] }), null, null);
  assert.match(mobile, /· mobile/);
});

test("serves a fresh custom SVG from Lanyard without cache headers", async () => {
  const fetcher = async (input) => {
    if (String(input).startsWith("https://api.lanyard.rest/")) {
      return new Response(JSON.stringify({ success: true, data: lanyardPresence }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  };
  const response = await handleRequest(new Request("https://example.com/discord.svg"), fetcher);
  const svg = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/svg+xml; charset=utf-8");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(svg, /data:image\/png;base64,AQID/);
  assert.match(svg, />online</);
});

test("preserves the custom card during an upstream outage", async () => {
  const response = await handleRequest(
    new Request("https://example.com/discord.svg"),
    async () => { throw new Error("offline"); },
  );
  const svg = await response.text();
  assert.equal(response.status, 200);
  assert.match(svg, /presence unavailable/);
  assert.match(svg, /suspiciously long coffee break/);
});
