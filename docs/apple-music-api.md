# Apple Music API setup

The profile updater supports Apple's official recently played tracks endpoint.
It uses the public Apple Music profile feed automatically until both API
credentials are configured.

Add these repository secrets in **Settings > Secrets and variables > Actions**:

- `APPLE_MUSIC_DEVELOPER_TOKEN`
- `APPLE_MUSIC_USER_TOKEN`

The developer token is the ES256 token created from a MusicKit private key.
The Music User Token authorizes access to the account's personal listening
history. Never commit either value to this repository.

When both secrets are available, the updater reads the newest track from:

```text
GET https://api.music.apple.com/v1/me/recent/played/tracks?types=songs&limit=1
```

If Apple rejects or temporarily fails the request, the updater falls back to
the existing public Apple Music profile feed instead of breaking the card.

This endpoint returns listening history. It does not report the live playback
state of Apple Music running on another device. The optional macOS Music.app
bridge remains the path for true now-playing events.
