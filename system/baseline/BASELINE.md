# Operating baseline: initial research and validation

The small set of capabilities that sessions on this repository rely on for research and validation work. Everything else in the inventory (`system/capabilities/`) stays recorded but isn't relied on. Decision: [D-0001](../governance/decisions/0001-operating-baseline.md).

**Scope: research and validation only.** The business is NOT READY. Nothing in this baseline authorizes spending, outreach, publishing or deployment ([D-0003](../governance/decisions/0003-spending-and-external-action-authority.md), [D-0004](../governance/decisions/0004-merge-is-not-launch.md)).

Machine-readable record: [`baseline.json`](baseline.json). Check it:

```bash
python3 system/bootstrap/capability_audit.py --baseline
```

It exits 0 when the baseline is satisfied, **whether or not any plugins arrived in the session**, and 1 when something is broken: a changed or missing agent file, a missing deny rule, the output-rewriting plugin not switched off, a broken record chain, or a leak in the docs. It also reports **limitations**: dependencies that a later step or the founder must supply. These are the analysis environment not yet restored and research hosts the network policy blocks. Limitations don't fail the check unless you pass `--strict`. The full inventory check (without `--baseline`) still exits 1 in a session without plugins, because it compares against an inventory that included them.

## What is in it

| Capability | Version | Used for | Dependencies and their status |
|---|---|---|---|
| Statistician (`academic-statistician.md`) | sha256 in `baseline.json`; upstream `4e3ac3c` | validating the method's quantitative claims | repository result files: available. Numerics for exact tests: **resolved** by the pinned analysis environment below. New experiment runs: paid API calls, not authorized |
| Research Synthesist | as above | evidence map of the method's claims, replications, competing methods | WebSearch: works. **Reading pages on arxiv.org, huggingface.co, semanticscholar.org and other scholarly hosts: blocked by the network policy** (below). Paywalled databases: out of scope, recorded as a search boundary |
| Trend Researcher | as above | one-off market and competitor scans from public sources | as Research Synthesist (its `tools:` line excludes Bash and connectors). Paid research tools, monitoring, interviews: out of scope or not authorized |
| Feedback Synthesizer | as above | coding public feedback into use cases and objections | as Research Synthesist. Surveys, analytics, email: not authorized. No personal data in the repository |
| Business Strategist | as above | competitive analysis, business-model options, decision gates | research outputs and public sources: available. Its recommendations cannot authorize launch |
| Codebase Onboarding Engineer | as above | fact-only map of what the library implements | source files only |
| Code Reviewer | as above | reviewing research tooling and PRs | the diff; approving and merging are denied tools |
| Minimal Change Engineer | as above | keeping PRs from growing | filing issues is denied; follow-ups go in PR descriptions or decision records |
| Built-in agents `Explore`, `Plan`, `general-purpose` | Claude Code 2.1.304 | searching, planning, general tasks | none |
| Built-in tools Read, Grep, Glob, Bash, Edit, Write, Agent, WebSearch, WebFetch | Claude Code 2.1.304 | everything above | none |
| `python3` ≥ 3.10, `git` | 3.13.16 and 2.43.0 observed | scripts and checks | in the cloud image |
| Analysis environment `.venv-analysis` | [`requirements-analysis.txt`](requirements-analysis.txt) (numpy 2.5.4, scipy 1.18.1, pandas 3.0.6, statsmodels 0.15.0) | exact statistical tests | wheels only, restored in 35 s on 2026-10-20 |
| `.claude/settings.json` | committed | deny rules, output-rewriting plugin off | see [governance](../governance/README.md) |
| `system/governance/records.py` | committed | raw evidence and action records | Python standard library only |

No plugin, plugin skill, plugin agent or claude.ai connector is part of the baseline.

## Restore in a fresh session

1. Clone the repository (cloud sessions do this). `.claude/agents/`, `.claude/settings.json` and `system/` come with it.
2. Check the baseline: `python3 system/bootstrap/capability_audit.py --baseline`.
3. Before the Statistician runs exact tests, restore the analysis environment (about 35 seconds):

   ```bash
   python3 -m venv .venv-analysis
   .venv-analysis/bin/pip install -q --only-binary=:all: -r system/baseline/requirements-analysis.txt
   python3 system/bootstrap/capability_audit.py --baseline
   ```

   In an unattended fresh session (probe 2), Claude Code's auto-mode safety classifier refused this `pip install`, so a person must approve it in the session. Alternatively, the founder can add an equivalent install to the cloud environment's setup script (environment menu, Edit, Setup script).

4. Record critical checks as evidence: `python3 system/governance/records.py evidence <label> -- <command>`.

## Blocked dependency: reading research pages

Under the cloud environment's **Trusted** network policy, as observed on 2026-10-20 in the audit session and in the fresh probe:

- **Blocked:** arxiv.org, export.arxiv.org, huggingface.co, api.semanticscholar.org, openreview.net, aclanthology.org, doi.org and api.crossref.org. WebFetch fails with a DNS error, and the proxy refuses `curl`.
- **Allowed:** pypi.org and api.github.com.
- **WebSearch** works, but returns only result metadata.

Until the founder adds those hosts under **Allowed domains** in the environment's network settings (environment menu, Edit, Network access), Research Synthesist, Trend Researcher and Feedback Synthesizer must cite search results as such and say that the page itself was not read. The baseline check lists the blocked hosts every time it runs.

## Not in the baseline, and why

- **The other 274 Agency Agents.** They stay committed and listed, and many have dependencies that don't exist here (`manifest.json` → `agency_agent_dependency_review`). Use one only after checking its dependencies the same way.
- **Reality Checker, Evidence Collector.** Their mandatory first step runs `./qa-playwright-capture.sh` against a web UI. The script is missing and this library has no web UI.
- **Agents Orchestrator, Senior Project Manager.** They depend on missing `project-specs/`, `project-tasks/` and `ai/memory-bank/` files and on agent names that don't resolve.
- **Model QA Specialist, Prompt Engineer.** Their workflows need libraries for tabular models or repeated paid model calls.
- **The `verbalized_sampling` package itself.** `pip install -e .` succeeds on Python 3.13, but `import verbalized_sampling` fails: `datasets` 5.1.0 needs `pyarrow>=24`, which needs NumPy 2, while `pyproject.toml` caps `numpy<2.0`. This is a pre-existing problem on `main`, recorded with the other `main` failures in `SYSTEM-CAPABILITIES.md`, and isn't fixed here.
