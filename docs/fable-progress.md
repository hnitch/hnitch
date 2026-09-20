# Fable reading progress (optional)

The profile still gets its current book, cover, author, reviews, ratings, and links from Goodreads. Fable is consulted **only** for the logged current page, total pages, and resulting percentage of that same book. If Fable has no usable progress, the existing Goodreads progress is used. A Fable catalogue `page_count` is never treated as a logged reading position.

## What is public

[The public Fable profile](https://fable.co/fabler/haarshaan-500622206333?tab=stats) and its Currently Reading list reveal the book, but the signed-out list response does **not** contain `reading_progress`. Fable does not document a public, read-only progress API. The integration therefore cannot automatically show Fable page/percentage updates from the profile URL alone.

## Optional authenticated source

The generator supports a `FABLE_AUTH_TOKEN` GitHub Actions secret. If supplied, it reads the account's own current-reading list through Fable's website API and accepts `reading_progress.current_page` and `reading_progress.page_count` only for an exact title-and-author match to the current Goodreads book. An explicit progress percentage is also accepted. The secret is never printed or written to the README, SVG, or `data/activity.json`.

This is an **undocumented account session token**, not a scoped read-only API key. It may expire or stop working without notice and grants broader account access than this profile needs. Do not paste it into an issue, commit, chat, or repository variable. Only add it under repository **Settings → Secrets and variables → Actions → New repository secret** if you accept that risk. Never enable the profile workflow for untrusted pull requests while it has this secret. To test, select the `fable-progress-refresh` branch in the workflow's **Run workflow** menu; scheduled runs use the default branch after merge.

If the token is absent, expired, or Fable changes its response, the profile keeps Goodreads progress. No password or Mac mini service is needed. For a durable, least-privilege solution, Fable would need to publish a dedicated progress API or export.

## Refresh timing

GitHub Actions requests a run every five minutes, but [scheduled jobs can be delayed or dropped](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). The README now says **last checked** and records an actual completed check at least hourly, even when the content is unchanged. A neutral dot avoids claiming a stale page is currently fresh. The Instagram avatar refreshes once 24 hours have elapsed since a successful fetch, with a six-hour retry delay after failure, so it no longer depends on a narrow UTC time window.
