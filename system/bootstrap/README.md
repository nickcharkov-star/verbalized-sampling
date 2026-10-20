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

To refresh the recorded state after a deliberate change, run it with `--write` and commit the regenerated files. The script never writes credential values, environment-variable values, account or organization IDs, MCP URL paths or headers, or plugin implementation files.

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

Plugins are not installed from this repository. Cloud sessions ignore `enabledPlugins` in a repository's `.claude/settings.json`. They arrive from the claude.ai account at session start:

```bash
ls ~/.claude/plugins/synced/*/*.meta.json | wc -l      # plugin count
python3 -c 'import json,glob; [print(json.load(open(f)).get("name")) for f in glob.glob("/root/.claude/plugins/synced/*/*/.claude-plugin/plugin.json")]' | sort
```

`system/capabilities/plugins.json` records each plugin's name, version, marketplace, homepage, components, MCP servers (transport and host only) and dependency status as of the last audit.

### Which dependencies are missing

- **Binaries:** the script lists binaries that plugin hooks or MCP servers call but that aren't on `PATH`. In the last audit these were `adb-mcp`, `claude-tab-fix`, `cmd` (Windows-only), `toolbox` and `vulca-mcp`.
- **Credentials:** `plugins.json` lists the environment-variable names each MCP server expects in `required_env_names` (names only, never values).
- **Plugin settings:** `requires_user_config` lists settings with no default. Cloud sessions can't run `/plugin`, so these can't be filled in from a cloud session.
- **Dangling references inside agents:** three Agency Agents call `./qa-playwright-capture.sh`, which exists neither in this repository nor upstream (see `SYSTEM-CAPABILITIES.md`).

### Which external services are unavailable

MCP connection results are recorded per server. The script prints the current failures. Error codes:

| Code | Meaning | Fix |
|---|---|---|
| `ERR_PROXY_TUNNEL` | the environment's network policy (**Trusted**) blocked the host | an owner adds the host under Network access → Custom → Allowed domains (`manifest.json` → `blocked_hosts`) |
| `ENOENT` | the stdio server's command isn't installed | add an install step to the environment setup script, or accept as unavailable (Windows `cmd`) |
| `INVALID_CONFIG` | a required plugin setting is unset | set it from a local Claude Code (`/plugin`); not possible from a cloud session |
| `CONNECTION_CLOSED`, `CONNECT_TIMEOUT`, `ECONNREFUSED` | the server started but didn't complete the handshake, or expects a local service (`localhost`) that isn't running | case by case; see `plugins.json` |
| needs auth | an OAuth sign-in is required | the account owner signs in. Claude can't start OAuth from a session |

claude.ai connectors (Gmail, Google Calendar, Google Drive, Canva, Lovable, Shopify, Splice, Spotify, Vercel, Zapier, Claude Docs, Courtroom5, Granted) route through Anthropic's servers, so the network policy doesn't affect them.

### Which capabilities have degraded

A capability counts as degraded when it is still listed but its plugin's `dependency_status` starts with `unavailable` or `partially_unavailable`, or when the check reports it missing compared with the manifest. In `skills.json` and `agents.json`, `blocked: null` means its plugin's services are down, but it isn't known whether this particular skill or agent needs them. `blocked: false` means no unmet dependency was found.

### Which capabilities restore automatically

These come back in any new cloud session for the same account, with nothing to do:

- Claude Code built-in skills and agents
- the cloud-image skill and the platform hook scripts in `~/.claude/` (git check, reply gate)
- all account-synced plugins (343) and account skills (19), plus their SessionStart hooks
- claude.ai connectors that are already connected on the account
- the environment's settings (network level, setup script, environment variables)
- everything committed to the branch the session clones: `.claude/agents/` (after PR #2 merges), `system/`, `.gitignore`
- stdio MCP servers launched with `npx`/`uvx`, which download their package again from registries that **Trusted** allows

### Which capabilities need founder authorization

These need the account owner. Claude must not do them on its own:

1. **Merge PR #2** so `main` carries `.claude/agents/`. Until then, new sessions on `main` have none of the 282 Agency Agents.
2. **Widen network access** for the 200 proxy-blocked MCP servers (Custom allowlist). This is a security decision, because it opens outbound traffic to third-party hosts.
3. **Sign in** to OAuth servers (Datadog, BigQuery, GitLab in the last audit) and to any connector that shows as needing auth.
4. **Add credentials** as network secrets or environment variables (for example `TWELVELABS_API_KEY`, `ADO_PAT`, `COCKROACHDB_*`). Never commit them, and never paste them into chat.
5. **Edit the environment setup script** to install missing binaries (`toolbox`, `adb-mcp`, `vulca-mcp`, `claude-tab-fix`) or to back up memory.
6. **Enable or disable plugins and skills** on claude.ai. That changes what every future session loads.
7. **Decide about Cognee memory**: it currently lives only on the VM (see `SYSTEM-CAPABILITIES.md`).
