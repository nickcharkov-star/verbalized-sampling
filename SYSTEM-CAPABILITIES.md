# System capabilities and persistence

What Claude Code can use when it works on this repository in a cloud session, where each capability comes from, and what survives when the cloud VM is destroyed.

- Audited: 2026-10-20, Claude Code 2.1.304, Anthropic-hosted cloud environment "Default" (network access **Trusted**).
- Machine-readable record: [`system/capabilities/`](system/capabilities/) (`manifest.json`, `plugins.json`, `skills.json`, `agents.json`).
- How a new session re-checks all of this: [`system/bootstrap/README.md`](system/bootstrap/README.md).
- Regenerate or compare: `python3 system/bootstrap/capability_audit.py [--write]`.

**Being listed is not proof that something works.** Each record keeps these fields separate:

| Field | Meaning |
|---|---|
| `available` | the harness listed it in the audited session |
| `functional` | `true` only when verified working; `false` when a hard blocker was found; `null` when not determined |
| `verified` | something actually ran it in the audited session and got a real result |
| `blocked` | `true`/`false` when known; `null` when its plugin's services are down but it isn't known whether this item needs them |
| `dependency_status` | `none`, `satisfied`, `unknown`, or `unavailable:`/`partially_unavailable:` plus the causes (`network_blocked`, `missing_binary`, `needs_auth`, `needs_credentials`, `needs_config`, `connection_failed`) |

## If this VM were deleted now and the repository opened in a clean cloud session

The new session clones **`main`**, has the same claude.ai account, and uses the same "Default" environment.

**Kept (restored automatically, nothing to do):**

- **All 2,495 skills:** 2,459 plugin skills, 19 account skills, 16 Claude Code built-ins and 1 cloud-image skill. None of them lives in this repository or on this VM alone; they're re-synced from the account or ship with the platform. `workflow-authoring` comes back only while the Workflow/ultracode setting is on.
- **232 of the 514 agents:** 226 plugin agents (re-synced with their plugins) and 6 built-ins.
- **All 343 synced plugins** (339 distinct names; 4 are synced twice from two marketplaces), with their hooks and MCP definitions.
- **Connected claude.ai connectors:** Gmail, Google Calendar, Google Drive, Canva, Lovable, Shopify, Splice, Spotify, Vercel, Zapier, Claude Docs, Courtroom5, Granted. The platform's `github` and `claude-code-remote` servers also come back.
- **The environment itself:** network level, setup script and environment variables.
- **The conversation history of this session**, if this same session is reopened. A brand-new session starts empty.

**Lost:**

- **The 282 Agency Agents, while PR #2 is unmerged.** They live in `~/.claude/agents/` on this VM and in `.claude/agents/` on the `claude/add-agency-agents` branch only. A session that clones `main` loads none of them. After the merge, they come back automatically (REPOSITORY-PERSISTENT).
- **All Cognee "long-term memory".** The memory plugin keeps its database on this VM (`~/.cognee`, `~/.cognee-plugin`, local server `http://localhost:8011`, currently not responding, with 60+ items awaiting replay). Nothing in it survives. The plugin reinstalls; the memories don't.
- **Plugin runtime state:** `~/.claude/plugins/data/*` (59 plugin folders, and growing as plugins run), `~/.delimit` (122 MB), `~/.lbdb`, and plugin caches.
- **Session-bound work:** the PR #2 activity subscription, the pending 08:42 UTC check-in, Workflow runs, and in-session installs.
- **Local-only git state:** the earlier `.git/info/exclude` rule. It is replaced by a committed `.gitignore` entry in this change.

**Restored but still not working (degraded the same way as now):**

- **200 MCP servers in 132 plugins blocked by the Trusted network policy** (`ERR_PROXY_TUNNEL`). The 1,115 skills and many of the 53 agents in those plugins load but can't reach their service.
- **6 servers whose command isn't installed** (`adb-mcp`, `toolbox`, `vulca-mcp`, and three that need Windows `cmd`), **9 that fail to connect**, **2 missing required settings**, and **3 waiting for OAuth sign-in** (Datadog, BigQuery, GitLab).
- **`claude-tab-fix`'s hook fails on every Bash/Write call** (binary not installed), and **`aws-startup-advisor`'s SessionStart hook reads a file its plugin doesn't ship**.

## Capability sources and classification

