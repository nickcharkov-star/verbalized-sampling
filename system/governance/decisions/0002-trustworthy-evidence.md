# D-0002: Turn off output rewriting and keep raw evidence

- Status: **Proposed** (drafted by a Claude Code session on 2026-10-20; takes effect when the founder accepts it)
- Scope: all Claude Code sessions on this repository

## Context

The account syncs a plugin, `agentone-token-compression`, whose PostToolUse hook replaces tool results (Read, Grep, Glob, Bash, WebFetch, NotebookRead) with compressed or cached text before Claude sees them. Its README says the dropped text "cannot be fetched back". Evidence gathered while it runs is not a faithful record of what a command printed.

## Decision

1. Turn the plugin off for this repository in `.claude/settings.json`, in two ways: the plugin's own documented switch (`env.TOKEN_OPTIMIZER_DISABLED = "1"`, honored by all five of its hooks) and Claude Code's plugin switch (`enabledPlugins["agentone-token-compression@synced"] = false`).
2. Record critical checks with `system/governance/records.py evidence`. It stores stdout and stderr byte-for-byte on disk, so the hook never touches them, together with exit code, git HEAD and whether the switch was on, all in a hash chain. Summaries live elsewhere and point to the evidence ID.

## Evidence

- In the audit session the switch took effect without a restart. A large output updated the plugin's cache at 18:28:35 UTC, and the same kind of output a minute later did not. No compression notes appeared after that.
- The fresh-session test in `system/capabilities/manifest.json` (`cold_start_probe_2`) checks that a new session receives the switch from the repository alone.

## Consequences

- Sessions use more context, because outputs are no longer compressed.
- Turning the plugin back on for this repository requires changing this decision.
