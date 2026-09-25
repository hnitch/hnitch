const DISCORD_USER_ID = "690729789702537336";
const LANYARD_URL = `https://api.lanyard.rest/v1/users/${DISCORD_USER_ID}`;

const svgHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
  "CDN-Cache-Control": "no-store",
  "Content-Type": "image/svg+xml; charset=utf-8",
  Expires: "0",
  "Surrogate-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

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

function escapeDisplay(value = "") {
  return escapeXml(decode(value).replace(/\s*,\s*/g, " , "));
}

function wrapLines(value, maxChars) {
  const words = String(value).trim().split(/\s+/).flatMap((word) => {
    if (word.length <= maxChars) return [word];
    return word.match(new RegExp(`.{1,${maxChars}}`, "g")) || [word];
  });
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= maxChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrappedText({ x, y, width, height, value, size, weight = 600, color = "#fffaf5", lineHeight = 1.2 }) {
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
  return `<text fill="${color}" font-size="${fittedSize}" font-weight="${weight}">${tspans}</text>`;
}

function activityLabel(source) {
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

export function normaliseLanyard(source) {
  const user = source.discord_user;
  if (!user?.id) throw new Error("Lanyard response is missing the Discord user");
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
  return {
    id: user.id,
    displayName: user.display_name || user.global_name || user.username,
    username: user.username,
    status: validStatuses.has(source.discord_status) ? source.discord_status : "unknown",
    guildTag: guild?.tag || "",
    guildBadgeUrl: guild?.badge
      ? `https://cdn.discordapp.com/clan-badges/${guild.identity_guild_id}/${guild.badge}.png?size=64`
      : "",
    memberSince: new Date(createdAt).getUTCFullYear(),
    devices,
    activity: activityLabel(source),
    avatarUrl,
  };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function fetchDataUri(url, fetcher) {
  if (!url) return null;
  try {
    const response = await fetcher(url, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*" },
      cf: { cacheEverything: true, cacheTtl: 86400 },
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type")?.split(";")[0] || "image/png";
    const bytes = new Uint8Array(await response.arrayBuffer());
    return `data:${type};base64,${bytesToBase64(bytes)}`;
  } catch {
    return null;
  }
}

export function renderDiscordCard(data, avatar, guildBadge) {
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
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1b2531"/><stop offset=".55" stop-color="#292e42"/><stop offset="1" stop-color="#203c49"/></linearGradient><linearGradient id="edge" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#5865f2"/><stop offset=".55" stop-color="#7aaed9"/><stop offset="1" stop-color="#9ddce9"/></linearGradient><clipPath id="avatar"><circle cx="100" cy="98" r="66"/></clipPath><style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}.arrow{animation:nudge 1.8s ease-in-out infinite}@keyframes nudge{50%{transform:translateX(5px)}}</style></defs>
  <rect x="1" y="1" width="858" height="204" rx="25" fill="url(#bg)" stroke="url(#edge)" stroke-width="2"/>
  <circle cx="780" cy="20" r="138" fill="#89c9f8" opacity=".065"/><circle cx="710" cy="215" r="118" fill="#9ddce9" opacity=".045"/>
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

function fallbackData() {
  return {
    id: DISCORD_USER_ID,
    displayName: "hn",
    username: "hnitch",
    status: "unknown",
    guildTag: "",
    memberSince: "2020",
    devices: [],
    activity: "Lanyard is taking a suspiciously long coffee break",
    avatarUrl: "",
    guildBadgeUrl: "",
  };
}

export async function handleRequest(request, fetcher = globalThis.fetch) {
  const url = new URL(request.url);
  if (url.pathname !== "/" && url.pathname !== "/discord.svg") {
    return new Response("not found", { status: 404 });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  let data = fallbackData();
  let avatar = null;
  let guildBadge = null;
  try {
    const response = await fetcher(LANYARD_URL, {
      headers: { Accept: "application/json", "User-Agent": "hnitch-discord-card/1.0" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Lanyard returned ${response.status}`);
    const payload = await response.json();
    if (!payload.success || !payload.data) throw new Error("Lanyard returned an invalid response");
    data = normaliseLanyard(payload.data);
    [avatar, guildBadge] = await Promise.all([
      fetchDataUri(data.avatarUrl, fetcher),
      fetchDataUri(data.guildBadgeUrl, fetcher),
    ]);
  } catch {
    // The public card remains usable and on-brand during upstream outages.
  }

  const svg = renderDiscordCard(data, avatar, guildBadge);
  return new Response(request.method === "HEAD" ? null : svg, { status: 200, headers: svgHeaders });
}

export default {
  fetch(request) {
    return handleRequest(request);
  },
};
