#!/bin/zsh
set -euo pipefail

agent_label="dev.hnitch.profile-music"
agent_path="$HOME/Library/LaunchAgents/$agent_label.plist"
bridge_path="$HOME/Library/Application Support/hnitch-profile/music-bridge-macos.js"
user_id="$(id -u)"

launchctl bootout "gui/$user_id/$agent_label" >/dev/null 2>&1 \
  || launchctl bootout "gui/$user_id" "$agent_path" >/dev/null 2>&1 \
  || true
if [[ -f "$agent_path" ]]; then
  mv "$agent_path" "$HOME/.Trash/$agent_label.plist"
fi
if [[ -f "$bridge_path" ]]; then
  mv "$bridge_path" "$HOME/.Trash/music-bridge-macos.js"
fi
echo "Music.app bridge removed. Its plist and installed script were moved to Trash when present."
