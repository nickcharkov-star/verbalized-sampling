#!/usr/bin/env python3
"""Read-only capability audit for Claude Code cloud sessions on this repository.

Two modes:

  python3 system/bootstrap/capability_audit.py          # compare this session to the manifest
  python3 system/bootstrap/capability_audit.py --write  # regenerate system/capabilities/*.json
  python3 system/bootstrap/capability_audit.py --baseline  # check only the operating baseline

Sources, in order of authority:
  1. The session transcript (~/.claude/projects/<cwd-slug>/<session>.jsonl): the exact skill,
     agent and MCP-connection lists the harness gave the model. This format is internal to
     Claude Code and may change; the script degrades to the filesystem when it can't parse it.
  2. Account-synced plugin and skill folders under ~/.claude/plugins/synced and
     ~/.claude/skills/synced (metadata only: plugin.json, .mcp.json, hooks.json, meta.json).
  3. The repository's own .claude/ directory.

Never written to the output: credential values, environment-variable values, MCP URLs beyond
scheme+host, HTTP headers, account or organization identifiers, or plugin implementation files.
"""

import argparse
import datetime
import fnmatch
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter

HOME = os.path.expanduser("~")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(REPO, "system", "capabilities")
CLAUDE = os.path.join(HOME, ".claude")

BUILTIN_AGENTS = [
    "claude",
    "claude-code-guide",
    "Explore",
    "general-purpose",
    "Plan",
    "statusline-setup",
]

PERSISTENCE = {
    "repo": "REPOSITORY-PERSISTENT",
    "account": "ACCOUNT/PLUGIN-PERSISTENT",
    "machine": "MACHINE-PERSISTENT ONLY",
    "session": "SESSION-ONLY",
    "unknown": "UNKNOWN",
}

# Capabilities this session actually exercised (verified = ran and returned a real result).
# Maintained by hand after a smoke test; nothing measures it automatically.
VERIFIED = {
    "mcp": {
        "claude-code-remote": (
            "read_documentation, get_session, list_environments, send_later and"
            " subscribe_pr_activity returned results (2026-10-20)"
        ),
        "github": (
            "create_pull_request, pull_request_read and actions_list returned results (2026-10-20)"
        ),
    },
    "skills": {
        "workflow-authoring": "loaded by /workflow-authoring (2026-10-20)",
        "aspiration-self-monitoring:aspiration-self-monitoring": (
            "injected by its SessionStart hook (2026-10-20)"
        ),
    },
    "agents": {
        "Reality Checker": (
            "launched and replied READY here and in a fresh probe session on the PR #2 tree"
            " (2026-10-20)"
        ),
        "agent-protocols:code-reviewer": (
            "launched here (2026-10-20); did not exist in the fresh probe session"
        ),
        "Explore": "launched here and in the fresh probe session (2026-10-20)",
    },
}

# Observed 2026-10-20: this session, started from the Claude app, received 343 synced plugins at
# boot; a fresh session created through the API on the same account and environment received
# none. The docs describe plugin sync for terminal and Cowork sessions, not cloud sessions.
PLUGIN_RESTORE = (
    "conditional: synced from the claude.ai account into the app-started audit session, but"
    " absent from an API-created fresh session; not documented for cloud sessions"
)


def _load_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _host(url):
    m = re.match(r"^([a-z][a-z0-9+.-]*)://([^/?#]+)", str(url), re.I)
    if not m:
        return None
    host = m.group(2).split("@")[-1]
    return f"{m.group(1).lower()}://{host.lower()}"


def _redact(text):
    """Remove account/org identifiers from any string we might emit."""
    text = re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9a-f-]{36}",
        "<account>",
        str(text),
    )
    return text


# --------------------------------------------------------------------------- transcript


def latest_transcript():
    slug = "-" + REPO.strip("/").replace("/", "-")
    candidates = glob.glob(os.path.join(CLAUDE, "projects", slug, "*.jsonl"))
    if not candidates:
        candidates = glob.glob(os.path.join(CLAUDE, "projects", "*", "*.jsonl"))
    return max(candidates, key=os.path.getmtime) if candidates else None


