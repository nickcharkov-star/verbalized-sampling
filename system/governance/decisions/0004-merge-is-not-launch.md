# D-0004: Merging the persistence and audit change is not a launch decision

- Status: **Proposed** (drafted by a Claude Code session on 2026-10-20; takes effect when the founder accepts it)

## Context

PR #2 adds the Agency Agents, a capability audit, an operating baseline, governance records and runtime restrictions. It can be merged on its own merits as an accurately qualified audit and persistence change. The business is still **NOT READY** to receive capital or take commercial actions.

## Decision

1. Merging PR #2 authorizes only the repository change. It doesn't authorize spending, outreach, deployment or any commercial action.
2. Readiness stays **NOT READY** until the founder records a decision that resolves each blocker in `SYSTEM-CAPABILITIES.md` ("Readiness").
3. The `make test` and `make lint` failures on `main` predate this work and stay documented separately. This change does not try to fix them.

## Merge order with PR #1

- Both pull requests merge cleanly with `main` and with each other in either order. PR #2 adds its `.gitignore` entries in the middle of the file, while PR #1 edits the end. A merge simulation of both orders was recorded as evidence.
- After PR #1 merges, `main` gains six project skills under `.claude/skills/`. Re-run `python3 system/bootstrap/capability_audit.py --baseline` afterwards. Those skills aren't part of the baseline.
