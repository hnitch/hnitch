# Update reading progress shortcut

`Update reading progress.shortcut` is a credential-free template for the native
Apple Shortcuts app. It contains **no token**. Your personal copy may be named
**Read Me Book Progress**; the exported file is a reviewable backup, not the
credential-bearing copy on your devices.

The shortcut reads the current Goodreads book from our `/reading.json` Worker, asks for
one input (`148`, `148/320`, or `42%`), and dispatches the profile workflow for
that branch. The workflow rejects a stale book ID or invalid number. A matching
manual value overrides Goodreads progress only; Goodreads supplies all other
book information. When the book changes, the old value is ignored.

The input pop-up shows the book and last recorded page/percentage (or “no progress
logged yet”). The final native pop-up confirms **queued**, not saved: GitHub must
finish successfully before the profile changes. There are no notifications to clear.

## Before using it

1. Review the shortcut's actions on your own device. The only outgoing requests
   are a GET to `https://hnitch-discord-card.haarshaan.workers.dev/reading.json` and a POST
   to `api.github.com/repos/hnitch/hnitch/actions/workflows/update-profile.yml/dispatches`.
2. Create a **fine-grained personal access token** at GitHub Settings →
   Developer settings → Personal access tokens → Fine-grained tokens. Set the
   resource owner to `hnitch`, repository access to **only `hnitch/hnitch`**,
   repository permission **Actions: Read and write**, and choose an expiry. Do
   not grant Contents write or use a classic `repo` token.
3. In the shortcut's final **Get Contents of URL** action, replace only
   `REPLACE_WITH_FINE_GRAINED_TOKEN` in its Authorization header. Leave the
   `Bearer ` prefix. Never paste the token into this repository, an issue, a
   screenshot, or a message. Anyone who can edit or view your synced shortcut
   may be able to see the token. Revoke it from GitHub if the device is lost.
4. The template's JSON body `ref` is `main`. Its first URL uses the Worker feed,
   which serves flat `bookId` and `title` keys with a JSON content type, bypasses
   old raw-file cache entries, and provides empty strings rather than a null
   book. The shortcut stops before asking for progress if no book ID is available.
5. On iPhone, add the shortcut to Control Center using **Add a Control →
   Shortcut**, then choose **Read Me Book Progress** (or **Update reading
   progress** if you imported the template). The shortcut prompts for
   one value, requests `return_run_details: true`, and shows **Update queued ✓**
   only after GitHub returns a `workflow_run_id`. Rejected requests stop with an
   error rather than displaying success. This confirms only the queued workflow; if the
   subsequent job fails, inspect the run in the repository's Actions tab.

The GitHub token has Actions write access to this single repository, not just to
one workflow. Keep its expiry short and never share a signed shortcut after
entering the token. The token is never stored in this repository or on the Mac
mini runner. The workflow inputs and resulting progress are public because the
profile repository is public.

The installed personal copy keeps its name and token; do not import another copy
just to get an update. Let iCloud sync it to the iPhone, then select that same
shortcut in Control Center. The public backup contains a placeholder token.

`workflow.json` is the reviewable, credential-free source. Compile and sign it
on macOS when updating the backup:

```sh
python3 shortcuts/build.py /private/tmp/reading-progress-unsigned.shortcut
shortcuts sign --mode anyone --input /private/tmp/reading-progress-unsigned.shortcut --output "shortcuts/Update reading progress.shortcut"
```