def read_transcript(path):
    state = {
        "skills": [],
        "agents_added": [],
        "agents_removed": [],
        "builtin_agents": [],
        "failed_mcp": {},
        "needs_auth_mcp": [],
        "pending_mcp": [],
        "tool_names": set(),
        "hook_errors": Counter(),
        "mcp_snapshot_at": None,
        "parsed": False,
    }
    if not path:
        return state
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            att = rec.get("attachment")
            if not isinstance(att, dict):
                continue
            kind = att.get("type")
            if kind == "skill_listing":
                state["skills"].extend(att.get("names") or [])
                state["parsed"] = True
            elif kind == "agent_listing_delta":
                state["agents_added"].extend(att.get("addedTypes") or [])
                state["agents_removed"].extend(att.get("removedTypes") or [])
                state["builtin_agents"].extend(att.get("builtInTypes") or [])
            elif kind == "deferred_tools_delta":
                for key in ("addedNames", "readdedNames"):
                    state["tool_names"].update(att.get(key) or [])
                if "failedMcpServers" in att:
                    state["failed_mcp"] = {
                        s["name"]: s.get("errorCode") or s.get("error")
                        for s in att.get("failedMcpServers") or []
                    }
                    state["needs_auth_mcp"] = list(att.get("needsAuthMcpServers") or [])
                    state["pending_mcp"] = list(att.get("pendingMcpServers") or [])
                    state["mcp_snapshot_at"] = rec.get("timestamp")
            elif kind == "hook_non_blocking_error":
                msg = str(att.get("stderr") or att.get("error") or att.get("content") or "")
                state["hook_errors"][(att.get("hookName"), _redact(msg)[:200])] += 1
    removed = set(state["agents_removed"])
    state["agents"] = [a for a in dict.fromkeys(state["agents_added"]) if a not in removed]
    state["skills"] = list(dict.fromkeys(state["skills"]))
    return state


# --------------------------------------------------------------------------- filesystem


def synced_root(kind):
    roots = [p for p in glob.glob(os.path.join(CLAUDE, kind, "synced", "*")) if os.path.isdir(p)]
    return roots[0] if roots else None


def mcp_servers_for(plugin_dir, manifest):
    servers = {}
    sources = []
    root_mcp = os.path.join(plugin_dir, ".mcp.json")
    if os.path.exists(root_mcp):
        sources.append(_load_json(root_mcp))
    inline = manifest.get("mcpServers") if isinstance(manifest, dict) else None
    if isinstance(inline, dict):
        sources.append({"mcpServers": inline})
    elif isinstance(inline, str):
        sources.append(_load_json(os.path.join(plugin_dir, inline)))
    for src in sources:
        if not isinstance(src, dict):
            continue
        table = src.get("mcpServers", src)
        for name, spec in table.items():
            if not isinstance(spec, dict):
                continue
            transport = spec.get("type") or (
                "stdio" if "command" in spec else "http" if "url" in spec else "unknown"
            )
            entry = {"name": name, "transport": transport}
            if transport == "stdio":
                cmd = str(spec.get("command", ""))
                entry["command"] = (
                    os.path.basename(cmd) if cmd.startswith("/") or "${" in cmd else cmd
                )
                launcher = entry["command"] in ("npx", "uvx", "pipx", "bunx", "docker")
                entry["launcher_downloads_package"] = launcher
            else:
                entry["host"] = _host(spec.get("url"))
                entry["has_headers"] = bool(spec.get("headers"))
            # Only names the user must supply count: ${VAR} placeholders and empty env values.
            # Env keys the plugin sets to a literal value are configuration, not a dependency.
            env = spec.get("env") or {}
            empty = {k for k, v in env.items() if v in ("", None)}
            refs = set(re.findall(r"\$\{([A-Za-z0-9_]+)(?::-[^}]*)?\}", json.dumps(spec)))
            refs -= {"CLAUDE_PLUGIN_ROOT", "CLAUDE_PLUGIN_DATA", "CLAUDE_PROJECT_DIR"}
            entry["required_env_names"] = sorted(empty | refs)
            entry["uses_user_config"] = "${user_config." in json.dumps(spec)
            servers[name] = entry
    return list(servers.values())


def hook_events_for(plugin_dir, manifest):
    events = Counter()
    sources = [os.path.join(plugin_dir, "hooks", "hooks.json")]
    if isinstance(manifest, dict) and isinstance(manifest.get("hooks"), str):
        sources.append(os.path.join(plugin_dir, manifest["hooks"]))
    blobs = [_load_json(p) for p in sources if os.path.exists(p)]
    if isinstance(manifest, dict) and isinstance(manifest.get("hooks"), dict):
        blobs.append({"hooks": manifest["hooks"]})
    commands = set()
    for blob in blobs:
        if not isinstance(blob, dict):
            continue
        for event, groups in (blob.get("hooks") or {}).items():
            events[event] += 1
            for group in groups or []:
                for hook in (group or {}).get("hooks", []) if isinstance(group, dict) else []:
                    cmd = str(hook.get("command", "")).strip()
                    first = cmd.split()[0] if cmd else ""
                    if first and "/" not in first and "$" not in first:
                        commands.add(first)
    return dict(events), sorted(commands)


def _name_plugin_dirs(text):
    """Replace synced plugin directory paths in a message with the plugin's name."""

    def repl(match):
        manifest = (
            _load_json(
                os.path.join(
                    synced_root("plugins") or "", match.group(1), ".claude-plugin", "plugin.json"
                )
            )
            or {}
        )
        return f"<plugin {manifest.get('name', 'unknown')}>"

    return re.sub(r"/root/\.claude/plugins/synced/<account>/([0-9a-f-]{36}|[\w.-]+)", repl, text)


def count_files(plugin_dir, sub, pattern):
    return len(glob.glob(os.path.join(plugin_dir, sub, pattern), recursive=True))


