#!/bin/zsh
set -euo pipefail

repo_root="${0:A:h:h}"
node_bin="$(command -v node)"
gh_bin="$(command -v gh)"
agent_label="dev.hnitch.profile-music"
agent_dir="$HOME/Library/LaunchAgents"
agent_path="$agent_dir/$agent_label.plist"
support_dir="$HOME/Library/Application Support/hnitch-profile"
bridge_path="$support_dir/music-bridge-macos.js"
log_dir="$HOME/Library/Logs/hnitch-profile"
user_id="$(id -u)"

gh auth status --hostname github.com >/dev/null
mkdir -p "$agent_dir" "$support_dir" "$log_dir"
cp "$repo_root/scripts/music-bridge-macos.js" "$bridge_path"
chmod 700 "$bridge_path"
launchctl bootout "gui/$user_id/$agent_label" >/dev/null 2>&1 \
  || launchctl bootout "gui/$user_id" "$agent_path" >/dev/null 2>&1 \
  || true

# Build the plist structurally so spaces and XML characters in local paths are
# escaped safely by macOS instead of being interpolated into raw XML.
plutil -create xml1 "$agent_path"
plutil -insert Label -string "$agent_label" "$agent_path"
plutil -insert ProgramArguments -xml '<array></array>' "$agent_path"
plutil -insert ProgramArguments.0 -string "$node_bin" "$agent_path"
plutil -insert ProgramArguments.1 -string "$bridge_path" "$agent_path"
plutil -insert ProgramArguments.2 -string '--dispatch' "$agent_path"
plutil -insert EnvironmentVariables -xml '<dict></dict>' "$agent_path"
plutil -insert EnvironmentVariables.GH_PATH -string "$gh_bin" "$agent_path"
plutil -insert StartInterval -integer 30 "$agent_path"
plutil -insert RunAtLoad -bool YES "$agent_path"
plutil -insert ProcessType -string Background "$agent_path"
plutil -insert LowPriorityIO -bool YES "$agent_path"
plutil -insert StandardOutPath -string "$log_dir/music-bridge.log" "$agent_path"
plutil -insert StandardErrorPath -string "$log_dir/music-bridge-error.log" "$agent_path"

plutil -lint "$agent_path" >/dev/null
launchctl bootstrap "gui/$user_id" "$agent_path"
echo "Music.app bridge installed. It checks for track or playback-state changes every 30 seconds."
