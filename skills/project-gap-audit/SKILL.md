---
name: project-gap-audit
description: >-
  Compare ResearchOS / Research Companion opening-report goals against current
  modules and skills; output prioritized gaps with owners and next actions.
---

# Project gap audit

Use when aligning the proposal (五模块架构 + 技能库/质检) with what actually
exists in the repo or workspace, or before a sprint to decide what to build next.

## Input

- Opening-report goals (slides: goal, modules, eval, roadmap)
- Current inventory: modules (Radar / ReproBox / Debugger / LabLens / Replay),
  skills under `skills/`, demos, and known stubs
- Constraints: deadline, team size, compute, must-ship for the next review

## Output

A reviewable gap packet:

1. **Goal ↔ capability matrix** — each stated goal → supporting module/skill → status (`done` / `partial` / `missing`)
2. **Gap list** — ranked by (impact on pilot × unblock others × effort inverse)
3. **Priority backlog** — P0/P1/P2 with owner, dependency, and “definition of done”
4. **Risk notes** — scope creep, single-module demos mistaken for integration, missing quality checks

## Steps

1. Extract 5–10 concrete goals from the opening report (not slogans).
2. Inventory modules and skills; mark evidence (path, demo, or “chat-only”).
3. Fill the matrix; anything without a path or demo is at most `partial`.
4. Rank gaps; P0 must unlock the pilot arms or cross-module context.
5. Propose the next 1–2 skills/modules only — no full rewrite plans.
6. Save the packet under the project workspace (e.g. `docs/gap-audit-YYYYMMDD.md`).

## Quality check

- [ ] Every goal maps to at least one cell in the matrix
- [ ] No `done` without a file path or runnable demo reference
- [ ] P0 list ≤ 3 items and each has an owner
- [ ] Gaps distinguish “missing skill” vs “skill exists but no quality check”
- [ ] Output lives in the project tree, not only in chat

## Acceptance tests

| ID | Scenario | Expected |
|----|----------|----------|
| GA-1 | Only proposal PDF present, empty `skills/` | Matrix mostly `missing`; P0 includes core memory + at least one workflow skill |
| GA-2 | Four skills exist but no shared project memory | Gap marked `partial` for unified context; P0 = project-memory / Replay hook |
| GA-3 | ReproBox skill exists without quality checklist | Status `partial`; gap type = missing quality check, not missing module |
| GA-4 | Re-run after adding `module-spec` for Radar | Radar row moves toward `partial`/`done`; prior rows retained with revision note |
