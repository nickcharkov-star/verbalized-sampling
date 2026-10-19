---
name: retro
description: Run a retrospective on the work of this session (or a named stretch of it) — what was asked, what was delivered, what went wrong and why, and what changes so it does not happen again — then write the lessons back into the skills and docs future sessions read. Use when the user types /retro, asks for a retrospective, post-mortem, debrief or "what went wrong", or after a run of corrections from the user on the same kind of mistake.
---

# Retro

A retrospective is only worth running if it changes what the next session
does. The output is two things: a short report for the user, and edits to
the files a future session will actually read (skills, CLAUDE.md, READMEs).
A retro that only produces prose has not finished.

## 1. Collect the record — facts, not memory

Gather before you judge. Quote, do not paraphrase.

- **Every ask, verbatim.** Walk the conversation and list each request the
  user made, including the ones folded into a long message. Number them.
  Repeated asks are the most important signal in the whole record — note
  how many times each was made.
- **What shipped.** `git log --oneline <range>`, the files changed, the
  artifact versions published, the files sent to the user.
- **What was verified.** Test output, screenshot paths, measured numbers.
  Anything not verified is marked *unverified*, not *done*.
- **Every correction the user made**, with what they were correcting.

## 2. Asked vs delivered

One table, one row per ask:

| # | Ask (their words) | Status | Evidence |
|---|---|---|---|
| 3 | "the real product photos must be featured" | done | `web/assets/photo/`, 26 frames from Drive |
| 5 | "generate 3 UGC videos" | blocked | no path to the drive; tried X, Y |

Status is one of **done · partial · blocked · not started**. *Blocked*
needs the attempts listed — a thing is not blocked until it has been tried
two different ways. *Partial* says exactly which part is missing.

## 3. What went wrong, and why

For each correction, miss, or wasted cycle:

- **What happened** — one sentence, observable.
- **Root cause** — ask why until the answer is something you could change
  (a check you skipped, an assumption you did not test, a metric that
  measured the wrong thing). "I made a mistake" is not a root cause.
- **The rule that would have prevented it** — phrased as an instruction a
  future session can follow.

Typical root causes worth naming plainly:

- Declared something impossible without testing it (e.g. assumed a large
  download could not reach disk, when the harness saves oversize tool
  results to a file).
- Substituted a stand-in for the real thing the user asked for (a drawn
  product instead of a photograph of it).
- A test that passed because it measured the wrong quantity (comparing
  `scrollWidth` to an `innerWidth` that had itself grown).
- Polished one part while a requested part was untouched.

No apology, no self-criticism beyond the facts. Be exact and move on.

## 4. What to keep

The two or three things that worked and should be done the same way next
time, with where they live (script, skill, test).

## 5. Write it back

This is the step that makes the retro worth having.

- For each rule from §3, add it to the skill a future session will load
  for that kind of work (`.claude/skills/<name>/SKILL.md`), in that skill's
  own voice, next to the content it qualifies. If no skill covers the area,
  create one with the `skill-creator` conventions: a `description` that says
  when to use it, and the rule with the reason behind it.
- Project-wide rules (what the user always wants, what they never want)
  go in `CLAUDE.md` at the repository root — unless the repository ignores
  it (`git check-ignore CLAUDE.md`), in which case they go in a project
  skill whose description names the project, so they still load.
- Save the report itself as `docs/retro/YYYY-MM-DD.md`.
- Commit these with the work, on the working branch.

## 6. Report to the user

Short. The table from §2, the three most important lessons from §3 in a
sentence each, and — separately — anything that needs the user to act,
with exactly what they need to do. Link the saved report.
