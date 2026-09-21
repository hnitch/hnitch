# ✨ v3.1.0 { less machinery , more me }

## 📚 reading

- the "currently reading" card has an actual in-between-books state now. no empty-looking placeholder when the shelf is taking a breath.
- a new iPhone shortcut lets me log a page , page/total , or percentage straight from Control Center. it updates the current book card on this branch without posting another Goodreads status.
- Goodreads still supplies the book , cover , author , reviews , and recent reads. the shortcut changes reading progress only.
- progress is checked against the current book and reading session , so a late update cannot land on a different book.

## 🎭 mood samplers

- the little review reactions are now chips instead of repetitive AI-written sentences.
- each phrase has to come from something I actually wrote in the review. if nothing fits , the card doesn't pretend it knows how I felt.
- stars have their own rating-aware colour , with a cleaner layout and more room to breathe.
- the local model and its Mac mini review workflow are gone. this part no longer needs AI running in the background.

## 📡 the other signals

- Discord keeps the custom card , but its status and profile details are now fetched by a live endpoint instead of waiting for a repository commit.
- Instagram's profile picture refresh is less dependent on a fixed time window.
- the activity refresh is set to check every five minutes on the default branch and only commits meaningful changes. Apple Music still arrives in batches , so it isn't advertised as live.

## ⚙️ under the hood

- retired the unavailable external progress source. no account token or scraper is needed for reading progress.
- added tests for reading progress , mood chips , and the Discord card.
- the iPhone shortcut is designed for a repository-scoped GitHub token with Actions access only. no token is stored in the repository or in the exported shortcut.

## 📦 v3.1.0

a smaller update than 3.0 , but a more honest one. the profile should feel a little more like me and ask a little less of my Mac mini.

full changelog: [3.0.0...3.1.0](https://github.com/hnitch/hnitch/compare/3.0.0...3.1.0)
