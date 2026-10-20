# System capabilities and persistence

What Claude Code can use when it works on this repository in a cloud session, where each capability comes from, and what survives when the cloud VM is destroyed.

- Audited: 2026-10-20, Claude Code 2.1.304, Anthropic-hosted cloud environment "Default" (network access **Trusted**, no setup script).
- Machine-readable record: [`system/capabilities/`](system/capabilities/) (`manifest.json`, `plugins.json`, `skills.json`, `agents.json`).
- How a new session re-checks all of this: [`system/bootstrap/README.md`](system/bootstrap/README.md).
- Regenerate or compare: `python3 system/bootstrap/capability_audit.py [--write]`.

**Being listed is not proof that something works.** Each record keeps these fields separate:

| Field | Meaning |
|---|---|
| `available` | the harness listed it in the audited session |
| `functional` | `true` only when verified working; `false` when a hard blocker was found; `null` when not determined |
| `verified` | something actually ran it and got a real result |
| `blocked` | `true`/`false` when known; `null` when its plugin's services are down but it isn't known whether this item needs them |
| `dependency_status` | `none`, `satisfied`, `unknown`, or `unavailable:`/`partially_unavailable:` plus the causes (`network_blocked`, `missing_binary`, `needs_auth`, `needs_credentials`, `needs_config`, `connection_failed`) |

## Cold start: what a fresh session actually got

On 2026-10-20 at 16:57 UTC a brand-new cloud session was created on the same account and environment. It cloned `claude/add-agency-agents`, which has the same tree `main` will have after PR #2 merges, and reported read-only:

| | Audit session (started from the Claude app) | Fresh session (created through the API) |
|---|---|---|
| Agents | 514 | **288**: 282 Agency + 6 built-in, 0 plugin |
| Skills | 2,495 | **35**: 16 built-in/image + 19 account, 0 plugin |
| Synced plugins on disk | 342–344 (changed during the day) | **0** |
| Cognee memory | local store, server not responding | **absent** |
| MCP failures at start | 217–219 | 0 (no plugin servers to fail) |
| `Reality Checker` launch | READY | READY |
| `agent-protocols:code-reviewer` launch | READY | **not found** |
| `Explore` launch | READY | READY |
| `capability_audit.py` | matches manifest | ran; flagged 226 agents and 2,460 skills missing |

**Caveat:** this audit session was started from the Claude app and received the account's plugins when its VM booted at 07:04. The probe was created through the API and received none. The documentation describes syncing claude.ai plugins into terminal and Cowork sessions, not cloud sessions. So whether a session you open from the app gets the plugins is **not guaranteed and not verified for a fresh VM**. Plan as if it doesn't.

## Capability sources and classification