def scan_plugins():
    root = synced_root("plugins")
    plugins = []
    if not root:
        return plugins
    for meta_path in sorted(glob.glob(os.path.join(root, "*.meta.json"))):
        pdir = meta_path[: -len(".meta.json")]
        meta = _load_json(meta_path) or {}
        manifest = _load_json(os.path.join(pdir, ".claude-plugin", "plugin.json")) or {}
        name = manifest.get("name") or os.path.basename(pdir)
        events, hook_cmds = hook_events_for(pdir, manifest)
        author = manifest.get("author")
        plugins.append(
            {
                "name": name,
                "display_name": manifest.get("displayName"),
                "version": manifest.get("version"),
                "description": (manifest.get("description") or "")[:300],
                "author": author.get("name") if isinstance(author, dict) else author,
                "homepage": manifest.get("homepage"),
                "repository": manifest.get("repository")
                if isinstance(manifest.get("repository"), str)
                else None,
                "license": manifest.get("license"),
                # server_plugin_id is left out: it may identify this account's install.
                "marketplace": meta.get("marketplace_name"),
                "installation_preference": meta.get("installation_preference"),
                # Settings without a default must be filled in; ones with defaults are optional.
                "requires_user_config": sorted(
                    k
                    for k, v in (manifest.get("userConfig") or {}).items()
                    if isinstance(v, dict)
                    and "default" not in v
                    and v.get("required", True) is not False
                )
                if isinstance(manifest.get("userConfig"), dict)
                else [],
                "components_on_disk": {
                    "skills": count_files(pdir, "skills", "**/SKILL.md"),
                    "agents": count_files(pdir, "agents", "**/*.md"),
                    "commands": count_files(pdir, "commands", "**/*.md"),
                    "hook_events": events,
                    "hook_commands_on_path": hook_cmds,
                },
                "mcp_servers": mcp_servers_for(pdir, manifest),
            }
        )
    return plugins


def scan_account_skills():
    root = synced_root("skills")
    if not root:
        return []
    return sorted(
        os.path.basename(os.path.dirname(p)) for p in glob.glob(os.path.join(root, "*", "SKILL.md"))
    )


def parse_frontmatter(path):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    if not text.startswith("---\n"):
        return None, "no opening '---' line"
    end = text.find("\n---", 4)
    if end < 0:
        return None, "no closing '---' line"
    fields = {}
    for line in text[4:end].splitlines():
        if not line.strip() or line.startswith((" ", "\t", "#", "-")):
            continue
        if ":" not in line:
            return None, f"unparseable frontmatter line: {line[:60]}"
        key, _, value = line.partition(":")
        fields[key.strip()] = value.strip().strip('"').strip("'")
    if not fields.get("name"):
        return None, "missing name"
    if not fields.get("description"):
        return None, "missing description"
    return fields, None


def scan_repo_agents():
    out = []
    for path in sorted(glob.glob(os.path.join(REPO, ".claude", "agents", "*.md"))):
        fields, err = parse_frontmatter(path)
        out.append(
            {"file": os.path.relpath(path, REPO), "name": (fields or {}).get("name"), "error": err}
        )
    return out


# --------------------------------------------------------------------------- classification


def mcp_status(key, state, tool_prefix):
    if key in state["failed_mcp"]:
        return "failed:" + str(state["failed_mcp"][key])
    if key in state["needs_auth_mcp"]:
        return "needs_auth"
    if key in state["pending_mcp"]:
        return "pending"
    if any(t.startswith(tool_prefix) for t in state["tool_names"]):
        return "connected"
    return "not_observed"


def plugin_dependency_status(servers, hook_cmds, user_config):
    statuses = [s["status"] for s in servers]
    missing_cmds = [c for c in hook_cmds if shutil.which(c) is None]
    problems = []
    if any(s.startswith("failed:ERR_PROXY_TUNNEL") for s in statuses):
        problems.append("network_blocked")
    if any(s.startswith("failed:ENOENT") for s in statuses) or missing_cmds:
        problems.append("missing_binary")
    if any(s.startswith("failed:INVALID_CONFIG") for s in statuses) or user_config:
        problems.append("needs_config")
    if any(s == "needs_auth" for s in statuses):
        problems.append("needs_auth")
    if any(
        s.startswith("failed:")
        and not s.split(":", 1)[1].startswith(("ERR_PROXY_TUNNEL", "ENOENT", "INVALID_CONFIG"))
        for s in statuses
    ):
        problems.append("connection_failed")
    if any(s.get("required_env_names") for s in servers):
        problems.append("needs_credentials")
    if not servers and not missing_cmds and not user_config:
        return "none", missing_cmds
    if not problems:
        return "satisfied" if all(s == "connected" for s in statuses) else "unknown", missing_cmds
    connected = [s for s in statuses if s == "connected"]
    prefix = "partially_unavailable" if connected else "unavailable"
    return prefix + ":" + ",".join(sorted(set(problems))), missing_cmds


