# Live Apple Music bridge

This is the free path to live Apple Music updates. It does not require an Apple
Developer account , an Apple token , or Discord.

The profile has two independent music sources:

1. The public Apple Music profile feed supplies recently played music with no
   setup. GitHub checks it on the normal five-minute refresh schedule.
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

The recently played card needs no setup. Once the redesign is on the default
branch , GitHub checks the public Apple Music profile feed every five minutes.
Scheduled runs are best-effort , so an occasional refresh may arrive later.

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

The live path works while this Mac is awake and Music.app is available. When it
is not , the public recently played feed continues to keep the card populated.

## Remove it

```sh
npm run music:uninstall
```

The installer writes `~/Library/LaunchAgents/dev.hnitch.profile-music.plist`. Logs live in `~/Library/Logs/hnitch-profile/`; the small state cache lives at `~/Library/Caches/hnitch-profile-music.json`.
