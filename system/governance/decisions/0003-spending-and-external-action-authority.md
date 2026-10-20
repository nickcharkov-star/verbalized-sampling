# D-0003: No spending or external actions until the founder sets limits

- Status: **Proposed** (drafted by a Claude Code session on 2026-10-20; takes effect when the founder accepts it)
- Scope: all Claude Code sessions on this repository; recommendations for account-level grants

## Context

The account has claude.ai connectors and plugins that can send email, share documents, change a store, buy domains, deploy, spend generation credits and create scheduled tasks. Agent prompts can't be relied on to prevent that. At least one account-level scheduled task carries broad connector grants and a standing API token.

## Decision

1. **Authority.** Only the founder may authorize spending, external communication, commercial changes, deployments, or new sessions and scheduled tasks. No limit has been set, so no spending is authorized. A future authorization is a decision record that states:
   - the action kinds and providers it covers, and the connector or tool rule it narrows
   - a per-transaction limit and a total limit, with currency, plus the period or end date
   - who approves each action (the founder, or a named role the founder delegates to)
   - where receipts and transaction IDs are kept: a restricted store outside this public repository
   - how the authorization ends: the date, the total, or a revoking decision
2. **Enforcement.** `.claude/settings.json` denies the tools that spend, send, share, publish, deploy, change a store, or create sessions and scheduled tasks. Read-only tools stay available. Loosening a rule means a reviewed pull request that cites a decision.
3. **Account grants.** Review scheduled tasks and remove connector grants they don't need. Don't revoke unrelated access. The review of the current tasks is in the session report rather than in this public file.
4. **Records.** Every authorized external action gets a sanitized line in `actions.jsonl` that points to a receipt held in a restricted store. No restricted store exists yet, so no external action can be recorded properly. That is one more reason nothing is authorized.

## Consequences

- Research sessions can read and analyze, but cannot buy, send, publish or deploy from this repository.
- Deny rules protect only sessions on this repository. Grants used by scheduled tasks or other repositories need their own review.
