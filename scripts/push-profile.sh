#!/usr/bin/env bash
set -euo pipefail

# Retry temporary remote failures without rewriting or overwriting remote work.
for attempt in 1 2 3 4; do
  if git push origin HEAD:main; then
    exit 0
  fi
  if [ "$attempt" -eq 4 ]; then
    echo "Profile publication failed after four attempts." >&2
    exit 1
  fi
  delay=$((attempt * 10))
  echo "Publish attempt $attempt failed. Retrying in ${delay}s…" >&2
  sleep "$delay"
done
