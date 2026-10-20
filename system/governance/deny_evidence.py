#!/usr/bin/env python3
"""Summarize deny-rule enforcement recorded in this session's transcript.

  python3 system/governance/deny_evidence.py [--transcript PATH]

Reads the newest session transcript for this repository (the format belongs to Claude Code and
may change) and reports, as tool names and timestamps only:
  - tools the harness withdrew from the session after they matched a deny rule
  - commands Claude Code refused with a permission denial
  - every call to a tool the current rules deny, and whether it came before that tool was
    withdrawn (a call after withdrawal would mean the rule did not hold)
Exit 1 if any call to a denied tool happened after the tool was withdrawn.
"""

import argparse
import fnmatch
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bootstrap"))
from capability_audit import REPO, latest_transcript  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--transcript", help="transcript to read (default: newest for this repo)")
    args = parser.parse_args()
    with open(os.path.join(REPO, ".claude", "settings.json"), encoding="utf-8") as fh:
        rules = [r for r in json.load(fh)["permissions"]["deny"] if r.startswith("mcp__")]

    def denied(name):
        return any(fnmatch.fnmatchcase(name, rule) for rule in rules)

    deltas, refusals, calls, first = [], [], [], None
    with open(args.transcript or latest_transcript(), encoding="utf-8") as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            when = rec.get("timestamp") or ""
            first = first or when or None
            att = rec.get("attachment")
            if isinstance(att, dict) and att.get("type") == "deferred_tools_delta":
                retracted = [
                    t.get("name")
                    for t in att.get("retractedTools") or []
                    if t.get("cause") == "denied" and t.get("name")
                ]
                deltas.append((when, att.get("removedNames") or [], retracted))
            msg = rec.get("message")
            parts = msg.get("content") if isinstance(msg, dict) else None
            for part in parts if isinstance(parts, list) else []:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "tool_use":
                    calls.append((when, part.get("name") or ""))
                elif part.get("type") == "tool_result" and part.get("is_error"):
                    text = json.dumps(part.get("content"))
                    if "has been denied" in text:
                        refusals.append((when, text[:160]))

    # Rules take effect at the first denial the harness records; a session that started with the
    # rules in place records none, so then they hold from its first record.
    marks = [w for w, _, retracted in deltas if retracted] + [w for w, _ in refusals]
    effective = min(marks) if marks else first or ""
    withdrawn = {}
    for when, removed, retracted in deltas:
        for name in retracted:
            withdrawn.setdefault(name, when)
        # Tools also disappear when a server disconnects; count removals only once rules hold.
        for name in removed if when >= effective else []:
            if denied(name):
                withdrawn.setdefault(name, when)

    print(f"deny rules for MCP tools: {len(rules)}; rules in effect from {effective}")
    print(f"tools withdrawn from the session after the rules took effect: {len(withdrawn)}")
    for name, when in sorted(withdrawn.items(), key=lambda kv: kv[1])[:5]:
        print(f"  e.g. {when} {name}")
    print(f"permission refusals: {len(refusals)}")
    for when, text in refusals:
        print(f"  {when} {text}")
    late = []
    for when, name in calls:
        if denied(name):
            gone_at = withdrawn.get(name, effective)
            after = when > gone_at
            late += [name] if after else []
            state = "AFTER withdrawal" if after else f"before withdrawal ({gone_at})"
            print(f"call to a now-denied tool: {when} {name}: {state}")
    print(f"result: {'RULE BYPASSED' if late else 'no denied tool was called after withdrawal'}")
    return 1 if late else 0


if __name__ == "__main__":
    sys.exit(main())
