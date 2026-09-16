import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, normaliseLanyard, renderDiscordCard } from "./discord-card.js";

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
