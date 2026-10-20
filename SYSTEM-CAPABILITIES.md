# System capabilities and persistence

What Claude Code can use when it works on this repository in a cloud session, where each capability comes from, and what survives when the cloud VM is destroyed.

- Audited: 2026-10-20, Claude Code 2.1.304, Anthropic-hosted cloud environment "Default" (network access **Trusted**, no setup script).
- Machine-readable record: [`system/capabilities/`](system/capabilities/) (`manifest.json`, `plugins.json`, `skills.json`, `agents.json`).
- How a new session re-checks all of this: [`system/bootstrap/README.md`](system/bootstrap/README.md).
- Compare or regenerate: `python3 system/bootstrap/capability_audit.py [--write]`.
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
- **The probe ran an earlier script.** It ran the audit script as of commit `ad2c6a6`. The current version, with its guards, has only run in this session. `.claude/agents/` hasn't changed since.

## Capability sources and classification

| # | Source | Count | Class | Restored in a fresh cloud session? |
|---|---|---|---|---|
| 1 | Repository `.claude/agents/` (Agency Agents) | 282 | REPOSITORY-PERSISTENT | **yes**, verified by the probe, once PR #2 is on `main` |
| 2 | Repository `system/`, `SYSTEM-CAPABILITIES.md`, `.gitignore` entry, `.claude/agents/UPSTREAM.agency-agents` | — | REPOSITORY-PERSISTENT | yes, after merge |
| 3 | Repository `CLAUDE.md`, `.claude/settings.json`, `.mcp.json`, `.claude/skills/` on `main` | none | — | nothing to restore (PR #1, unmerged, adds 6 skills) |
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

- **A third-party plugin rewrites tool output.** `agentone-token-compression` (synced from the account) has a PostToolUse hook that replaces tool results via `updatedToolOutput`, with compressed or cached text, and its README says the dropped span "cannot be fetched back". Several command outputs in this audit passed through it. The key counts in this document come from scripts that wrote files and were re-checked, but any evidence gathered while that plugin is enabled is not a faithful record of what a command printed.
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
| Secrets | none. Four scanner hits are teaching examples: a 20-character fake key in a bad-practice sample, and private-key header lines with no key material in detection rules |
| Discovery | the probe loaded all 282 automatically and launched `Reality Checker` with no install step |
| Tool scope | **265 of 282 have no `tools:` field**, so each inherits every tool in the session, including connector tools that write (email, store, ads, deploys). Only 17 restrict themselves |
| Context cost | the 282 names and descriptions add about 17,000 tokens to every session on `main`, including unrelated work |
| Merge | PR #2 is a **draft**. It and PR #1 both edit the end of `.gitignore`, so merging both conflicts (`git merge-tree` exit 1) |
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
| `.gitignore`: `.claude/odoo-timesheet/` | keeps a plugin's per-session config, which has credential fields, out of every clone |

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

## Decisions for the account owner

1. **Mark PR #2 ready and merge it.** Resolve the `.gitignore` conflict if PR #1 also merges.
2. **Plugins:** from a fresh session opened in the Claude app, run `python3 system/bootstrap/capability_audit.py`. It exits 1 if the plugins didn't arrive. Then decide which plugins the company actually needs, disable the rest, and install anything essential from a setup script so it's pinned.
3. **Scheduled tasks** (https://claude.ai/code/routines): review all three. One holds a standing API token with broad connector grants.
4. **Agent tool scope:** give vendored agents a `tools:` list, or accept that any of them can send email, change the store or spend ad budget.
5. **Audit integrity:** disable `agentone-token-compression` (and `claude-tab-fix`) if session transcripts are meant to be evidence.
6. **Memory and decisions:** Cognee is local-only and stored nothing. Keep decisions in the repository (or another durable, reviewable system), not in plugin memory.
7. **Network policy:** keep **Trusted** and accept 131 degraded plugins, or allow specific hosts (`manifest.json` → `blocked_hosts`).
8. **Branch history:** if the connector list and scheduled-task description in earlier commits shouldn't be public, the branch history needs rewriting before merge. A squash merge alone leaves the old commits reachable through the PR.