| # | Source | Count | Class | Restored in a fresh cloud session? |
|---|---|---|---|---|
| 1 | Repository `.claude/agents/` (Agency Agents) | 282 | REPOSITORY-PERSISTENT | **yes**, verified by the probe, once PR #2 is on `main` |
| 2 | Repository `system/`, `SYSTEM-CAPABILITIES.md`, `.gitignore` entry | — | REPOSITORY-PERSISTENT | yes, after merge |
| 3 | Repository `CLAUDE.md`, `.claude/settings.json`, `.mcp.json`, `.claude/skills/` | none exist | — | nothing to restore |
| 4 | claude.ai account plugins (`~/.claude/plugins/synced/<account>/`) | 343 → 344 → 342 in one day | ACCOUNT/PLUGIN-PERSISTENT (stored on the account) | **conditional:** yes in the app-started session, no in the API-created probe |
| 5 | Plugin skills | 2,459 | as #4 | conditional |
| 6 | Plugin agents | 226 | as #4 | conditional |
| 7 | Plugin hooks | 106 events | as #4 | conditional |
| 8 | Plugin MCP server definitions | 359 | as #4; connection result SESSION-ONLY | conditional |
| 9 | claude.ai account skills (`anthropic-skills:*`) | 19 | ACCOUNT/PLUGIN-PERSISTENT | **yes**, verified by the probe |
| 10 | Claude Code built-in skills | 15, plus `workflow-authoring` while Workflow/ultracode is on | ACCOUNT/PLUGIN-PERSISTENT (platform) | yes, verified by the probe |
| 11 | Claude Code built-in agents | 6 | ACCOUNT/PLUGIN-PERSISTENT (platform) | yes, verified by the probe |
| 12 | Cloud-image skill `session-start-hook` | 1 | ACCOUNT/PLUGIN-PERSISTENT (platform) | yes, verified by the probe |
| 13 | Platform hook scripts in `~/.claude/` (git check, reply gate, prompt reminder) | 3 | ACCOUNT/PLUGIN-PERSISTENT (platform) | yes; rewritten at every worker start |
| 14 | claude.ai connectors | 13 connected, plus Meta Ads needing re-auth | ACCOUNT/PLUGIN-PERSISTENT | yes, verified by the probe |
| 15 | Platform MCP servers `github`, `claude-code-remote` | 2 | ACCOUNT/PLUGIN-PERSISTENT (platform) | yes, verified by the probe |
| 16 | Cloud environment "Default" (Trusted network; **no setup script**; env vars and network secrets not readable) | 1 | ACCOUNT/PLUGIN-PERSISTENT | yes |
| 17 | Account scheduled tasks | 3 (2 enabled) | ACCOUNT/PLUGIN-PERSISTENT | they survive VM deletion and keep firing |
| 18 | User-scope agents `~/.claude/agents/` (Agency Agents copy) | 282 | MACHINE-PERSISTENT ONLY | no (probe: 0) |
| 19 | Cognee memory store (`~/.cognee`, `~/.cognee-plugin`, `http://localhost:8011`) | 1 store | MACHINE-PERSISTENT ONLY | **no; permanently lost** (probe: absent) |
| 20 | Plugin runtime data (`~/.claude/plugins/data/*`, `~/.delimit`, `~/.lbdb`, caches, a 1.2 GB Cognee venv) | 59+ dirs | MACHINE-PERSISTENT ONLY | no |
| 21 | Plugin-written working-tree files (`.claude/odoo-timesheet/config.json`) | 1 | MACHINE-PERSISTENT ONLY | recreated by the plugin only if plugins sync; now ignored by `.gitignore` |
| 22 | Session transcript `~/.claude/projects/<repo>/<session>.jsonl` | 1 | MACHINE-PERSISTENT ONLY | conversation restored only when *this* session is reopened |
| 23 | MCP connection results, PR #2 subscription, Workflow runs | — | SESSION-ONLY | no |
| 24 | Other remote branches (`claude/auto-video-editing-luxury-w9l6jp`, PR #1) | 1 | REPOSITORY-PERSISTENT | in the repository but not on `main` |

The five-class scheme has no "platform" class, so built-ins and platform-provisioned files are filed under ACCOUNT/PLUGIN-PERSISTENT: something other than the repository restores them.

**Observed survival of "machine-only" state.** The VM's worker restarted at 16:55 after a long idle period, and the disk survived: `~/.claude/agents`, the Cognee store and the scratch files were all intact. Idle-restore keeps the disk; reclamation doesn't. Treat machine-only state as lost, not as "probably fine".

## Account state that outlives every VM, including risks

- **Scheduled task "Install verbalized-sampling".** Enabled, API-triggered, created 2026-06-04. It holds a stored API token and grants for 11 connectors, including Meta Ads, Gmail, Google Drive and Shopify, and anyone holding its token can start a session with those grants. It has nothing to do with this audit. Review it, and delete it if it isn't used.
- **Scheduled task "Re-check autocut PR #1 (daily)".** Enabled and bound to another session.
- **Meta Ads connector.** Connected on the account but needs re-authorization.

## Degraded capabilities (listed, but their services are unreachable)

With the plugins present (audit session):

- **215–219 MCP servers failed** (the count varies per start): 199 `ERR_PROXY_TUNNEL` (blocked by the Trusted network policy), 6 `ENOENT` (command not installed), and the rest timeouts, closed connections, refused connections or 2 `INVALID_CONFIG`.
- **3 servers need OAuth:** Datadog, BigQuery, GitLab.
- **1,111 skills** in 131 network-blocked plugins load but can't reach their service.
- **`claude-tab-fix`'s hook fails on every Bash and Write call** (binary missing).
- **`aws-startup-advisor`'s SessionStart hook reads a file its plugin doesn't ship.**
- **Cognee recall has been "server unreachable" all session**, with 500+ items buffered and never saved.

## PR #2 verification

| Check | Result |
|---|---|
| Location | all 282 definitions and `LICENSE.agency-agents` directly under `.claude/agents/`. The PR's second commit adds the audit files listed below |
| Parsing | 282/282 YAML frontmatter mappings with non-empty `name` and `description` (PyYAML 6.0.1) |
| Unique names | 282 distinct, case-insensitive. No collision with built-in agents |
| Secrets | none. Four scanner hits are teaching examples: a 20-character fake `sk-proj-…` key in a bad-practice sample, and private-key header lines with no key material in detection rules |
| Discovery | the probe loaded all 282 automatically and launched `Reality Checker` with no install step |
| Local dependencies | **dangling; see below** |

**Dangling dependencies.** Three independent reviewers read all 282 definitions in full and checked every operational reference against this repository, the upstream repository and the session. Each item below was then re-checked by direct search:

- **Missing scripts (10):**
  - `./qa-playwright-capture.sh`: `testing-evidence-collector.md:44`, `testing-reality-checker.md:63`, `project-manager-senior.md:97`
  - `generate-slides.sh`, `generate_image.py`, `publish-carousel.sh`, `check-analytics.sh`, `analyze-web.js`, `learn-from-analytics.js`: `marketing-carousel-growth-engine.md`
  - `bin/orgscript.js`: `engineering-orgscript-engineer.md`
- **Missing files and folders (24):** `ai/agents/*.md`, `ai/memory-bank/*`, `ai/system/*` (6 agents, including Senior Project Manager, Evidence Collector, Senior Developer and UX Architect), `security/17-security-pattern.md`, the orchestrator's `project-specs/` and `project-tasks/`, and others.
- **Agent names that don't exist (34):** mostly the orchestrator handing off by file name (`testing-reality-checker`, `project-manager-senior`, `EvidenceQA`, `ArchitectUX`, `RealityIntegration`, …) instead of the real name (`Reality Checker`, `Senior Project Manager`, …), plus invented roles ("Contracts Agent", "HR Agent", "Security Engineer").
- **Tools or MCP servers not available (19):** for example Google Ads MCP (7 paid-media agents), a payments adapter, and Python libraries that aren't installed.
- **Command-line tools not installed (31):** for example `lighthouse`, `drush`, `forge`, `fastlane` and `wasm-opt`. Most are expected to live in the user's own project.
- **External services (44):** these can't be checked from here.

The full list is in `manifest.json` → `agency_agent_dependency_review`. The repository doesn't patch these files, because they're unmodified upstream content.

## What was committed, and why

| Item | Why |
|---|---|
| `.claude/agents/` (PR #2) | the only verified way to make the Agency Agents survive |
| `system/capabilities/*.json` | the audited state, so a new session can compare itself and see drift |
| `system/bootstrap/README.md`, `capability_audit.py` | how a new session answers the bootstrap questions; verified to run in the fresh probe session |
| `.gitignore`: `.claude/odoo-timesheet/` | keeps a plugin's per-session config, which has credential fields, out of every clone |

**Deliberately not committed:**

- **Plugin implementation files.** Only name, version, marketplace and homepage are recorded.
- **Plugin directory IDs.** These might identify this account's installs.
- **Credentials and auth state.** No values or tokens; this includes `~/.claude.json`, `.npmrc`, `.aws`, `.boto` and `.cognee/.env`.
- **Account and organization IDs.** These are redacted.
- **MCP URL paths and headers.** Only scheme and host are recorded.
- **Cognee memory contents.**

## Decisions for the account owner

1. **Merge PR #2.** Until then, `main` has no Agency Agents.
2. **Plugins:** confirm from a fresh session opened in the Claude app (run `python3 system/bootstrap/capability_audit.py`) whether the ~342 plugins arrive. If they don't, the 2,459 plugin skills and 226 plugin agents aren't part of the persistent capability set.
3. **The "Install verbalized-sampling" scheduled task:** review and probably delete it (standing token, 11 connector grants).
4. **Memory:** Cognee is local-only and, in practice, never saved this session. Pick a durable memory: committed decision logs in the repository, a hosted store, or nothing. Don't treat it as authoritative.
5. **Network policy:** keep **Trusted** and accept 131 degraded plugins, or allow specific hosts (`manifest.json` → `blocked_hosts`).
6. **Credentials and sign-ins:** Datadog, BigQuery, GitLab and Meta Ads need OAuth. Keyed services need network secrets, never committed.
7. **Plugin hygiene:** about 342 plugins add context cost to every turn and run hooks as you, and their versions change without review: `carta-crm` and `carta-cap-table` upgraded themselves mid-audit. Disable what you don't use, especially `claude-tab-fix`, whose hook fails on every call.