def build(state, transcript_path):
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()
    plugins = scan_plugins()
    by_name = {p["name"]: p for p in plugins}
    # The account can sync two copies of one plugin name (two marketplaces or versions). Loaded
    # skills and agents are keyed by name only, so their counts can't be split between the copies.
    name_counts = Counter(p["name"] for p in plugins)
    for p in plugins:
        p["shares_name_with_another_synced_plugin"] = name_counts[p["name"]] > 1
    loaded_skills = state["skills"]
    loaded_agents = state["agents"]
    skills_per_plugin = Counter(s.split(":", 1)[0] for s in loaded_skills if ":" in s)
    agents_per_plugin = Counter(a.split(":", 1)[0] for a in loaded_agents if ":" in a)
    account_skill_dirs = scan_account_skills()
    repo_agents = scan_repo_agents()
    repo_agent_names = {a["name"] for a in repo_agents if a["name"]}
    user_agent_files = glob.glob(os.path.join(CLAUDE, "agents", "*.md"))
    user_agent_names = set()
    for path in user_agent_files:
        fields, _ = parse_frontmatter(path)
        if fields:
            user_agent_names.add(fields["name"])

    # ---- plugins
    for p in plugins:
        for s in p["mcp_servers"]:
            key = f"plugin:{p['name']}:{s['name']}"
            s["status"] = mcp_status(key, state, f"mcp__plugin_{p['name']}_{s['name']}__")
            if (
                s["transport"] == "stdio"
                and s.get("command")
                and not s.get("launcher_downloads_package")
            ):
                s["binary_on_path"] = shutil.which(s["command"]) is not None
        dep, missing = plugin_dependency_status(
            p["mcp_servers"],
            p["components_on_disk"]["hook_commands_on_path"],
            p["requires_user_config"],
        )
        p["missing_hook_binaries"] = missing
        p["loaded_skills"] = skills_per_plugin.get(p["name"], 0)
        p["loaded_agents"] = agents_per_plugin.get(p["name"], 0)
        p["persistence"] = PERSISTENCE["account"]
        p["restore"] = PLUGIN_RESTORE
        p["available"] = True
        # Connected is not verified: no plugin MCP tool was called in the audited session.
        p["verified"] = False
        p["functional"] = False if dep.startswith("unavailable") else None
        p["blocked"] = dep.startswith("unavailable")
        p["dependency_status"] = dep
    plugin_summary = {
        "count": len(plugins),
        "distinct_names": len(name_counts),
        "names_synced_twice": sorted(n for n, c in name_counts.items() if c > 1),
        "by_marketplace": dict(Counter(p["marketplace"] for p in plugins)),
        "names_with_loaded_skills": len({p["name"] for p in plugins if p["loaded_skills"]}),
        "names_with_loaded_agents": len({p["name"] for p in plugins if p["loaded_agents"]}),
        "with_mcp_servers": sum(1 for p in plugins if p["mcp_servers"]),
        "by_dependency_status": dict(
            Counter(p["dependency_status"].split(":")[0] for p in plugins)
        ),
    }

    # ---- skills
    builtin_platform = {
        "session-start-hook": (
            "platform-image",
            "Provisioned into ~/.claude/skills by the cloud image before the session starts.",
        ),
    }
    skills = []
    for name in loaded_skills:
        rec = {"name": name, "available": True}
        if ":" in name:
            plugin = name.split(":", 1)[0]
            rec["source"] = "account-skill" if plugin == "anthropic-skills" else "plugin"
            rec["plugin"] = plugin
            rec["persistence"] = PERSISTENCE["account"]
            if plugin == "anthropic-skills":
                rec["restore"] = (
                    "automatic: skills enabled on claude.ai sync into every cloud session"
                )
                rec["dependency_status"] = "none"
                rec["blocked"] = False
            else:
                pl = by_name.get(plugin)
                rec["restore"] = PLUGIN_RESTORE
                dep = pl["dependency_status"] if pl else "unknown:plugin_not_found_on_disk"
                rec["dependency_status"] = ("plugin:" + dep) if dep not in ("none",) else "none"
                rec["blocked"] = (
                    None if dep.startswith(("unavailable", "partially_unavailable")) else False
                )
        else:
            src, note = builtin_platform.get(
                name,
                (
                    "claude-code-builtin",
                    "Ships with Claude Code; present in every session of a supported version.",
                ),
            )
            rec.update(
                {
                    "source": src,
                    "plugin": None,
                    "persistence": PERSISTENCE["account"],
                    "restore": "automatic: " + note,
                    "dependency_status": "none",
                    "blocked": False,
                }
            )
            if name == "workflow-authoring":
                rec["dependency_status"] = "gated:ultracode_or_workflow_setting"
                rec["restore"] = (
                    "automatic only while the Workflow/ultracode setting is on for the session"
                )
        rec["verified"] = name in VERIFIED["skills"]
        rec["verification_note"] = VERIFIED["skills"].get(name)
        rec["functional"] = True if rec["verified"] else None
        skills.append(rec)

    # ---- agents
    agents = []
    for name in loaded_agents:
        rec = {"name": name, "available": True}
        if name in BUILTIN_AGENTS:
            rec.update(
                {
                    "source": "claude-code-builtin",
                    "plugin": None,
                    "persistence": PERSISTENCE["account"],
                    "restore": "automatic: ships with Claude Code",
                    "dependency_status": "none",
                    "blocked": False,
                }
            )
        elif ":" in name:
            plugin = name.split(":", 1)[0]
            pl = by_name.get(plugin)
            dep = pl["dependency_status"] if pl else "unknown:plugin_not_found_on_disk"
            rec.update(
                {
                    "source": "plugin",
                    "plugin": plugin,
                    "persistence": PERSISTENCE["account"],
                    "restore": PLUGIN_RESTORE,
                    "dependency_status": ("plugin:" + dep) if dep != "none" else "none",
                    "blocked": None
                    if dep.startswith(("unavailable", "partially_unavailable"))
                    else False,
                }
            )
        else:
            in_repo = name in repo_agent_names
            rec.update(
                {
                    "source": "agency-agents",
                    "plugin": None,
                    "upstream": "https://github.com/msitarzewski/agency-agents",
                    "loaded_from": "~/.claude/agents (user scope, this VM)"
                    if name in user_agent_names
                    else "unknown",
                    "committed_in_repo": in_repo,
                    "persistence": PERSISTENCE["repo"] if in_repo else PERSISTENCE["machine"],
                    "restore": (
                        "automatic once .claude/agents/ is on the branch the session clones"
                        " (PR #2 must merge into main)"
                        if in_repo
                        else "lost: only in ~/.claude/agents on this VM"
                    ),
                    "dependency_status": "none",
                    "blocked": False,
                }
            )
        rec["verified"] = name in VERIFIED["agents"]
        rec["verification_note"] = VERIFIED["agents"].get(name)
        rec["functional"] = True if rec["verified"] else None
        agents.append(rec)

    # ---- connectors and platform MCP (not plugins)
    connector_servers = sorted(
        {
            t.split("__")[1]
            for t in state["tool_names"]
            if t.startswith("mcp__") and not t.split("__")[1].startswith("plugin_")
        }
    )
    platform_mcp = {"github", "claude-code-remote"}
    # This repository is public: record platform servers by name, but the account's own claude.ai
    # connectors only as a count, because their names reveal which personal services are linked.
    account_connectors = sorted(set(connector_servers) - platform_mcp)
    connectors = [
        {
            "name": name,
            "kind": "platform",
            "persistence": PERSISTENCE["account"],
            "status": "connected",
            "verified": name in VERIFIED["mcp"],
            "verification_note": VERIFIED["mcp"].get(name),
        }
        for name in sorted(platform_mcp)
    ]
    connectors.append(
        {
            "name": f"{len(account_connectors)} claude.ai connectors (names withheld)",
            "kind": "claude.ai connector",
            "persistence": PERSISTENCE["account"],
            "status": "connected",
            "verified": False,
            "verification_note": "list them at https://claude.ai/customize/connectors",
        }
    )

    manifest = {
        "schema_version": 1,
        "generated_at": now,
        "generated_by": "system/bootstrap/capability_audit.py --write",
        "source": {
            "transcript_parsed": state["parsed"],
            "transcript_file": "~/.claude/projects/<repo>/<session>.jsonl"
            if transcript_path
            else None,
            "mcp_status_snapshot_at": state["mcp_snapshot_at"],
            "note": (
                "Counts describe the session that generated this file. A different session"
                " may differ; run the check mode to compare."
            ),
        },
        "totals": {
            "skills_loaded": len(loaded_skills),
            "skills_by_source": dict(Counter(s["source"] for s in skills)),
            "agents_loaded": len(loaded_agents),
            "agents_by_source": dict(Counter(a["source"] for a in agents)),
            "plugins_synced": len(plugins),
            "account_skills_synced": len(account_skill_dirs),
            "repo_agents_committed": len(repo_agents),
            "mcp_servers_failed": len(state["failed_mcp"]),
            "mcp_servers_failed_by_error": dict(Counter(state["failed_mcp"].values())),
            "mcp_servers_needing_auth": sorted(state["needs_auth_mcp"]),
            "connectors_connected": {
                "platform": sorted(platform_mcp),
                "claude_ai_connectors": len(account_connectors),
            },
        },
        "plugins": plugin_summary,
        "hook_errors": [
            {"hook": k[0], "message": _name_plugin_dirs(k[1]), "count": v}
            for k, v in state["hook_errors"].items()
        ],
        "blocked_hosts": sorted(
            {
                s["host"]
                for p in plugins
                for s in p["mcp_servers"]
                if s.get("host") and s["status"].startswith("failed:ERR_PROXY_TUNNEL")
            }
        ),
        "connectors": connectors,
    }
    return manifest, plugins, skills, agents


