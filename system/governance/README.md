# Governance: authority, enforcement and records

How work on this repository is authorized, what Claude Code sessions are technically prevented from doing, and where decisions and actions are recorded.

**Current status: research and validation only. Not authorized for commercial actions.** Merging a pull request (including the one that added this file) is not a launch decision and authorizes nothing beyond the change itself.

## Authority

| Action | Who may authorize | Current state |
|---|---|---|
| Change code, docs, research notes in this repository | founder, through a reviewed pull request | allowed |
| Read-only research: web search, reading public sources, reading connected documents | any session | allowed |
| Spending money or paid credits: purchases, subscriptions, ad spend, domains, paid generation | founder only, per action, with a decision record | **not authorized**: no amount limit has been set |
| External communication: sending email or messages, invites, sharing documents, posting, publishing | founder only, per action, with a decision record | **not authorized** |
| Commercial changes: store products, prices, discounts, orders | founder only, with a decision record | **not authorized** |
| Deployments and public releases | founder only, with a decision record | **not authorized** |
| Creating scheduled tasks, sessions or connector grants | founder only | **not authorized** for sessions on this repository |

Until the founder records spending limits in a decision (see `decisions/`), every spend is above the limit.

## Enforcement (runtime, not prompts)

Telling an agent "don't spend" is not an access control. These are enforced by Claude Code and the services themselves:

1. **Deny rules in `.claude/settings.json`.** Claude Code refuses tool calls that match a `permissions.deny` rule, whatever the permission mode, an agent's prompt, a skill's `allowed-tools` or a hook says, and the rules apply to subagents too. A denied MCP tool is removed from the session altogether. Sessions on this repository load the file automatically (single-repository cloud sessions included). The rules:
   - **Per-tool rules** for every connector or plugin tool classified as spending or acting externally: about 760 tools across 34 servers were classified, and only read-only and owner-only tools stay usable. Examples: domain purchase, deployments and DNS; store products, discounts and inventory; e-mail send, forward and spam reports; calendar invitations; Drive sharing; Lovable credit-consuming runs; Zapier actions; AWS scripts; browser automation; paid video analysis.
   - **Wildcard rules** that also catch tools from servers not seen yet: any MCP tool whose name starts with `buy`, `purchase`, `checkout`, `charge`, `pay_`, `refund`, `send`, `forward`, `reply`, `share`, `invite`, `post_`, `publish`, `launch` or `activate`.
   - **Claude Code remote tools** that create, fire, change or archive sessions and scheduled tasks, or widen repository access.
   - **GitHub:** merging, auto-merge, approving reviews, branch and file writes through the API, issues, forks and workflow runs are denied. Opening and updating a pull request and replying to review comments on it stay allowed, so PR work can continue. Branch pushes go through `git`.
   - **Bash rules** (text matches, not a security boundary): pushing to `main` or force-pushing, `gh pr merge`, releases, `make publish`, `twine`/`uv`/`poetry`/`hatch`/`flit` publishing, and the `vercel`, `aws`, `gcloud`, `gsutil`, `bq` and `stripe` command-line tools.
   - **Credential readers** (Vercel environment variables, Edge Config tokens, SDK keys) and the output-rewriting plugin's own tools.
   - A canary, `Bash(echo vs-deny-canary*)`, so any session can confirm that the rules are loaded.
2. **No payment credentials in the environment.** The cloud environment has no setup script and no network secrets for payment or ad providers, so nothing can buy or spend through the shell.
3. **Connector grants are the outer boundary.** A claude.ai connector can do whatever its grant allows, so a deny rule here only protects sessions on this repository. Scheduled tasks and other repositories carry their own grants. Review them at https://claude.ai/code/routines and https://claude.ai/customize/connectors. Remove grants a task doesn't need, rather than revoking access wholesale.
4. **The output-rewriting plugin is off.** `.claude/settings.json` sets `TOKEN_OPTIMIZER_DISABLED=1` and disables `agentone-token-compression@synced`, so tool output reaches the session and the evidence log unaltered.

**What this does not cover.** Project deny rules protect sessions on this repository only. They don't apply to scheduled tasks or sessions on other repositories, or to tools from servers that weren't connected when the list was built, unless a wildcard rule catches them. A session can edit `.claude/settings.json`, so a loosened rule shows up only as a diff in review. For enforcement a session can't touch, use the claude.ai organization's connector controls (`blocked` or `ask`), server-managed settings, and limits at each provider.

To enable a commercial action later: record a decision with the amount limit and scope, narrow the relevant deny rule in a pull request (so the change itself is reviewed), grant only the connector scope that action needs, and log every resulting action (below).

## Records

| Record | Where | Public? | Tamper-evidence |
|---|---|---|---|
| Plans and decisions | `decisions/NNNN-*.md` | yes, so sanitize them: no customer data, no credentials, no account identifiers | git history; a protected `main` branch makes rewrites visible |
| Raw command evidence | `evidence/runs/<id>/` + `evidence/INDEX.jsonl` | yes, unless the output matched an identifier or credential pattern (then only its hash is public; raw kept in git-ignored `.restricted/`, VM-local) | hash chain; `records.py verify` |
| External actions | `actions.jsonl` (sanitized line per action) | yes: kind, provider, summary, approver role, decision, amount, and the SHA-256 of the restricted receipt | hash chain; `records.py verify` |
| Provider receipts, transaction IDs, customer data | **restricted store held by the founder** (for example a private repository or the provider's own dashboard export) | **never** in this repository | the provider's record plus the digest in `actions.jsonl` |

```bash
python3 system/governance/records.py evidence <label> -- <command>   # run and keep raw output
python3 system/governance/records.py action --kind purchase --provider ... --summary ... \
    --approved-by founder --decision D-0004 --receipt-digest <sha256 of restricted receipt>
python3 system/governance/records.py verify                         # exit 1 if anything changed
```

**Limits.** A hash chain shows that an entry changed or disappeared only if you compare it with a copy the editor couldn't also rewrite: pushed commits on a protected branch, or a head hash recorded elsewhere. Anyone with write access can rebuild the whole chain consistently. The restricted store does not exist yet. Until the founder sets one up outside this VM, restricted evidence is VM-local and lost with the VM, and no external action can be recorded properly. That alone keeps commercial actions unauthorized.
