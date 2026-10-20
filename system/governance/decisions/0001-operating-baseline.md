# D-0001: A small operating baseline for research and validation

- Status: **Proposed** (drafted by a Claude Code session on 2026-10-20; takes effect when the founder accepts it)
- Scope: all Claude Code sessions on this repository

## Context

A session on this repository can list 282 vendored Agency Agents, and, when the account's plugins arrive, about 2,500 skills and 230 plugin agents. Being listed doesn't mean they work. Many Agency Agents call scripts, files or agents that don't exist here, and plugins arrived in the session started from the Claude app but not in a fresh session created through the API. The work for now is research and validation, not launch.

## Decision

1. Sessions rely only on the capabilities in `system/baseline/baseline.json`:
   - eight Agency Agents: Statistician, Research Synthesist, Trend Researcher, Feedback Synthesizer, Business Strategist, Codebase Onboarding Engineer, Code Reviewer, Minimal Change Engineer
   - the built-in agents and tools
   - `python3`, `git` and the pinned analysis environment
   - the committed settings and governance scripts
2. Each baseline agent's file is pinned by SHA-256. Each dependency is either available, resolved by a documented restore step, or explicitly out of scope or not authorized. The agent works within those limits; nothing is worked around.
3. No plugin capability is part of the baseline. `capability_audit.py --baseline` must pass in a session without plugins.
4. The full inventory stays recorded. Adding a capability to the baseline means checking its dependencies, adding it to `baseline.json` and amending this decision in a reviewed pull request.

## Evidence

- `capability_audit.py --baseline` in the audit session and in a fresh session; see the evidence index under `system/governance/evidence/` and `manifest.json` → `cold_start_probe_2`.
- The analysis environment was rebuilt from the pinned file and its imports checked.

## Consequences

- Research agents can read, search public sources, compute and write sanitized notes. They can't buy, send, publish or deploy, because the runtime denies those tools (D-0003), not because the agents' prompts say so.
- The vendored files are not edited. Limits come from the runtime and from this decision.