# --------------------------------------------------------------------------- output


# Patterns that must never appear in committed output: account/org directory IDs, raw UUIDs,
# email addresses, session/trigger IDs and common credential shapes.
LEAK_PATTERNS = {
    "account_dir": r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9a-f-]{36}",
    "uuid": r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
    "email": r"\b[\w.+-]+@[\w-]+\.[\w.]+\b",
    "session_or_trigger_id": r"\b(session|cse|trig|env)_01[A-Za-z0-9]{10,}",
    "anthropic_key": r"\bsk-ant-[A-Za-z0-9_-]{6,}",
    "openai_key": r"\bsk-(proj-)?[A-Za-z0-9_-]{20,}",
    "github_token": r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}",
    "slack_token": r"\bxox[abposr]-[A-Za-z0-9-]{10,}",
    "google_api_key": r"\bAIza[0-9A-Za-z_-]{30,}",
    "stripe_key": r"\b(sk|rk|pk)_(live|test)_[0-9A-Za-z]{16,}",
    "private_key": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "bearer_token": r"(?i)\bbearer\s+[A-Za-z0-9._~+/-]{20,}",
    "aws_key": r"\b(AKIA|ASIA)[0-9A-Z]{16}\b",
    "jwt": r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ",
    "url_credentials": r"https?://[^/\s:@\"]+:[^/\s:@\"]+@",
    "url_secret_param": r"[?&](key|token|api_key|apikey|secret|sig|access_token)=",
}


