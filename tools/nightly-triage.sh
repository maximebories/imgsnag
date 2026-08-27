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

  # Files the agent must never rewrite: they either re-enter this loop with
  # elevated reach (its own prompt, this runner, the API helper) or run as
  # code outside it (build.sh, CI workflows). Deny rules below cover them;
  # this hash check is the belt to that suspenders, because a deny pattern
  # that silently fails to match fails OPEN and we would never know.
  SELF_FILES=(tools/nightly-triage.sh tools/nightly-triage-prompt.md tools/jules.py build.sh)
  SELF_BEFORE=$(git hash-object "${SELF_FILES[@]}" 2>/dev/null)

  # Least privilege, not bypassPermissions. This job reads ATTACKER-CONTROLLED
  # text (PR titles/bodies/diffs on a public repo, Jules session messages), so
  # an unrestricted agent would be one prompt injection away from arbitrary
  # execution with this user's Keychain and gh credentials.
  #
  # Every entry is an exact subcommand, never a bare `tool:*`. `git:*` would
  # have permitted `git config alias.x '!sh -c ...'`, and `python3:*` permits
  # `python3 -c` outright -- both are arbitrary execution wearing an allowlist
  # as a hat. The Jules API is reached only through tools/jules.py, which reads
  # the Keychain in-process, so the agent can no longer touch the key at all.
  # Extend this deliberately, one subcommand at a time, never with a wildcard.
  "$CLAUDE" --print \
    --permission-mode dontAsk \
    --allowedTools \
      "Bash(git fetch:*)" "Bash(git status:*)" "Bash(git log:*)" \
      "Bash(git diff:*)" "Bash(git show:*)" "Bash(git branch:*)" \
      "Bash(git for-each-ref:*)" "Bash(git rev-parse:*)" "Bash(git merge-tree:*)" \
      "Bash(git ls-files:*)" "Bash(git hash-object:*)" "Bash(git cherry-pick:*)" \
      "Bash(git add:*)" "Bash(git commit:*)" "Bash(git restore:*)" \
      "Bash(git checkout:*)" "Bash(git reset:*)" "Bash(git push origin main)" \
      "Bash(gh pr list:*)" "Bash(gh pr view:*)" "Bash(gh pr diff:*)" \
      "Bash(gh pr comment:*)" "Bash(gh pr close:*)" \
      "Bash(gh issue list:*)" "Bash(gh issue view:*)" "Bash(gh issue create:*)" \
      "Bash(gh issue comment:*)" "Bash(gh issue edit:*)" "Bash(gh issue close:*)" \
      "Bash(gh run list:*)" "Bash(gh run view:*)" \
      "Bash(npm test)" "Bash(npm ci)" \
      "Bash(node --check:*)" "Bash(node tools/e2e-smoke.mjs)" "Bash(bash build.sh)" \
      "Bash(python3 tools/jules.py:*)" "Bash(python3 -m json.tool:*)" \
      "Bash(jq:*)" "Bash(grep:*)" "Bash(head:*)" "Bash(tail:*)" \
      "Bash(ls:*)" "Bash(wc:*)" "Bash(mkdir:*)" \
      "Read" "Edit" "Write" "Grep" "Glob" \
    --disallowedTools \
      "WebFetch" "WebSearch" \
      "Bash(git push --force:*)" "Bash(git push -f:*)" "Bash(git config:*)" \
      "Bash(git remote:*)" "Bash(git submodule:*)" "Bash(git filter-branch:*)" \
      "Bash(gh api:*)" "Bash(gh auth:*)" "Bash(gh secret:*)" \
      "Bash(gh workflow:*)" "Bash(gh repo:*)" "Bash(gh alias:*)" \
      "Edit(tools/nightly-triage.sh)" "Write(tools/nightly-triage.sh)" \
      "Edit(tools/nightly-triage-prompt.md)" "Write(tools/nightly-triage-prompt.md)" \
      "Edit(tools/jules.py)" "Write(tools/jules.py)" \
      "Edit(build.sh)" "Write(build.sh)" \
      "Edit(.github/**)" "Write(.github/**)" \
      "Edit(.claude/**)" "Write(.claude/**)" \
    --model opus \
    "$(cat "$REPO/tools/nightly-triage-prompt.md")"
  CLAUDE_EXIT=$?

  if [ "$(git hash-object "${SELF_FILES[@]}" 2>/dev/null)" != "$SELF_BEFORE" ]; then
    echo "!!! SELF-MODIFICATION: the agent changed its own runner/prompt/helper/build."
    echo "!!! Review before trusting this run or letting the next one start:"
    git --no-pager diff --stat -- "${SELF_FILES[@]}"
  fi

  echo
  echo "=== exit: $CLAUDE_EXIT ==="
} >> "$LOG_DIR/$STAMP.log" 2>&1

# keep the last 30 runs
ls -1t "$LOG_DIR"/*.log 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null
exit 0
