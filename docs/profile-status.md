# Profile status and UI

The small two-line strip separates two different clocks:

- **last signal received (content change)** uses `updatedAt`. A successful poll
  with identical content does not advance it.
- **feeds checked** uses `feedChecks.checkedAt`, recorded after a refresh has
  collected its results and rendered the cards. An attempt is not a guarantee
  that an upstream service has published the latest activity.

`feedChecks.sources` records each source's state, last attempt and last success.
An unsuccessful fetch preserves the previous success timestamp and reports
`delayed`; disabled music reports `paused`. The strip keeps the amber dot and
a tooltip on "feeds checked" naming affected services, without visible counts.
A small gap separates the strip from the Goodreads logo. Instagram's daily cache
does not count as a new successful network fetch. Discord presence is served
separately by the live Worker, not this scheduled check.

Both timestamps have UTC text fallbacks and GitHub's relative-time elements.
Dot colours are snapshots at generation time, not continuously running clocks.
GitHub scheduling and image caching can delay delivery; the strip makes that
visible rather than promising instant refreshes. Keeping the check timestamp
current means successful refresh jobs can commit status-only changes, even
when the reading/listening activity itself is unchanged.

`--render-cached` restyles saved data but never invents a new check timestamp.
Old snapshots show "awaiting first check" until an actual refresh records one.

## Reading and links

The local `reading-status.svg` badge switches between "currently reading ,
probably" and "between books , allegedly" using the same current-book record
as the shelf card. It no longer depends on an external badge service.

Written reviews show "read full review ↗" inside the existing card; books
without written reviews say "view on Goodreads ↗". The enclosing README link
remains the click target. GitHub's Markdown renderer removes `target="_blank"`
from these links, so new-tab behaviour cannot be forced by a profile README.
Visitors can use Cmd/Ctrl-click, a middle click, or the browser's link menu.

## Heading artwork

The heading uses Helvetica Neue Medium Italic, outlined at design time using
macOS CoreText. Only SVG paths are distributed, not font files. This prevents
different devices from substituting a heavier or differently shaped heading.
The original text remains available through SVG titles and accessible labels.
To regenerate on a Mac with that font installed:

```sh
swift scripts/outline-hero-heading.swift
```

The normal Linux refresh workflow does not run or require this design utility.