DOCS_TO_SCAN = (
    "SYSTEM-CAPABILITIES.md",
    "system/bootstrap/README.md",
    "system/capabilities/manifest.json",
    "system/capabilities/plugins.json",
    "system/capabilities/skills.json",
    "system/capabilities/agents.json",
    "system/baseline/BASELINE.md",
    "system/baseline/baseline.json",
    "system/governance/README.md",
    ".claude/settings.json",
)
BASELINE = os.path.join(REPO, "system", "baseline", "baseline.json")
RECORDS = os.path.join(REPO, "system", "governance", "records.py")


def find_leaks(text):
    """Return the names of leak patterns present in text."""
    return sorted(name for name, pat in LEAK_PATTERNS.items() if re.search(pat, text))


def scan_docs():
    """Leak patterns found in committed docs, records and decision files, by path."""
    paths = [os.path.join(REPO, rel) for rel in DOCS_TO_SCAN]
    paths += sorted(glob.glob(os.path.join(REPO, "system", "governance", "decisions", "*.md")))
    leaks = {}
    for path in paths:
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                found = find_leaks(fh.read())
            if found:
                leaks[os.path.relpath(path, REPO)] = found
    return leaks


def shrink_reasons(manifest):
    """Explain why regenerating would drop most of the recorded capabilities, if it would."""
    recorded = (_load_json(os.path.join(OUT_DIR, "manifest.json")) or {}).get("totals", {})
    now = manifest["totals"]
    reasons = []
    for key in ("plugins_synced", "skills_loaded", "agents_loaded"):
        was, cur = recorded.get(key) or 0, now.get(key) or 0
        if was and cur < was * 0.5:
            reasons.append(f"{key} would drop from {was} to {cur}")
    return reasons


def write_outputs(manifest, plugins, skills, agents):
    os.makedirs(OUT_DIR, exist_ok=True)
    files = {
        "plugins.json": {
            "generated_at": manifest["generated_at"],
            "count": len(plugins),
            "plugins": plugins,
        },
        "skills.json": {
            "generated_at": manifest["generated_at"],
            "count": len(skills),
            "skills": skills,
        },
        "agents.json": {
            "generated_at": manifest["generated_at"],
            "count": len(agents),
            "agents": agents,
        },
    }
    # manifest.json keeps hand-written sections; merge generated data into it.
    path = os.path.join(OUT_DIR, "manifest.json")
    existing = _load_json(path) or {}
    existing.update({k: v for k, v in manifest.items()})
    texts = {
        fname: _redact(json.dumps(payload, indent=1, ensure_ascii=False))
        for fname, payload in files.items()
    }
    texts["manifest.json"] = _redact(json.dumps(existing, indent=1, ensure_ascii=False))
    # Check everything before writing anything, so a leak never reaches disk half-written.
    leaks = {fname: find_leaks(text) for fname, text in texts.items()}
    leaks = {fname: found for fname, found in leaks.items() if found}
    if leaks:
        raise SystemExit(f"refusing to write: possible identifiers or credentials {leaks}")
    for fname, text in texts.items():
        with open(os.path.join(OUT_DIR, fname), "w", encoding="utf-8") as fh:
            fh.write(text + "\n")


