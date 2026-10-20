# System capabilities and persistence

What Claude Code can use when it works on this repository in a cloud session, where each capability comes from, and what survives when the cloud VM is destroyed.

- Audited: 2026-10-20, Claude Code 2.1.304, Anthropic-hosted cloud environment "Default" (network access **Trusted**, no setup script).
- Machine-readable record: [`system/capabilities/`](system/capabilities/) (`manifest.json`, `plugins.json`, `skills.json`, `agents.json`).
- How a new session re-checks all of this: [`system/bootstrap/README.md`](system/bootstrap/README.md).
- Compare or regenerate: `python3 system/bootstrap/capability_audit.py [--write]`.
- **What sessions rely on:** the operating baseline in [`system/baseline/BASELINE.md`](system/baseline/BASELINE.md), checked with `capability_audit.py --baseline`.
- **What sessions may do, and the records they keep:** [`system/governance/README.md`](system/governance/README.md) and the decisions under [`system/governance/decisions/`](system/governance/decisions/).
- **Readiness: NOT READY** for capital or commercial actions (see [Readiness](#readiness-not-ready)). Merging the pull request that adds this file doesn't change that.
- **This repository is public.** Account-specific details (connector names, scheduled tasks, credentials, account IDs) are deliberately left out; the plugin inventory is included because it was requested.

**Being listed is not proof that something works.** Each record keeps these fields separate:

| Field | Meaning |
|---|---|
| `available` | the harness listed it in the audited session |
| `functional` | `true` only when verified working; `false` when a hard blocker was found; `null` when not determined |
| `verified` | something actually ran it and got a real result |
| `blocked` | `true`/`false` when known; `null` when its plugin's services are down but it isn't known whether this item needs them |
| `dependency_status` | `none`, `satisfied`, `unknown`, or `unavailable:`/`partially_unavailable:` plus the causes (`network_blocked`, `missing_binary`, `needs_auth`, `needs_credentials`, `needs_config`, `connection_failed`) |

## Cold start: what a fresh session actually got

On 2026-10-20 at 16:57 UTC a brand-new cloud session was created on the same account and environment. It cloned `claude/add-agency-agents`, whose `.claude/agents/` is what `main` will have after PR #2 merges, and reported read-only:

| | Audit session (started from the Claude app) | Fresh session (created through the API) |
|---|---|---|
| Agents | 514 | **288**: 282 Agency + 6 built-in, 0 plugin |
| Skills | 2,495 | **35**: 16 built-in/image + 19 account, 0 plugin |
| Synced plugins on disk | 342–344 (changed during the day) | **0** |
| Cognee memory | local store, server not responding | **absent** |
| MCP failures at start | 215–219 | 0 (no plugin servers to fail) |
| claude.ai connectors | 14 | 11, plus one needing re-authorization |
| `Reality Checker` launch | READY | READY |
| `agent-protocols:code-reviewer` launch | READY | **not found** |
| `Explore` launch | READY | READY |
| `capability_audit.py` (version `ad2c6a6`) | matches manifest | ran; flagged 226 agents and 2,460 skills missing |

**Caveats:**

- **App-started sessions may differ.** This audit session was started from the Claude app and received the account's plugins at boot, and it re-synced them at every resume. The probe was created through the API and received none. The documentation describes syncing claude.ai plugins into terminal and Cowork sessions, not cloud sessions. Whether a session you open from the app gets the plugins is **not guaranteed and not verified for a fresh VM**. Plan as if it doesn't.
- **The first probe ran an earlier script** (`ad2c6a6`). The second probe, below, ran the current configuration.

### Second fresh session: the final configuration (probe 2)

On 2026-10-20 at 19:20 UTC a second fresh session was created through the API on commit `73854cd`, with the deny rules, the output-rewriting switch and the baseline in place. It ran read-only and reported:

| Check | Result |
|---|---|
| Plugins on disk | **0**; the output-rewriting plugin was absent |
| Output-rewriting switch (`TOKEN_OPTIMIZER_DISABLED`) | set, delivered by the repository's `.claude/settings.json` |
| Full inventory check | exit **1**, as documented for a session without plugins: 35 skills and 288 agents against 2,495 and 514 recorded; 226 agents and 2,460 skills missing |
| `--baseline` | exit **0**: all 8 agent files matched their SHA-256 and loaded; built-ins and web tools present; 233 deny rules, none of the required ones missing |
| `records.py verify` | exit 0 (chain empty at that commit) |
| Deny canary `echo vs-deny-canary` | **refused** by Claude Code |
| Denied tools | not offered: session creation, `send_later`, PR merge, Gmail send, Vercel domain purchase. Read tools offered: PR read, `get_session` |
| Agent launches | all 10 replied READY: the 8 baseline agents, `Explore`, `Plan` |
| Real tasks | Codebase Onboarding Engineer mapped the package correctly, read-only. Research Synthesist found the paper only through search results, because **every page fetch failed** (network policy, see [Readiness](#readiness-not-ready)). No tracked file changed |
| Not run | analysis-environment restore and a subagent canary: Claude Code's auto-mode safety classifier refused both in the unattended session. The subagent canary was then run in the audit session and refused there |

## Capability sources and classification

| # | Source | Count | Class | Restored in a fresh cloud session? |
|---|---|---|---|---|
| 1 | Repository `.claude/agents/` (Agency Agents) | 282 | REPOSITORY-PERSISTENT | **yes**, verified by the probe, once PR #2 is on `main` |
| 2 | Repository `system/`, `SYSTEM-CAPABILITIES.md`, `.gitignore` entry, `.claude/agents/UPSTREAM.agency-agents` | — | REPOSITORY-PERSISTENT | yes, after merge |
| 3 | Repository `.claude/settings.json` (PR #2): output-rewriting switch and 233 deny rules | 1 | REPOSITORY-PERSISTENT | **yes**, verified by probe 2: switch set, canary refused, denied tools absent |
| 3a | Repository `CLAUDE.md`, `.mcp.json`, `.claude/skills/` on `main` | none | — | nothing to restore (PR #1, unmerged, adds 6 skills; `*CLAUDE.md` is git-ignored) |
| 4 | claude.ai account plugins | 343 → 344 → 342 in one day | ACCOUNT/PLUGIN-PERSISTENT (stored on the account) | **conditional:** yes in the app-started session, no in the API-created probe |
| 5 | Plugin skills | 2,459 | as #4 | conditional |
| 6 | Plugin agents | 226 | as #4 | conditional |
| 7 | Plugin hooks | 97 events | as #4 | conditional |
| 8 | Plugin MCP server definitions | 359 | as #4; connection result SESSION-ONLY | conditional |
| 9 | claude.ai account skills (`anthropic-skills:*`) | 19 | ACCOUNT/PLUGIN-PERSISTENT | **yes**, verified by the probe |
| 10 | Claude Code built-in skills | 15, plus `workflow-authoring` while Workflow/ultracode is on | ACCOUNT/PLUGIN-PERSISTENT (platform) | yes, verified by the probe |
| 11 | Claude Code built-in agents | 6 | ACCOUNT/PLUGIN-PERSISTENT (platform) | yes, verified by the probe |
| 12 | Cloud-image skill `session-start-hook` | 1 | ACCOUNT/PLUGIN-PERSISTENT (platform) | yes, verified by the probe |
| 13 | Platform hooks | 3 scripts written, **1 wired** (Stop git-check) | ACCOUNT/PLUGIN-PERSISTENT (platform) | yes; rewritten at every worker start |
| 14 | claude.ai connectors | 14 connected here, 11 in the probe (names withheld) | ACCOUNT/PLUGIN-PERSISTENT | partly: 11 verified, the rest not observed |
| 15 | Platform MCP servers `github`, `claude-code-remote` | 2 | ACCOUNT/PLUGIN-PERSISTENT (platform) | yes, verified by the probe |
| 16 | Cloud environment "Default" (Trusted network, **no setup script**; env vars and network secrets not readable) | 1 | ACCOUNT/PLUGIN-PERSISTENT | yes |
| 17 | Account scheduled tasks | 3 (2 enabled; details withheld) | ACCOUNT/PLUGIN-PERSISTENT | survive VM deletion and keep firing |
| 18 | User-scope agents `~/.claude/agents/` (Agency Agents copy) | 282 | MACHINE-PERSISTENT ONLY | no (probe: 0); redundant with #1 |
| 19 | Cognee memory store (`~/.cognee`, `~/.cognee-plugin`, `http://localhost:8011`) | 1 | MACHINE-PERSISTENT ONLY | no. It held essentially nothing: 600+ buffered items were never indexed. The underlying conversation survives server-side |
| 20 | Plugin runtime data (`~/.claude/plugins/data/*`) | 3 files, 348 bytes | MACHINE-PERSISTENT ONLY | no. `~/.delimit` (122 MB), `~/.lbdb` and the 1.2 GB Cognee venv are reinstallable code, not data |
| 21 | Plugin-written working-tree files (`.claude/odoo-timesheet/config.json`) | 1 | MACHINE-PERSISTENT ONLY | recreated only if plugins sync; ignored by `.gitignore` |
| 22 | Local transcript copy `~/.claude/projects/<repo>/<session>.jsonl` | 1 | MACHINE-PERSISTENT ONLY | the conversation itself is server-side: reopen or teleport the session. `capability_audit.py` reads only the local copy |
| 23 | MCP connection results, PR #2 subscription, Workflow runs | — | SESSION-ONLY | absent in a new session; this session can be reopened on a fresh VM |
| 24 | Other remote branches (`claude/auto-video-editing-luxury-w9l6jp`, PR #1) | 1 | REPOSITORY-PERSISTENT | in the repository but not on `main` |

The five-class scheme has no "platform" class, so built-ins and platform-provisioned files are filed under ACCOUNT/PLUGIN-PERSISTENT: something other than the repository restores them.

**Observed survival of "machine-only" state.** The worker restarted twice after idle periods (16:55 and later). The disk survived each time: `~/.claude/agents`, the Cognee store and the scratch files were intact. Idle-restore keeps the disk; reclamation doesn't. Treat machine-only state as lost.

## Audit integrity

- **A third-party plugin rewrote tool output, and is now off.** `agentone-token-compression` (synced from the account) has a PostToolUse hook that replaces tool results via `updatedToolOutput`, and its README says the dropped span "cannot be fetched back". Several command outputs earlier in this audit passed through it. It is now off in two ways ([D-0002](system/governance/decisions/0002-trustworthy-evidence.md)):
  - **Its own switch:** `TOKEN_OPTIMIZER_DISABLED=1`, which took effect at once.
  - **The plugin switch:** `enabledPlugins`, which took effect at the next worker start. Its tools left the session at 19:05 UTC and didn't return.

  The critical checks were then rerun through `system/governance/records.py evidence`, which stores each command's stdout and stderr byte-for-byte on disk, outside any hook, in a hash chain ([evidence index](#evidence-index)).
- **The inventory check counts what the transcript ever listed.** Its skill and agent totals are the union over the whole session, so something that disappears mid-session (like the plugin above) still counts. Start a new session to measure removals.
- **Other hooks fire on every call.** About 340 plugins run hooks with the account owner's privileges. `claude-tab-fix`'s hook fails on every Bash and Write call (binary missing), and `aws-startup-advisor`'s SessionStart hook reads a file its plugin doesn't ship.
- **Plugin versions drift without review.** Between 08:02 and 17:00 on the audit day, `carta-crm` went from 1.16.14 to 1.16.20 and `carta-cap-table` from 6.97.0 to 6.97.12, and a duplicate `viralhunt` copy disappeared. Nothing in this repository pins or records plugin versions except this snapshot.

## Degraded capabilities (listed, but their services are unreachable)

With the plugins present:

- **215–219 MCP servers failed** (the count varies per start): 199 `ERR_PROXY_TUNNEL` (blocked by the Trusted network policy), 6 `ENOENT` (command not installed), 2 `INVALID_CONFIG`, and the rest timeouts or refused or closed connections.
- **3 servers need OAuth:** Datadog, BigQuery, GitLab.
- **1,111 skills** in 131 network-blocked plugins load but can't reach their service.

Regardless of plugins, one account connector needs re-authorization, and many Agency Agents depend on things that don't exist (below).

## PR #2 verification

| Check | Result |
|---|---|
| Location | all 282 definitions plus `LICENSE.agency-agents` and `UPSTREAM.agency-agents` (provenance) directly under `.claude/agents/`. The PR's later commits add the audit files |
| Parsing | 282/282 YAML frontmatter mappings with non-empty `name` and `description` (PyYAML 6.0.1) |
| Unique names | 282 distinct, case-insensitive. No collision with built-in agents |
| Secrets | none. The repository's own leak patterns match 13 of the 303 files the PR adds or changes. Every match is placeholder text in agent prose: addresses at `example.com`, `company.com`, `acme.com` and `db.internal`, `package@version` strings, illustrative UUIDs, token query parameters in sample URLs, and PEM header lines in detection rules, with no key material (evidence `secret-scan-pr-diff`) |
| Discovery | the probe loaded all 282 automatically and launched `Reality Checker` with no install step |
| Tool scope | **265 of 282 have no `tools:` field**, so each inherits every tool in the session. Only 17 restrict themselves. The runtime deny rules now withhold the tools that spend, send, publish or deploy from every agent and subagent ([governance](system/governance/README.md)) |
| Context cost | the 282 names and descriptions add about 17,000 tokens to every session on `main`, including unrelated work |
| Merge | Both PRs touch only one common file, `.gitignore`. PR #2 now adds its entries mid-file and PR #1 edits the end, so they merge cleanly with `main` and with each other in **either order** (evidence `merge-order`; [D-0004](system/governance/decisions/0004-merge-is-not-launch.md)) |
| Local dependencies | **dangling; see below** |

**Dangling dependencies.** Three independent reviewers read all 282 definitions in full and checked every operational reference against this repository, the upstream repository and the session. The scripts and paths below were then re-checked by direct search:

- **Missing scripts (10):**
  - `./qa-playwright-capture.sh`: `testing-evidence-collector.md:44`, `testing-reality-checker.md:63`, `project-manager-senior.md:97`
  - `generate-slides.sh`, `generate_image.py`, `publish-carousel.sh`, `check-analytics.sh`, `analyze-web.js`, `learn-from-analytics.js`: `marketing-carousel-growth-engine.md`
  - `bin/orgscript.js`: `engineering-orgscript-engineer.md`
- **Missing files and folders (24):** `ai/agents/*.md`, `ai/memory-bank/*`, `ai/system/*` (6 agents, including Senior Project Manager, Evidence Collector, Senior Developer and UX Architect), `security/17-security-pattern.md`, the orchestrator's `project-specs/` and `project-tasks/`, and others.
- **Agents that don't exist (34 references in 12 definitions):** some are file-name versus display-name mismatches (`testing-reality-checker` versus `Reality Checker`); others name roles that don't exist ("Contracts Agent", "HR Agent", "Security Engineer", `RealityIntegration`).
- **Tools or MCP servers not available (19):** for example a Google Ads MCP (7 paid-media agents), a payments adapter, and Python libraries that aren't installed.
- **Command-line tools not installed (31):** for example `lighthouse`, `drush`, `forge`, `fastlane` and `wasm-opt`. Most are expected to live in the user's own project.
- **External services (44):** these can't be checked from here.

The full list is in `manifest.json` → `agency_agent_dependency_review`. The vendored files are unmodified upstream content and are not patched here.

## What was committed, and why

| Item | Why |
|---|---|
| `.claude/agents/` (PR #2) with `UPSTREAM.agency-agents` | the only verified way to make the Agency Agents survive, with provenance in a file rather than only in a commit message |
| `system/capabilities/*.json` | the audited state, so a new session can compare itself and see drift |
| `system/bootstrap/README.md`, `capability_audit.py` | how a new session answers the bootstrap questions. Check mode exits 1 on drift or problems; `--write` refuses lossy rewrites and output matching identifier or credential patterns |
| `.gitignore`: `.claude/odoo-timesheet/`, `system/governance/.restricted/`, `.venv-analysis/` | keeps a plugin's credential-bearing config, restricted raw evidence and the analysis environment out of every clone |
| `.claude/settings.json` | output-rewriting plugin off; runtime deny rules for spending, sending, publishing, deploying, store changes, session and scheduled-task creation, merging |
| `system/baseline/` | the operating baseline: agents pinned by SHA-256, dependencies, pinned analysis environment, restore steps |
| `system/governance/` | authority and enforcement, decisions D-0001 to D-0004 (proposed), `records.py` (evidence and action hash chains), `deny_evidence.py`, and the evidence recorded for this change |

**Deliberately not committed:**

- **Plugin implementation files.** Only name, version, marketplace and homepage are recorded.
- **Plugin directory IDs.**
- **Credentials and auth state.**
- **Account, session and trigger IDs.**
- **Connector names.**
- **Scheduled-task details.**
- **MCP URL paths and headers.**
- **Cognee memory contents.**

**Note:** earlier commits on this branch, `ad2c6a6` and `c7a8be4`, named the account's connectors and described one scheduled task. They contain no credentials, but they are public in the branch history.

## Evidence index

Recorded with `python3 system/governance/records.py evidence <label> -- <command>`. The raw output is in `system/governance/evidence/runs/<id>/`, and `INDEX.jsonl` chains the entries. Verify with `records.py verify`. When a label was run more than once, the latest run counts.

| Label | What it shows |
|---|---|
| `baseline-check`, `baseline-check-strict` | the baseline holds; strict mode fails only on the blocked research hosts |
| `inventory-check` | this session still matches the full inventory |
| `deny-enforcement` | tools withdrawn by deny rules, refusals in the session and in a subagent, and no denied tool called after withdrawal |
| `lint-governance-scripts` | ruff, ruff format and isort pass on the new scripts |
| `agent-definitions` | 282 definitions, 282 valid frontmatter blocks, 282 distinct names |
| `secret-scan-pr-diff` | leak-pattern matches in the PR's files, all placeholders (above) |
| `merge-order` | PR #1 and PR #2 merge cleanly into `main` in either order |
| `pr-make-test`, `main-make-test`, `pr-make-lint`, `main-make-lint` | identical failures on `main` and on this PR (below) |
| `package-install-import` | a clean install of the package and the import failure (below) |

## Known failures on `main` (outside this PR)

These were on `main` before this work. They are recorded here so they aren't confused with this change, and this PR doesn't try to fix them:

- **`make test`** collects 0 tests (pytest exit 5). Same on `main` `d042a7b` and on this PR.
- **`make lint`** fails at its first step: isort reports `verbalized_sampling/api.py` and `verbalized_sampling/__init__.py`. Same on both.
- **The package doesn't import after a clean install on Python 3.13.** `pip install -e .` succeeds, but `datasets` (unpinned) resolves to 5.1.0, which needs `pyarrow>=24`, which needs NumPy 2, while `pyproject.toml` caps `numpy<2.0`. `import verbalized_sampling` then fails in `datasets`. Also, `__init__.py` says version 0.2.0 while `pyproject.toml` says 0.1.3.

## Readiness: NOT READY

The repository can support research and validation. It is **not ready** for capital or commercial actions, and merging this change doesn't alter that ([D-0004](system/governance/decisions/0004-merge-is-not-launch.md)). Each blocker needs the founder:

1. **No spending authority.** No decision sets amounts, approvers or providers ([D-0003](system/governance/decisions/0003-spending-and-external-action-authority.md)). The runtime denies the tools until one does.
2. **No restricted store** for provider receipts, transaction IDs and customer data, so no external action can be recorded properly.
3. **Account-level grants are broader than this repository's rules.** A scheduled task on the account carries broad connector grants and a standing API token. Project deny rules don't reach it. Review: https://claude.ai/code/routines.
4. **Research can't read primary sources.** The environment's network policy blocks arxiv.org, huggingface.co, semanticscholar.org and other scholarly hosts, so research agents get search snippets only.
5. **The decisions are proposals.** D-0001 to D-0004 take effect when the founder accepts them.
6. **The product itself doesn't install cleanly** on current Python (above).
7. **The audit trail is tamper-evident only against an outside copy.** Protect `main` on GitHub, or record the chain heads elsewhere.

## Decisions for the account owner

1. **Mark PR #2 ready and merge it** as an audit and persistence change. It merges cleanly with PR #1 in either order. Merging doesn't authorize launch.
2. **Plugins:** from a fresh session opened in the Claude app, run `python3 system/bootstrap/capability_audit.py`. It exits 1 if the plugins didn't arrive. Then decide which plugins the company actually needs, disable the rest, and install anything essential from a setup script so it's pinned.
3. **Scheduled tasks** (https://claude.ai/code/routines): review all three. One holds a standing API token with broad connector grants.
4. **Agent tool scope:** the runtime deny rules now cover this repository. For stronger control, set claude.ai organization connector policies (`blocked` or `ask`) that no session can edit.
5. **Audit integrity:** `agentone-token-compression` is now off for this repository. Turn it off account-wide too, and `claude-tab-fix`, whose hook fails on every call, if transcripts from other repositories are meant to be evidence.
6. **Memory and decisions:** Cognee is local-only and stored nothing. Keep decisions in the repository (or another durable, reviewable system), not in plugin memory.
7. **Network policy:** keep **Trusted** and accept 131 degraded plugins, or allow specific hosts (`manifest.json` → `blocked_hosts`).
8. **Branch history:** if the connector list and scheduled-task description in earlier commits shouldn't be public, the branch history needs rewriting before merge. A squash merge alone leaves the old commits reachable through the PR.
