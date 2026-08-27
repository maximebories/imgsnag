#!/bin/bash
# Unattended Jules orchestration triage. Invoked by the LaunchAgent
# com.maximebories.imgsnag-triage; safe to run by hand for a dry run.
set -uo pipefail

REPO="$HOME/Developer/projects/imgsnag"
CLAUDE="$HOME/.local/bin/claude"
LOG_DIR="$HOME/Library/Logs/imgsnag-triage"
STAMP="$(date +%Y-%m-%d_%H%M%S)"

mkdir -p "$LOG_DIR"
cd "$REPO" || { echo "repo not found: $REPO"; exit 1; }

# gh, node and npm live in Homebrew/user paths that launchd does not inherit
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.bun/bin:$PATH"

{
  echo "=== imgsnag triage $STAMP ==="
  echo "repo:   $(git rev-parse --short HEAD 2>/dev/null) on $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "claude: $("$CLAUDE" --version 2>&1 | head -1)"
  echo

  # Nothing to do if there are no open PRs and no branches beyond main.
  OPEN_PRS=$(gh pr list --state open --json number --jq length 2>/dev/null || echo "?")
  echo "open PRs: $OPEN_PRS"

  # Least privilege, not bypassPermissions. This job reads ATTACKER-CONTROLLED
  # text (PR titles/bodies/diffs on a public repo, Jules session messages), so
  # an unrestricted agent would be one prompt injection away from arbitrary
  # execution with this user's Keychain and gh credentials. The allowlist below
  # covers exactly what triage needs; anything else (curl|sh, chmod, ssh,
  # security find-generic-password beyond the Jules key, package installs)
  # is simply not runnable. Extend it deliberately, never with a wildcard.
  "$CLAUDE" --print \
    --permission-mode dontAsk \
    --allowedTools \
      "Bash(git:*)" "Bash(gh:*)" "Bash(npm test)" "Bash(npm ci)" \
      "Bash(node:*)" "Bash(bash build.sh)" "Bash(python3:*)" \
      "Bash(jq:*)" "Bash(sed:*)" "Bash(grep:*)" "Bash(head:*)" "Bash(tail:*)" \
      "Bash(cat:*)" "Bash(ls:*)" "Bash(wc:*)" "Bash(mkdir:*)" "Bash(printf:*)" \
      "Bash(curl -sS https://jules.googleapis.com/*)" \
      "Bash(curl -sS -o /dev/null*)" \
      "Bash(security find-generic-password -s jules-api-key -w)" \
      "Read" "Edit" "Write" "Grep" "Glob" \
    --disallowedTools "WebFetch" "WebSearch" \
    --model opus \
    "$(cat "$REPO/tools/nightly-triage-prompt.md")"

  echo
  echo "=== exit: $? ==="
} >> "$LOG_DIR/$STAMP.log" 2>&1

# keep the last 30 runs
ls -1t "$LOG_DIR"/*.log 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null
exit 0
