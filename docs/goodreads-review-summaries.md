# Goodreads review summaries

The profile renderer supports short , review-specific reactions without being tied to a hosted AI subscription.

## Current mode

- The public cards use the validated cache in `data/review-summaries.json`.
- `npm run update-profile` keeps a matching cached reaction visible while Goodreads data refreshes.
- `.github/workflows/summarize-goodreads.yml` is manual-only until the Mac Mini passes its first live run.
- The workflow targets only a self-hosted `macOS` / `ARM64` runner carrying the custom `hnitch-ai` label.
- The model request goes to Ollama at `127.0.0.1:11434`. It never calls OpenAI , GitHub Copilot , or another hosted model provider.
- A book with no written Goodreads review gets the neutral fallback `no written statement was left at the scene`.

## Provider-neutral handoff

1. `npm run reviews:prepare` finds new reviews and writes the trusted system prompt plus untrusted review payload to `.tmp/`.
2. A model returns the requested JSON to a local file.
3. `REVIEW_RESPONSE_FILE=/absolute/path/to/response.json npm run reviews:apply` validates the keys , fingerprints , length , and content before updating the cache.
4. `npm run update-profile` redraws the cards from that validated cache.

On the Mac Mini , `npm run reviews:local` performs the same handoff directly against the loopback Ollama server.

The model never writes directly to the README or SVGs. Invalid , stale , missing-fingerprint , or over-limit output is rejected.

## Mac Mini route

Target machine: Apple Silicon M2 Mac Mini with 16 GB unified memory and 1 TB storage.

The default model is `gpt-oss:20b`. It is the OpenAI open-weight option and the workload is deliberately tiny: at most four short reviews , an 8K context limit , and no persistent chat history. Sixteen gigabytes is still the lower edge for this model , so close memory-heavy apps during the first benchmark. If macOS shows sustained memory pressure or heavy swapping , use `qwen3:8b` from the workflow's model field instead.

The GitHub runner makes an outbound connection to GitHub and calls Ollama over localhost. Tailscale is useful for SSH and maintenance , but the Ollama port does not need to be published to the tailnet or the internet.

### One-time Mac Mini setup

1. Install Ollama and keep its listener on the default loopback address. Do not set `OLLAMA_HOST=0.0.0.0`.
2. Download the preferred model with `ollama pull gpt-oss:20b`.
3. In the GitHub repository , open **Settings → Actions → Runners → New self-hosted runner** and follow the macOS ARM64 commands.
4. Add the custom runner label `hnitch-ai` and install the runner as a background service.
5. Prevent the Mac Mini from sleeping while connected to power. The display may sleep.
6. Merge the `3.0` branch , then manually run **write Goodreads summaries locally** once.
7. After that run is verified , add the schedule trigger. Keeping the first run manual prevents silent queueing before the runner is ready.

The runner must use a dedicated , non-admin macOS account and should not contain unrelated secrets. This workflow has no pull-request trigger , so untrusted fork code cannot start it.

`GOODREADS_LOCAL_MODEL` records the exact Ollama model identifier in each fingerprint , so changing the workflow model automatically queues fresh summaries.
