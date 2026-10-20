#!/usr/bin/env python3
"""Hash-chained records: raw command evidence and sanitized external-action entries.

  python3 system/governance/records.py evidence <label> -- <command> [args...]
  python3 system/governance/records.py action --kind KIND --provider NAME --summary TEXT \\
      --approved-by ROLE --decision DECISION_ID --receipt-digest SHA256 \\
      [--amount N --currency CUR] [--restricted-store LABEL]
  python3 system/governance/records.py verify

Evidence: the command's stdout and stderr are stored byte-for-byte, with exit code, timing,
git HEAD and whether the output-rewriting plugin was disabled. Nothing is summarised or
filtered. Output that matches an identifier or credential pattern is kept only under
system/governance/.restricted/ (git-ignored) and the public record keeps its SHA-256 alone.

Actions: one sanitized line per external action. Provider receipts, transaction IDs and any
customer data stay in the restricted store; the public line holds only the SHA-256 digest of
that restricted receipt record, so the two can be matched later without publishing either.

Both logs are hash chains: each entry includes the previous entry's hash. Editing or removing
an earlier entry breaks every later hash, which `verify` reports. This is tamper-evident only
against a copy the editor cannot also rewrite, such as pushed commits on a protected branch.
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
EVIDENCE_DIR = os.path.join(HERE, "evidence")
EVIDENCE_INDEX = os.path.join(EVIDENCE_DIR, "INDEX.jsonl")
ACTIONS = os.path.join(HERE, "actions.jsonl")
RESTRICTED = os.path.join(HERE, ".restricted")

sys.path.insert(0, os.path.join(REPO, "system", "bootstrap"))
from capability_audit import find_leaks  # noqa: E402  (shared leak patterns)

ACTION_KINDS = ("purchase", "subscription", "ad_spend", "outreach", "publish", "deploy", "other")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def _now():
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()


def _sha256(data):
    return hashlib.sha256(data).hexdigest()


def _canonical(entry):
    return json.dumps(entry, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _read_chain(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def _append(path, body):
    """Append body to the chain at path, linking it to the previous entry."""
    chain = _read_chain(path)
    entry = dict(body)
    entry["seq"] = len(chain) + 1
    entry["prev_hash"] = chain[-1]["hash"] if chain else "0" * 64
    entry["hash"] = _sha256(_canonical(entry))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, sort_keys=True, ensure_ascii=False) + "\n")
    return entry


def _git(*args):
    try:
        return subprocess.run(
            ["git", *args], cwd=REPO, capture_output=True, text=True, check=False
        ).stdout.strip()
    except OSError:
        return ""


def cmd_evidence(label, command):
    if not re.match(r"^[a-z0-9][a-z0-9-]{0,48}$", label):
        raise SystemExit("label must be lowercase letters, digits and dashes")
    # The command is written to the public meta.json, so it must not carry identifiers either.
    if find_leaks(" ".join(command)):
        raise SystemExit(f"refusing: the command matches {find_leaks(' '.join(command))}")
    # Record what was tested before running it; a long command can outlast a commit.
    git_head = _git("rev-parse", "HEAD")
    # Evidence written by earlier runs doesn't count as a change to what was tested.
    git_dirty = bool(_git("status", "--porcelain", "--", ".", ":!system/governance/evidence"))
    started = _now()
    proc = subprocess.run(command, cwd=REPO, capture_output=True, check=False)
    finished = _now()
    run_id = started.replace(":", "").replace("-", "").replace("+0000", "Z") + "-" + label
    outputs = {"stdout.txt": proc.stdout, "stderr.txt": proc.stderr}
    leaks = sorted(
        {name for data in outputs.values() for name in find_leaks(data.decode("utf-8", "replace"))}
    )
    restricted = bool(leaks)
    out_dir = os.path.join(RESTRICTED if restricted else EVIDENCE_DIR, "runs", run_id)
    os.makedirs(out_dir, exist_ok=True)
    for name, data in outputs.items():
        with open(os.path.join(out_dir, name), "wb") as fh:
            fh.write(data)
    meta = {
        "id": run_id,
        "label": label,
        "command": command,
        "exit_code": proc.returncode,
        "started": started,
        "finished": finished,
        "git_head": git_head,
        "git_dirty": git_dirty,
        "output_rewriting_plugin_disabled": os.environ.get("TOKEN_OPTIMIZER_DISABLED") == "1",
        "files": {
            name: {"sha256": _sha256(data), "bytes": len(data)} for name, data in outputs.items()
        },
        "restricted": restricted,
        "restricted_reason": leaks,
    }
    public_dir = os.path.join(EVIDENCE_DIR, "runs", run_id)
    os.makedirs(public_dir, exist_ok=True)
    meta_bytes = (json.dumps(meta, indent=1, sort_keys=True, ensure_ascii=False) + "\n").encode()
    with open(os.path.join(public_dir, "meta.json"), "wb") as fh:
        fh.write(meta_bytes)
    entry = _append(
        EVIDENCE_INDEX,
        {
            "kind": "evidence",
            "id": run_id,
            "recorded": finished,
            "meta_sha256": _sha256(meta_bytes),
        },
    )
    where = "restricted (git-ignored)" if restricted else os.path.relpath(public_dir, REPO)
    print(f"{run_id}: exit {proc.returncode}, outputs in {where}, chain seq {entry['seq']}")
    return proc.returncode


def cmd_action(args):
    if args.kind not in ACTION_KINDS:
        raise SystemExit(f"kind must be one of {ACTION_KINDS}")
    if not SHA256.match(args.receipt_digest):
        raise SystemExit(
            "--receipt-digest must be the SHA-256 hex digest of the restricted receipt"
        )
    public = {
        "kind": args.kind,
        "provider": args.provider,
        "summary": args.summary,
        "approved_by": args.approved_by,
        "decision": args.decision,
        "amount": args.amount,
        "currency": args.currency,
        "receipt_digest": args.receipt_digest,
        "restricted_store": args.restricted_store,
    }
    leaks = find_leaks(json.dumps(public))
    if leaks:
        raise SystemExit(f"refusing: public fields match {leaks}; keep identifiers restricted")
    public["recorded"] = _now()
    entry = _append(ACTIONS, public)
    print(f"action recorded: seq {entry['seq']} hash {entry['hash']}")
    return 0


def _verify_chain(path, label):
    problems = []
    prev = "0" * 64
    chain = _read_chain(path)
    for i, entry in enumerate(chain, 1):
        body = {k: v for k, v in entry.items() if k != "hash"}
        if entry.get("seq") != i:
            problems.append(f"{label}: entry {i} has seq {entry.get('seq')}")
        if entry.get("prev_hash") != prev:
            problems.append(f"{label}: entry {i} does not link to the previous entry")
        if _sha256(_canonical(body)) != entry.get("hash"):
            problems.append(f"{label}: entry {i} was modified after it was written")
        prev = entry.get("hash")
    return chain, problems


def cmd_verify():
    problems = []
    evidence, found = _verify_chain(EVIDENCE_INDEX, "evidence")
    problems += found
    for entry in evidence:
        meta_path = os.path.join(EVIDENCE_DIR, "runs", entry["id"], "meta.json")
        if not os.path.exists(meta_path):
            problems.append(f"evidence {entry['id']}: meta.json missing")
            continue
        with open(meta_path, "rb") as fh:
            meta_bytes = fh.read()
        if _sha256(meta_bytes) != entry["meta_sha256"]:
            problems.append(f"evidence {entry['id']}: meta.json changed")
            continue
        meta = json.loads(meta_bytes)
        base = os.path.join(RESTRICTED if meta["restricted"] else EVIDENCE_DIR, "runs", entry["id"])
        for name, info in meta["files"].items():
            path = os.path.join(base, name)
            if not os.path.exists(path):
                if not meta["restricted"]:
                    problems.append(f"evidence {entry['id']}: {name} missing")
                continue
            with open(path, "rb") as fh:
                if _sha256(fh.read()) != info["sha256"]:
                    problems.append(f"evidence {entry['id']}: {name} changed")
    actions, found = _verify_chain(ACTIONS, "actions")
    problems += found
    print(f"evidence entries: {len(evidence)}, head {evidence[-1]['hash'] if evidence else 'none'}")
    print(f"action entries:   {len(actions)}, head {actions[-1]['hash'] if actions else 'none'}")
    for problem in problems:
        print("PROBLEM:", problem)
    print("result:", "BROKEN" if problems else "intact")
    return 1 if problems else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    ev = sub.add_parser("evidence", help="run a command and record its raw output")
    ev.add_argument("label")
    ev.add_argument("command", nargs=argparse.REMAINDER)
    act = sub.add_parser("action", help="record a sanitized external action")
    act.add_argument("--kind", required=True)
    act.add_argument("--provider", required=True)
    act.add_argument("--summary", required=True)
    act.add_argument("--approved-by", required=True)
    act.add_argument("--decision", required=True)
    act.add_argument("--receipt-digest", required=True)
    act.add_argument("--amount")
    act.add_argument("--currency")
    act.add_argument("--restricted-store", default="founder-held private store")
    sub.add_parser("verify", help="check both hash chains and the evidence files")
    args = parser.parse_args()
    if args.cmd == "evidence":
        command = args.command[1:] if args.command[:1] == ["--"] else args.command
        if not command:
            raise SystemExit("give the command after --")
        return cmd_evidence(args.label, command)
    if args.cmd == "action":
        return cmd_action(args)
    return cmd_verify()


if __name__ == "__main__":
    sys.exit(main())
