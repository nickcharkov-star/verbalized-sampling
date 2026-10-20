# Bootstrap: checking capabilities in a fresh cloud session

This folder tells a brand-new Claude Code cloud session on this repository how to find out what it can actually do. Being listed is not the same as working: a skill or agent can load while the service it depends on is unreachable. The record from the last audit lives in [`../capabilities/`](../capabilities/), and the overview is in [`/SYSTEM-CAPABILITIES.md`](../../SYSTEM-CAPABILITIES.md).

## Run this first

```bash
python3 system/bootstrap/capability_audit.py
```

This only reads. It compares the current session with `system/capabilities/manifest.json` and prints:

- how many skills, agents and plugins loaded, and which ones are missing compared with the manifest
- which MCP servers failed to connect, grouped by error code
- which MCP servers are waiting for sign-in
- which binaries that plugins expect are missing from `PATH`
- which plugin hooks failed in this session
- whether every agent definition in `.claude/agents/` still parses
- whether any committed capability file or doc matches an identifier or credential pattern

It exits **0** when the session matches the manifest and **1** when skills or agents are missing, a definition is broken, or a doc leaks, so it can gate a script or CI step. In a session without the account's plugins it exits 1 by design, because the manifest records the full inventory.

## Then check the operating baseline

```bash
python3 system/bootstrap/capability_audit.py --baseline
```

This checks only what research and validation rely on ([`../baseline/BASELINE.md`](../baseline/BASELINE.md)):

- the eight baseline agents: each file's SHA-256, its frontmatter, and its presence in the session
- the built-in agents and web tools
- `python3` and `git`
- the committed settings: the output-rewriting switch, also checked in the live process environment, and the required deny rules
- the pinned analysis environment, when restored, and whether the research hosts are reachable
- the hash chains in `system/governance/`
- leak patterns in the committed docs

It needs no plugins and exits 0 when the baseline holds, including in a session where no plugins arrived. It reports limitations, such as the analysis environment not yet restored or research hosts blocked by the network policy, without failing; `--strict` makes them fail too. To confirm the deny rules are live, run `echo vs-deny-canary`: Claude Code must refuse it. It does so in subagents too.

To refresh the recorded state after a deliberate change, run it with `--write` and commit the regenerated files. Two guards protect the record:

- **Shrink guard:** it refuses to write (exit 2) when skills, agents or plugins would drop by more than half. That's what happens in a session that didn't receive the synced plugins. Pass `--force` only when the loss is intended.
- **Leak guard:** it refuses to write anything if the output would contain an account directory ID, a UUID, an email address, a session/trigger/environment ID, or a common credential shape.

It never writes credential values, environment-variable values, MCP URL paths or headers, or plugin implementation files. The leak guard is pattern-based, so still read the diff before committing.

The script reads the session transcript under `~/.claude/projects/`. That file format belongs to Claude Code and can change. If the script warns that it found no skill listing, use the manual checks below.

## How a fresh session answers each question

### Which agents are available

There are three sources, and the session's agent list (the Agent tool's description) merges them:

| Source | Where it comes from | How to check |
|---|---|---|
| Built-in agents (6) | Claude Code itself | always present: `general-purpose`, `Explore`, `Plan`, `claude`, `claude-code-guide`, `statusline-setup` |
| Plugin agents (226 last audit) | plugins synced from the claude.ai account | names look like `plugin:agent`. Count them from the script, or `grep -c` the agent list |
| Repository agents (282 Agency Agents) | `.claude/agents/*.md` in the checked-out branch | `ls .claude/agents/*.md \| wc -l`. **Zero on `main` until PR #2 is merged.** |

An agent is available when it appears in the list. It is verified only after one has run. To smoke-test one, launch it with a trivial prompt such as "Reply READY", for example the `Reality Checker` agent.

### Which skills are available

| Source | Where it comes from | How to check |
|---|---|---|
| Claude Code built-in skills (16) | Claude Code itself | in the skill list with no `plugin:` prefix. `workflow-authoring` only appears while the Workflow/ultracode setting is on |
| Cloud-image skill (1) | the VM image: `~/.claude/skills/session-start-hook` | `ls ~/.claude/skills/session-start-hook` |
| claude.ai account skills (19) | skills enabled on claude.ai, synced to `~/.claude/skills/synced/<account>/` | listed as `anthropic-skills:*` |
| Plugin skills (2,459 last audit) | plugins synced from the account | listed as `plugin:skill` |
| Repository skills (0) | `.claude/skills/` in the repo | `ls .claude/skills 2>/dev/null` |

### Which plugins are installed

Plugins are not installed from this repository; when they arrive at all, they come from the claude.ai account at session start. The repository's `.claude/settings.json` can only switch a synced plugin off: it sets `agentone-token-compression@synced` to `false`. That took effect in the audit session at the next worker start (the plugin's tools disappeared at 19:05 UTC and didn't come back). A plugin the organization marks as required would ignore it. In the 2026-10-20 audit, the session started from the Claude app received 343 plugins; a fresh session created through the API received **none** (see `manifest.json` → `cold_start_probe`). Always check:

```bash
ls ~/.claude/plugins/synced/*/*.meta.json | wc -l      # plugin count
python3 -c 'import json,glob; [print(json.load(open(f)).get("name")) for f in glob.glob("/root/.claude/plugins/synced/*/*/.claude-plugin/plugin.json")]' | sort
```

