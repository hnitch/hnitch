# Live Apple Music bridge

Apple's server API exposes listening history , not the track currently playing in Music.app. The profile therefore uses Apple Music Rich Presence from Discord for its normal cloud refresh. That supplies the live title , artist , album , artwork , track link , and playback timestamps without storing an Apple credential.

This optional bridge is the direct fallback. It reads Music.app locally and sends a `repository_dispatch` event only when the track or playback state changes. The profile workflow then resolves the official Apple Music artwork , album , and track link before rendering the player card.

## Preview

```sh
npm run music:preview
```

This reads Music.app and regenerates the local profile assets without contacting GitHub.

## Turn on live updates

The Discord-powered card needs no setup. Once the redesign is on the default branch , GitHub checks for fresh activity on a five-minute schedule. Scheduled runs are best-effort , so an occasional refresh may arrive a little later.

For near-instant Music.app changes , merge the redesign branch first so the `music_now_playing` workflow trigger exists on the default branch. Make sure GitHub CLI can reuse a keychain-backed login , then preview once while Music.app is open:

```sh
gh auth login --hostname github.com --git-protocol https --web
npm run music:preview
```

Then install the optional bridge:

```sh
npm run music:install
```

macOS may ask once for permission to let the shell read Music.app. The LaunchAgent checks every 30 seconds but dispatches only on a track , play , pause , or stop change. The installer copies the bridge to `~/Library/Application Support/hnitch-profile/` so it keeps working if this review checkout moves. GitHub CLI authentication stays in the macOS keychain; no Apple credentials are stored in the repository.

## Remove it

```sh
npm run music:uninstall
```

The installer writes `~/Library/LaunchAgents/dev.hnitch.profile-music.plist`. Logs live in `~/Library/Logs/hnitch-profile/`; the small state cache lives at `~/Library/Caches/hnitch-profile-music.json`.
