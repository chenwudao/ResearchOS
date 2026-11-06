---
name: module-spec
description: >-
  Turn one ResearchOS module (Radar, ReproBox, Debugger, LabLens, or Replay)
  into an implementable spec: interfaces, dependencies, I/O, and acceptance.
---

# Module specification

Use when a module is named in the architecture diagram but not yet buildable,
or before writing code/skills for that module so the team shares one contract.

## Input

- Module name (one of: Research Radar / ReproBox / Research Debugger / LabLens / Research Replay)
- Related opening-report bullets and any existing skills that should plug in
- Shared context contract (what “Unified Project Context” exposes: papers, code, logs, decisions)
- Non-goals for this version (explicitly out of scope)

## Output

A single `docs/modules/<module-slug>-spec.md` containing:

1. **Purpose** — one paragraph, user-visible outcome
2. **Inputs / outputs** — schemas or file artifacts (paths, formats)
3. **Interfaces** — functions/tools/skills it calls; what it writes back to project memory
4. **Dependencies** — other modules, external tools (GitHub, Docker, arXiv, W&B, …)
5. **Happy-path workflow** — 5–8 steps matching a typical scenario slide
6. **Failure modes** — missing PDF, broken env, flaky run, weak evidence
7. **Acceptance criteria** — testable checklist (see below)
8. **Skill mapping** — which `skills/*` implement which steps

## Steps

1. Name the module and freeze non-goals for v0.
2. List artifacts in and out; prefer files in the project tree over chat blobs.
3. Define read/write access to Unified Project Context (no silent overwrites).
4. Map steps to existing or planned skills; leave `TBD` rather than inventing APIs.
5. Write acceptance tests that a reviewer can run without the original author.
6. Link the spec from the gap-audit backlog item that requested it.

## Quality check

- [ ] Exactly one module per spec (no mega-doc)
- [ ] I/O artifacts have paths or schemas; no vague “returns insights”
- [ ] Every happy-path step maps to a skill or an explicit human gate
- [ ] Failure modes include recovery or escalate-to-human
- [ ] Acceptance criteria are observable (pass/fail), not aspirational


## Cross-platform & demo backend

- **Clients:** Windows and Linux must use the same workflow via browser (or other OS-agnostic client). Do not require a native GUI that only runs on one OS.
- **Demo backend:** The agent box (Linux) may host the demo API / runner. Document start command, port, and that the process may die on box update — re-run before demos.
- **Production note:** Spec may mention migrating off the box later; v0 acceptance does not require public stable hosting.
- **Module rule:** Any module that shells out must work under Linux on the demo host; client-side steps must not assume Windows-only paths.

## Acceptance tests

| ID | Scenario | Expected |
|----|----------|----------|
| MS-1 | Spec for ReproBox | Includes env setup → run → log artifacts; depends on code + README; writes run log to context |
| MS-2 | Spec claims “analyzes results” with no metric files | Rejected in quality check; must name plots/tables/log paths |
| MS-3 | Radar spec with `read-paper` skill mapped | Skill mapping table lists skill id → step; TBD allowed only with owner |
| MS-4 | Replay spec overwrites ledger rows in place | Failure mode / rule requires append + revision note (align with evidence-ledger) |
| MS-5 | Demo API on Linux box; Win + Linux browsers hit same backend | Spec lists start command/port; client path is browser-only; no Win-only dependency in happy path |