| # | Source | Count (audited session) | Class | Evidence |
|---|---|---|---|---|
| 1 | Repository `.claude/agents/` (Agency Agents, PR #2) | 282 | REPOSITORY-PERSISTENT, on branch `claude/add-agency-agents` until merged | Docs: "Your repo's `.claude/skills/`, `.claude/agents/`, `.claude/commands/` — Yes — Part of the clone" |
| 2 | Repository `system/`, `SYSTEM-CAPABILITIES.md`, `.gitignore` | this change | REPOSITORY-PERSISTENT after merge | part of the clone |
| 3 | Repository `CLAUDE.md`, `.claude/settings.json`, `.mcp.json`, `.claude/skills/`, `.claude/rules/` | none exist | n/a | nothing committed; nothing to restore |
| 4 | Account-synced plugins (`~/.claude/plugins/synced/<account>/`) | 343 (295 anthropic-plugin-directory, 48 knowledge-work-plugins) | ACCOUNT/PLUGIN-PERSISTENT | `*.meta.json` carries a directory plugin ID and `installation_preference`; synced at session start (07:04) before any action |
| 5 | Plugin skills | 2,459 | ACCOUNT/PLUGIN-PERSISTENT | come with #4 |
| 6 | Plugin agents | 226 (from 52 plugin names) | ACCOUNT/PLUGIN-PERSISTENT | come with #4 |
| 7 | Plugin hooks (SessionStart, PreToolUse, Stop, …) | 93 hook events in plugin manifests | ACCOUNT/PLUGIN-PERSISTENT | come with #4 |
| 8 | Plugin MCP server definitions | 359 (327 http, 27 stdio, 5 streamable-http) | ACCOUNT/PLUGIN-PERSISTENT (definitions); connection result SESSION-ONLY | come with #4; connection status is decided again each session |
| 9 | claude.ai account skills (`anthropic-skills:*`) | 19 | ACCOUNT/PLUGIN-PERSISTENT | Docs: "Cloud sessions automatically load skills you enable on claude.ai" |
| 10 | Claude Code built-in skills | 16 | ACCOUNT/PLUGIN-PERSISTENT (platform) | ship with Claude Code; the five-class scheme has no "platform" class, so they're filed here as restored by the service, not the repository |
| 11 | Claude Code built-in agents | 6 | ACCOUNT/PLUGIN-PERSISTENT (platform) | same as #10 |
| 12 | Cloud-image skill `session-start-hook` | 1 | ACCOUNT/PLUGIN-PERSISTENT (platform) | file dated 07:03:59, before the session started at 07:04:18 |
| 13 | Platform hook scripts in `~/.claude/` (`stop-hook-git-check.sh`, `stop-hook-reply-gate.py`, `user-prompt-submit-reply-reminder.py`) | 3 | ACCOUNT/PLUGIN-PERSISTENT (platform) | provisioned by the cloud platform; not created by any action in this session |
| 14 | claude.ai connectors | 13 connected | ACCOUNT/PLUGIN-PERSISTENT | Docs: connector traffic goes through Anthropic's servers; connectors are read when a session starts |
| 15 | Platform MCP servers `github`, `claude-code-remote` | 2 | ACCOUNT/PLUGIN-PERSISTENT (platform) | both verified working this session |
| 16 | Cloud environment (network level, setup script, env vars, network secrets) | 1 environment | ACCOUNT/PLUGIN-PERSISTENT; setup-script contents UNKNOWN | Docs: the environment is "the saved configuration"; its contents can't be read from inside a session |
| 17 | User-scope agents `~/.claude/agents/` (Agency Agents copy) | 282 | MACHINE-PERSISTENT ONLY | Docs: "Your user `~/.claude/…/agents/` — No — Live on your machine" |
| 18 | Cognee memory database and local server | 1 store | MACHINE-PERSISTENT ONLY | `~/.cognee-plugin/server-ready.json`: base URL `http://localhost:8011`, state `not_responding` |
| 19 | Plugin runtime data (`~/.claude/plugins/data/*`, `~/.delimit`, `~/.lbdb`, caches) | 59 + 2 dirs | MACHINE-PERSISTENT ONLY | written after the session started |
| 20 | Files plugins write into the working tree (`.claude/odoo-timesheet/config.json`) | 1 | MACHINE-PERSISTENT ONLY, recreated by the plugin each session | now ignored by the committed `.gitignore` |
| 21 | Local git config (`.git/info/exclude`) | 1 rule (removed) | MACHINE-PERSISTENT ONLY | not part of a clone |
| 22 | MCP connection results, loaded tool list | per session | SESSION-ONLY | decided at session start |
| 23 | PR #2 subscription, scheduled check-in, Workflow runs | 3 | SESSION-ONLY | bound to this session's ID |
| 24 | `~/.claude/settings.json` `statusLine` | 1 | MACHINE-PERSISTENT ONLY, rewritten automatically | written by the cognee plugin's SessionStart hook |

## What was committed, and why

| Item | Why |
|---|---|
| `.claude/agents/` (PR #2) | the only way to make the Agency Agents survive: the docs say user-scope agents don't carry over |
| `system/capabilities/*.json` | the audited state: what loaded, which plugin each skill and agent depends on, and dependency status. A new session compares itself against it |
| `system/bootstrap/README.md`, `system/bootstrap/capability_audit.py` | how a new session answers the eight bootstrap questions, plus a read-only script that does it |
| `.gitignore`: `.claude/odoo-timesheet/` | keeps a plugin's per-session config, which has credential fields, out of commits in every clone |

**Deliberately not committed:**

- **Plugin implementation files.** Plugins are recorded by name, version, marketplace and homepage; the account restores them.
- **Plugin directory IDs.** These might identify this account's installs rather than catalog entries.
- **Credentials and auth state.** No values or tokens were written; this includes `~/.claude.json`, `.npmrc`, `.aws`, `.boto` and `.cognee/.env`.
- **Account and organization IDs.** These are redacted to `<account>`.
- **MCP URL paths and headers.** Only scheme and host are recorded.
- **Cognee memory contents.**

## PR #2 verification

Checked against `origin/claude/add-agency-agents` at commit `9fedd81`:

| Check | Result |
|---|---|
| Location | all 283 added paths are directly under `.claude/agents/` (282 `.md` and `LICENSE.agency-agents`). Nothing outside it, nothing nested |
| Parsing | all 282 frontmatter blocks parse as YAML mappings (PyYAML 6.0.1), each with non-empty `name` and `description` and a non-trivial body |
| Unique names | 282 distinct `name` values, case-insensitive. None collides with a built-in agent name; plugin agents are namespaced `plugin:agent` |
| `tools:` fields | 17 agents restrict tools, all to real tool names (`Read`, `Write`, `Edit`, `Bash`, `WebFetch`, `WebSearch`) |
| Secrets | no real credentials. Four scanner hits are teaching examples: a 20-character fake `sk-proj-…` key in a "what not to do" code sample (`security-ai-generated-code-auditor.md:72`), and three `-----BEGIN … PRIVATE KEY-----` header lines with no key material, used as detection-rule patterns (`security-senior-secops.md:46-48`) |
| Local dependencies | **one dangling dependency:** `./qa-playwright-capture.sh` is called as an operational step by `testing-evidence-collector.md:44`, `testing-reality-checker.md:63` and `project-manager-senior.md:97`, but exists neither in this repository nor in the upstream repository. Other path-like references are illustrative code for the user's own project. Four agents declare external `services` in frontmatter (UIZZE, Gemini/TikTok/Instagram APIs, Wechatsync/xiaohongshu-mcp/biliup, Xquik); these are external accounts, not local files. See the semantic review below |

<!-- DEPENDENCY-REVIEW -->

## Verified, not just listed

| Capability | Verified how |
|---|---|
| `github` MCP | created PR #2, read its state, checks and comments, listed Actions runs |
| `claude-code-remote` MCP | read platform docs, read the session and environment, scheduled a check-in, subscribed to PR #2 |
| `workflow-authoring` skill | loaded by command |
| `aspiration-self-monitoring` skill | injected by its hook every turn |

<!-- SMOKE-TESTS -->

Every other skill, agent and connector is `available` but `verified: false`. None of the 13 connected claude.ai connectors was called in this session.

## Decisions for the account owner

1. **Merge PR #2.** This is the single change that keeps the 282 Agency Agents.
2. **Network policy:** keep **Trusted** and accept 132 degraded plugins, or switch to **Custom** and allow the specific hosts you want (`manifest.json` → `blocked_hosts` has all 180). Every host you allow is outbound access for every session in the environment.
3. **Sign-ins and credentials:** Datadog, BigQuery and GitLab need OAuth. TwelveLabs, Azure DevOps, CockroachDB, AlloyDB and others need keys, which go in as network secrets, never in the repository.
4. **Memory:** Cognee's store is lost with each VM. Options: point it at a hosted Cognee instance (needs its host allowed and a credential), back it up from a setup script, or treat it as per-session scratch.
5. **Noise:** consider disabling `claude-tab-fix` on claude.ai (its hook fails on every Bash call here), and plugins you don't use.
6. **Upstream issue:** `qa-playwright-capture.sh` is missing from the Agency Agents project. Report it upstream, or drop those steps when using the three agents.
