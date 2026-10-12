# Live Apple Music bridge

This is the free path to live Apple Music updates. It does not require an Apple
Developer account , an Apple token , or Discord.

The profile can use two independent music sources:

1. The external Apple Music history card is disabled by default. Its previous
   account connection returned a track the owner did not play. To restore it,
   reconnect at https://music-profile.rayriffy.com/ using the correct Apple ID,
   confirm that its own card shows your actual listening, then save the card's
   `uid` as the repository Actions variable `APPLE_MUSIC_HISTORY_UID`. Do not
   copy any Apple password or user token into GitHub or chat.
2. The optional macOS bridge reads Music.app directly and sends a
   `repository_dispatch` event only when the track or playback state changes.
   This is what enables near-live updates while the Mac is awake.

The bridge uses the GitHub CLI login stored in the macOS Keychain. The profile
workflow looks up the matching album art and Apple Music link before rendering
the player card.

## Preview

```sh
npm run music:preview
```

This reads Music.app and regenerates the local profile assets without contacting GitHub.

## Turn on live updates

Until a source is confirmed, the card shows a designed waiting state rather
than guessing a song or retaining disputed history. After reconnection, the
workflow checks the history card on its best-effort refresh schedule.

For near-live Music.app changes , merge the redesign branch first so the
`music_now_playing` workflow trigger exists on the default branch. Make sure
GitHub CLI can reuse its Keychain-backed login , then preview once while
Music.app is open:

```sh
gh auth login --hostname github.com --git-protocol https --web
npm run music:preview
```

Then install the optional bridge:

```sh
npm run music:install
```

macOS may ask once for permission to let the shell read Music.app. The LaunchAgent checks every 30 seconds but dispatches only on a track , play , pause , or stop change. The installer copies the bridge to `~/Library/Application Support/hnitch-profile/` so it keeps working if this review checkout moves. GitHub CLI authentication stays in the macOS keychain; no Apple credentials are stored in the repository.

The live path works while this Mac is awake and Music.app is available. Old
Music.app observations remain labelled last played, not indefinitely live.
Scheduled history updates require the separately confirmed connection above.

## Remove it

```sh
npm run music:uninstall
```

The installer writes `~/Library/LaunchAgents/dev.hnitch.profile-music.plist`. Logs live in `~/Library/Logs/hnitch-profile/`; the small state cache lives at `~/Library/Caches/hnitch-profile-music.json`.
