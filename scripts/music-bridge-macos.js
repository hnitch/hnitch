import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(SCRIPT_DIR);
const CACHE_FILE = process.env.MUSIC_BRIDGE_CACHE
  || path.join(os.homedir(), "Library", "Caches", "hnitch-profile-music.json");
const REPOSITORY = process.env.HNITCH_PROFILE_REPOSITORY || "hnitch/hnitch";
const separator = String.fromCharCode(31);

function musicIsRunning() {
  try {
    execFileSync("/usr/bin/pgrep", ["-x", "Music"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function readMusic() {
  const observedAt = new Date().toISOString();
  if (!musicIsRunning()) return { state: "stopped", observedAt };

  const source = `
tell application "Music"
  set playbackState to (player state as text)
  if playbackState is "playing" or playbackState is "paused" then
    set divider to ASCII character 31
    set activeTrack to current track
    set trackName to name of activeTrack
    set artistName to artist of activeTrack
    set albumName to album of activeTrack
    set trackDuration to "0"
    set trackPosition to "0"
    if trackName is missing value then set trackName to ""
    if artistName is missing value then set artistName to ""
    if albumName is missing value then set albumName to ""
    try
      set trackDuration to (duration of activeTrack as text)
    end try
    try
      set trackPosition to (player position as text)
    end try
    return playbackState & divider & trackName & divider & artistName & divider & albumName & divider & trackDuration & divider & trackPosition
  end if
  return playbackState
end tell`;
  const output = execFileSync("/usr/bin/osascript", ["-e", source], {
    encoding: "utf8",
    timeout: 10_000,
  }).trim();
  const [rawState, title = "", artist = "", album = "", duration = "0", position = "0"] = output.split(separator);
  const state = rawState === "playing" || rawState === "paused" ? rawState : "stopped";
  return {
    state,
    title: title.trim().slice(0, 240),
    artist: artist.trim().slice(0, 240),
    album: album.trim().slice(0, 240),
    duration: Math.max(0, Number(duration) || 0),
    position: Math.max(0, Number(position) || 0),
    observedAt,
  };
}

async function readCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function signature(event) {
  const stable = {
    state: event.state,
    title: event.title || "",
    artist: event.artist || "",
    album: event.album || "",
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

function dispatch(event) {
  const body = JSON.stringify({
    event_type: "music_now_playing",
    client_payload: event,
  });
  const candidates = [process.env.GH_PATH, "/opt/homebrew/bin/gh", "/usr/local/bin/gh", "gh"].filter(Boolean);
  let lastError;
  for (const executable of candidates) {
    try {
      execFileSync(executable, ["api", "--method", "POST", `repos/${REPOSITORY}/dispatches`, "--input", "-"], {
        input: body,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 20_000,
      });
      return;
    } catch (error) {
      lastError = error;
      if (error.code !== "ENOENT") break;
    }
  }
  throw new Error(lastError?.stderr?.toString().trim() || lastError?.message || "GitHub dispatch failed");
}

async function persist(event) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, `${JSON.stringify({ ...event, signature: signature(event) }, null, 2)}\n`);
}

async function main() {
  if (process.platform !== "darwin") throw new Error("The Music.app bridge only runs on macOS");
  const args = new Set(process.argv.slice(2));
  const current = readMusic();
  const previous = await readCache();
  const event = current.title
    ? current
    : { ...previous, state: "stopped", observedAt: current.observedAt, signature: undefined };

  if (args.has("--print")) {
    console.log(JSON.stringify(event, null, 2));
    return;
  }

  if (args.has("--preview")) {
    if (!event.title) throw new Error("No current or previously observed Music.app track is available");
    const result = spawnSync(process.execPath, [path.join(SCRIPT_DIR, "update-profile.js")], {
      cwd: ROOT,
      env: { ...process.env, MUSIC_EVENT_JSON: JSON.stringify({ ...event, preview: true }) },
      stdio: "inherit",
    });
    process.exitCode = result.status ?? 1;
    return;
  }

  if (!args.has("--dispatch")) {
    throw new Error("Choose --print, --preview, or --dispatch");
  }
  if (!event.title) return;
  if (!args.has("--force") && previous?.signature === signature(event)) return;
  dispatch(event);
  await persist(event);
  console.log(`${event.state}: ${event.title}${event.artist ? ` by ${event.artist}` : ""} dispatched`);
}

main().catch((error) => {
  console.error(`music bridge: ${error.message}`);
  process.exitCode = 1;
});