`system/capabilities/plugins.json` records each plugin's name, version, marketplace, homepage, components, MCP servers (transport and host only) and dependency status as of the last audit.

### Which dependencies are missing

- **Binaries:** the script lists binaries that plugin hooks or MCP servers call but that aren't on `PATH`. In the last audit these were `adb-mcp`, `claude-tab-fix`, `cmd` (Windows-only), `toolbox` and `vulca-mcp`.
- **Credentials:** `plugins.json` lists the environment-variable names each MCP server expects in `required_env_names` (names only, never values).
- **Plugin settings:** `requires_user_config` lists settings with no default. Cloud sessions can't run `/plugin`, so these can't be filled in from a cloud session.
- **Dangling references inside agents:** 10 missing scripts (including `./qa-playwright-capture.sh` in three agents), 24 missing files and folders, 34 agent names that don't exist, and 19 unavailable tools. The full list is in `manifest.json` → `agency_agent_dependency_review`.

### Which external services are unavailable

MCP connection results are recorded per server. The script prints the current failures. Error codes:

| Code | Meaning | Fix |
|---|---|---|
| `ERR_PROXY_TUNNEL` | the environment's network policy (**Trusted**) blocked the host | an owner adds the host under Network access → Custom → Allowed domains (`manifest.json` → `blocked_hosts`) |
| `ENOENT` | the stdio server's command isn't installed | add an install step to the environment setup script, or accept as unavailable (Windows `cmd`) |
| `INVALID_CONFIG` | a required plugin setting is unset | set it from a local Claude Code (`/plugin`); not possible from a cloud session |
| `CONNECTION_CLOSED`, `CONNECT_TIMEOUT`, `ECONNREFUSED` | the server started but didn't complete the handshake, or expects a local service (`localhost`) that isn't running | case by case; see `plugins.json` |
| needs auth | an OAuth sign-in is required | the account owner signs in. Claude can't start OAuth from a session |

claude.ai connectors route through Anthropic's servers, so the network policy doesn't affect them. Their names are deliberately not recorded in this public repository; list them at https://claude.ai/customize/connectors.

### Which capabilities have degraded

A capability counts as degraded when it is still listed but its plugin's `dependency_status` starts with `unavailable` or `partially_unavailable`, or when the check reports it missing compared with the manifest. In `skills.json` and `agents.json`, `blocked: null` means its plugin's services are down, but it isn't known whether this particular skill or agent needs them. `blocked: false` means no unmet dependency was found.

### Which capabilities restore automatically

These come back in any new cloud session for the same account, with nothing to do. Items marked *(probe)* were observed in the fresh-session probe; the others come from the platform docs or this session's logs:

- Claude Code built-in skills (15, plus `workflow-authoring` while Workflow/ultracode is on) and the 6 built-in agents *(probe)*
- the cloud-image skill *(probe)* and the platform's Stop git-check hook (two more platform hook scripts are written but not wired)
- the 19 claude.ai account skills *(probe)*
- claude.ai connectors that are already connected on the account (11 observed *(probe)*; others may need re-authorization)
- the environment's settings (network level, environment variables; there is no setup script)
- everything committed to the branch the session clones: `.claude/agents/` (after PR #2 merges) *(probe)*, `system/`, `.gitignore`

**Not guaranteed:** the account-synced plugins (~342, and the set changes between sessions) and everything they bring (2,459 skills, 226 agents, hooks, MCP servers). They were present in the app-started audit session and absent in the API-created probe. When they are present, their stdio MCP servers launched with `npx`/`uvx` re-download from registries that **Trusted** allows.

**Never restored:** anything only on the VM, including `~/.claude/agents/`, the Cognee memory store and plugin data.

### Which capabilities need founder authorization

These need the account owner. Claude must not do them on its own:

1. **Mark PR #2 ready and merge it** so `main` carries `.claude/agents/`. Until then, new sessions on `main` have none of the 282 Agency Agents.
2. **Widen network access** for the 199 proxy-blocked MCP servers (Custom allowlist). This is a security decision, because it opens outbound traffic to third-party hosts.
3. **Sign in** to OAuth servers (Datadog, BigQuery, GitLab in the last audit) and to any connector that shows as needing auth.
4. **Add credentials** as network secrets or environment variables (for example `TWELVELABS_API_KEY`, `ADO_PAT`, `COCKROACHDB_*`). Never commit them, and never paste them into chat.
5. **Add an environment setup script** (none exists today) to install missing binaries (`toolbox`, `adb-mcp`, `vulca-mcp`, `claude-tab-fix`) or to back up memory.
6. **Enable or disable plugins and skills** on claude.ai. That changes what every future session loads.
7. **Decide about Cognee memory**: it currently lives only on the VM (see `SYSTEM-CAPABILITIES.md`).
8. **Review the account's scheduled tasks** at https://claude.ai/code/routines. One holds a standing API token with broad connector grants and survives every VM.
9. **Authorize any spending, outreach, publishing or deployment** with a decision record as described in `system/governance/decisions/0003-spending-and-external-action-authority.md`, then narrow the matching deny rule in a reviewed pull request. Sessions on this repository can't do these today: the runtime denies the tools.
