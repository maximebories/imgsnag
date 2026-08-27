#!/usr/bin/env python3
"""Jules API helper for the nightly triage job.

Exists so the triage agent never needs `python3 -c` (arbitrary code execution)
or a raw `curl` carrying the API key on its command line. The key is read from
the macOS Keychain inside this process and never printed, never passed as an
argument, and never echoed back in output.

Usage:
    python3 tools/jules.py list [--page-size N] [--state STATE]
    python3 tools/jules.py activities SESSION_ID [--last N]
    python3 tools/jules.py send SESSION_ID --message-file PATH

`send` reads the reply body from a file rather than argv: triage replies are
long Markdown, and a file avoids both shell-quoting damage and leaking the
message into the process table.
"""

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request

BASE = "https://jules.googleapis.com/v1alpha"
KEYCHAIN_SERVICE = "jules-api-key"


def api_key():
    """Read the Jules API key from the login Keychain."""
    try:
        out = subprocess.run(
            ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError:
        sys.exit(f"error: no Keychain item for service '{KEYCHAIN_SERVICE}'")
    key = out.stdout.strip()
    if not key:
        sys.exit(f"error: Keychain item '{KEYCHAIN_SERVICE}' is empty")
    return key


def request(path, payload=None):
    """GET (payload=None) or POST JSON against the Jules API."""
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        f"{BASE}/{path.lstrip('/')}",
        data=data,
        method="POST" if data else "GET",
        headers={
            "X-Goog-Api-Key": api_key(),
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode()
    except urllib.error.HTTPError as exc:
        # Surface the API's own error text, but never the request headers.
        sys.exit(f"error: HTTP {exc.code} on {path}\n{exc.read().decode()[:2000]}")
    except urllib.error.URLError as exc:
        sys.exit(f"error: cannot reach Jules API: {exc.reason}")
    return json.loads(body) if body.strip() else {}


def cmd_list(args):
    data = request(f"sessions?pageSize={args.page_size}")
    sessions = data.get("sessions", [])
    if args.state:
        wanted = args.state.upper()
        sessions = [s for s in sessions if s.get("state", "") == wanted]
    sessions.sort(key=lambda s: s.get("updateTime", ""), reverse=True)
    for s in sessions:
        title = " ".join((s.get("title") or "").split())[:70]
        print(f"{s.get('updateTime', '?')}\t{s.get('state', '?')}\t{s.get('id', '?')}\t{title}")
    print(f"--- {len(sessions)} session(s); more pages: {bool(data.get('nextPageToken'))}", file=sys.stderr)


# Fields present on every activity envelope; the remaining key is the payload
# ("agentMessaged", "progressUpdated", "planGenerated", "userMessaged", ...).
ENVELOPE_KEYS = {"name", "createTime", "originator", "id", "artifacts"}


def cmd_activities(args):
    data = request(f"sessions/{args.session_id}/activities")
    acts = data.get("activities", [])
    for act in acts[-args.last:]:
        kind = next((k for k in act if k not in ENVELOPE_KEYS), "?")
        stamp = act.get("createTime", "?")
        body = json.dumps(act.get(kind, act), indent=2)[:4000]
        print(f"=== {stamp} [{kind}] ===\n{body}\n")
    print(f"--- {len(acts)} activities total, showing last {min(args.last, len(acts))}", file=sys.stderr)


def cmd_send(args):
    with open(args.message_file, encoding="utf-8") as fh:
        prompt = fh.read()
    if not prompt.strip():
        sys.exit("error: message file is empty")
    request(f"sessions/{args.session_id}:sendMessage", {"prompt": prompt})
    print(f"sent {len(prompt)} chars to session {args.session_id}")


def main():
    parser = argparse.ArgumentParser(prog="jules.py", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list", help="list sessions, newest first")
    p_list.add_argument("--page-size", type=int, default=100)
    p_list.add_argument("--state", help="filter, e.g. AWAITING_USER_FEEDBACK")
    p_list.set_defaults(func=cmd_list)

    p_act = sub.add_parser("activities", help="dump a session's recent activities")
    p_act.add_argument("session_id")
    p_act.add_argument("--last", type=int, default=5)
    p_act.set_defaults(func=cmd_activities)

    p_send = sub.add_parser("send", help="reply to a session")
    p_send.add_argument("session_id")
    p_send.add_argument("--message-file", required=True)
    p_send.set_defaults(func=cmd_send)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
