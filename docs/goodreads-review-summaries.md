# Goodreads review summaries

The profile renderer supports short , review-specific reactions without being tied to a hosted AI subscription.

## Current mode

- The public cards use the validated cache in `data/review-summaries.json`.
- `npm run update-profile` keeps a matching cached reaction visible while Goodreads data refreshes.
- `.github/workflows/summarize-goodreads.yml` is manual-only and read-only. It can detect pending reviews and package their prompts as a one-day artifact , but it never calls an AI provider.
- A book with no written Goodreads review gets the neutral fallback `no written statement was left at the scene`.

## Provider-neutral handoff

1. `npm run reviews:prepare` finds new reviews and writes the trusted system prompt plus untrusted review payload to `.tmp/`.
2. A model returns the requested JSON to a local file.
3. `REVIEW_RESPONSE_FILE=/absolute/path/to/response.json npm run reviews:apply` validates the keys , fingerprints , length , and content before updating the cache.
4. `npm run update-profile` redraws the cards from that validated cache.

The model never writes directly to the README or SVGs. Invalid , stale , missing-fingerprint , or over-limit output is rejected.

## Planned Mac Mini route

The clean no-API design is a self-hosted GitHub Actions runner on the Mac Mini plus a local OpenAI-compatible model server. The runner can execute the same prepare/apply contract above , then commit only the validated cache and generated cards. The local model choice and exact voice instructions are intentionally left unconfigured until the Mac Mini memory and chip are known.

Set `GOODREADS_SUMMARY_MODEL` to the exact local model identifier when that bridge is added so a model change automatically queues fresh summaries.