def check(manifest, plugins, skills, agents):
    recorded = _load_json(os.path.join(OUT_DIR, "manifest.json")) or {}
    rec_totals = recorded.get("totals", {})
    cur = manifest["totals"]
    print("Capability check against system/capabilities/manifest.json")
    print(f"  transcript parsed: {manifest['source']['transcript_parsed']}")
    for key in (
        "skills_loaded",
        "agents_loaded",
        "plugins_synced",
        "account_skills_synced",
        "repo_agents_committed",
        "mcp_servers_failed",
    ):
        was, now = rec_totals.get(key), cur.get(key)
        flag = "" if was == now else "   <-- changed"
        print(f"  {key:24} recorded={was!s:>6}  now={now!s:>6}{flag}")
    rec_agents = {
        a["name"]
        for a in (_load_json(os.path.join(OUT_DIR, "agents.json")) or {}).get("agents", [])
    }
    cur_agents = {a["name"] for a in agents}
    rec_skills = {
        s["name"]
        for s in (_load_json(os.path.join(OUT_DIR, "skills.json")) or {}).get("skills", [])
    }
    cur_skills = {s["name"] for s in skills}
    for label, was, now in (("agents", rec_agents, cur_agents), ("skills", rec_skills, cur_skills)):
        lost, gained = sorted(was - now), sorted(now - was)
        print(f"  {label}: {len(lost)} missing vs manifest, {len(gained)} new")
        for n in lost[:25]:
            print(f"    - missing: {n}")
        if len(lost) > 25:
            print(f"    ... and {len(lost) - 25} more")
    print(
        f"  MCP servers failed now: {cur['mcp_servers_failed']}",
        cur["mcp_servers_failed_by_error"],
    )
    print(f"  MCP servers needing sign-in: {', '.join(cur['mcp_servers_needing_auth']) or 'none'}")
    missing_bins = sorted(
        {b for p in plugins for b in p.get("missing_hook_binaries", [])}
        | {
            s["command"]
            for p in plugins
            for s in p["mcp_servers"]
            if s.get("binary_on_path") is False
        }
    )
    print(f"  binaries missing from PATH: {', '.join(missing_bins) or 'none'}")
    for err in manifest["hook_errors"]:
        print(f"  hook error x{err['count']}: {err['hook']}: {err['message'][:120]}")
    repo_agents = scan_repo_agents()
    bad = [a for a in repo_agents if a["error"]]
    print(f"  repo .claude/agents: {len(repo_agents)} definitions, {len(bad)} unparseable")
    leaks = scan_docs()
    print(f"  identifier/credential patterns in committed docs: {leaks or 'none'}")
    drifted = any(rec_totals.get(k) != cur.get(k) for k in ("skills_loaded", "agents_loaded"))
    missing = (rec_agents - cur_agents) or (rec_skills - cur_skills)
    # Non-zero when the session lacks recorded capabilities, a definition is broken or a doc leaks,
    # so the check can gate a script or CI step.
    status = 1 if (drifted or missing or bad or leaks) else 0
    print(f"  result: {'DRIFT OR PROBLEM FOUND' if status else 'matches the manifest'}")
    return status


def check_baseline(state, require_analysis_env=False):
    """Check the operating baseline in system/baseline/baseline.json. Plugins are not required."""
    spec = _load_json(BASELINE)
    if not spec:
        print("baseline: system/baseline/baseline.json is missing or unreadable")
        return 1
    problems = []
    parsed = state["parsed"]
    print("Operating baseline check against system/baseline/baseline.json")
    print(f"  transcript parsed: {parsed} (session lists are checked only when it is)")

    listed = set(state["agents"])
    for agent in spec["agents"]:
        path = os.path.join(REPO, agent["file"])
        if not os.path.exists(path):
            problems.append(f"agent {agent['name']}: {agent['file']} is missing")
            continue
        with open(path, "rb") as fh:
            digest = hashlib.sha256(fh.read()).hexdigest()
        fields, err = parse_frontmatter(path)
        if digest != agent["sha256"]:
            problems.append(f"agent {agent['name']}: file differs from the recorded sha256")
        if err:
            problems.append(f"agent {agent['name']}: {err}")
        elif fields["name"] != agent["name"]:
            problems.append(f"agent {agent['name']}: frontmatter name is {fields['name']!r}")
        elif "mcp__" in fields.get("tools", ""):
            problems.append(f"agent {agent['name']}: its tools line names an MCP tool")
        loaded = "not checked" if not parsed else "loaded" if agent["name"] in listed else "MISSING"
        if loaded == "MISSING":
            problems.append(f"agent {agent['name']}: not in this session's agent list")
        print(f"  agent {agent['name']:30} file ok={digest == agent['sha256']!s:5}  {loaded}")
    if parsed:
        missing = [b for b in spec["builtin_agents"] if b not in state["builtin_agents"]]
        problems += [f"built-in agent {b} is not in this session" for b in missing]
        print(
            f"  built-in agents: {', '.join(spec['builtin_agents'])}: missing {missing or 'none'}"
        )
        deferred = [t for t in ("WebSearch", "WebFetch") if t in spec["builtin_tools"]]
        absent = [t for t in deferred if t not in state["tool_names"]]
        problems += [f"tool {t} is not offered in this session" for t in absent]
        print(f"  web tools offered: {', '.join(t for t in deferred if t not in absent) or 'none'}")

    if sys.version_info < (3, 10):
        problems.append(f"python3 is {sys.version.split()[0]}; the baseline needs 3.10+")
    if not shutil.which("git"):
        problems.append("git is not on PATH")
    print(
        f"  python3 {sys.version.split()[0]}, git {'found' if shutil.which('git') else 'MISSING'}"
    )

    want = spec["settings"]
    settings = _load_json(os.path.join(REPO, want["file"])) or {}
    for key, value in want["env"].items():
        if (settings.get("env") or {}).get(key) != value:
            problems.append(f"{want['file']}: env.{key} is not {value!r}")
        if os.environ.get(key) != value:
            problems.append(f"env {key} is not {value!r} in this process (settings not applied?)")
    for key, value in want["enabledPlugins"].items():
        if (settings.get("enabledPlugins") or {}).get(key) is not value:
            problems.append(f"{want['file']}: enabledPlugins[{key!r}] is not {value}")
    deny = set((settings.get("permissions") or {}).get("deny") or [])
    # A required MCP tool counts as denied when a wildcard rule such as mcp__*__send* covers it.
    globs = [d for d in deny if d.startswith("mcp__") and "*" in d]
    absent_rules = [
        r
        for r in want["required_deny_rules"]
        if r not in deny and not any(fnmatch.fnmatchcase(r, g) for g in globs)
    ]
    problems += [f"{want['file']}: required deny rule missing: {r}" for r in absent_rules]
    print(
        f"  settings: {len(deny)} deny rules, required ones missing: {len(absent_rules)},"
        f" output-rewriting switch in process env: {os.environ.get('TOKEN_OPTIMIZER_DISABLED')}"
    )

    root = synced_root("plugins")
    synced = glob.glob(os.path.join(root, "*.meta.json")) if root else []
    rewriting = [
        p
        for p in glob.glob(os.path.join(root or "", "*", ".claude-plugin", "plugin.json"))
        if (_load_json(p) or {}).get("name") == "agentone-token-compression"
    ]
    print(
        f"  synced plugins in this session: {len(synced)} (baseline requires none);"
        f" output-rewriting plugin on disk: {'yes, disabled by settings' if rewriting else 'no'}"
    )

    env_spec = spec["analysis_environment"]
    python = os.path.join(REPO, env_spec["venv"], "bin", "python")
    if os.path.exists(python):
        try:
            proc = subprocess.run(
                [python, "-c", env_spec["import_check"]], capture_output=True, timeout=180
            )
            env_state = "restored, imports ok" if proc.returncode == 0 else "restored, IMPORT FAILS"
        except subprocess.TimeoutExpired:
            env_state = "restored, IMPORT TIMED OUT"
        if env_state != "restored, imports ok":
            problems.append(f"analysis environment: {env_state}")
    else:
        env_state = f"not restored; before exact tests run: {env_spec['restore']}"
        if require_analysis_env:
            problems.append("analysis environment is not restored")
    print(f"  analysis environment ({env_spec['venv']}): {env_state}")

    proc = subprocess.run(
        [sys.executable, RECORDS, "verify"], capture_output=True, text=True, cwd=REPO
    )
    for line in proc.stdout.splitlines():
        print(f"  records: {line}")
    if proc.returncode != 0:
        problems.append("governance records failed verification")

    leaks = scan_docs()
    if leaks:
        problems.append(f"identifier/credential patterns in committed docs: {leaks}")
    for problem in problems:
        print(f"  PROBLEM: {problem}")
    print(f"  result: {'BASELINE NOT SATISFIED' if problems else 'baseline satisfied'}")
    return 1 if problems else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--write", action="store_true", help="regenerate system/capabilities/*.json"
    )
    parser.add_argument(
        "--transcript", help="session transcript to read (default: newest for this repo)"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="with --write, allow a regeneration that drops most recorded capabilities",
    )
    parser.add_argument(
        "--baseline",
        action="store_true",
        help="check only the operating baseline (system/baseline/baseline.json)",
    )
    parser.add_argument(
        "--require-analysis-env",
        action="store_true",
        help="with --baseline, fail when the pinned analysis environment is not restored",
    )
    args = parser.parse_args()
    path = args.transcript or latest_transcript()
    state = read_transcript(path)
    if not state["parsed"]:
        print(
            "warning: no skill listing found in the transcript; skill/agent lists will be empty",
            file=sys.stderr,
        )
    if args.baseline:
        return check_baseline(state, args.require_analysis_env)
    manifest, plugins, skills, agents = build(state, path)
    if args.write:
        # A session without synced plugins would otherwise overwrite the record with a much
        # smaller set; make that an explicit choice.
        reasons = shrink_reasons(manifest)
        if reasons and not args.force:
            print("refusing to write: " + "; ".join(reasons), file=sys.stderr)
            print("run the check mode to see what is missing, or pass --force", file=sys.stderr)
            return 2
        write_outputs(manifest, plugins, skills, agents)
        print(
            f"wrote {OUT_DIR}: {len(plugins)} plugins, {len(skills)} skills, {len(agents)} agents"
        )
        return 0
    return check(manifest, plugins, skills, agents)


if __name__ == "__main__":
    sys.exit(main())
