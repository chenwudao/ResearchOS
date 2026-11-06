---
name: pilot-eval-design
description: >-
  Design a controlled pilot that compares Manual vs Chatbot vs Research Agent
  on one research question, with success criteria set before testing.
---

# Pilot evaluation design

Use when turning the Research Companion / ResearchOS proposal into a runnable
pilot (开题报告 slide 09), or when the team needs comparable evidence that the
agent beats ad-hoc chat and fully manual work.

## Input

- One concrete research question (single topic, not a whole domain)
- Available resources: time window, compute, data access, human reviewers
- Agent scope for this pilot (which modules / skills are in / out)
- Optional: changed constraint to apply mid-pilot (budget, hardware, deadline)

## Output

A reviewable eval packet:

1. **Pilot sequence** — Topic → research package → expert review → changed constraint
2. **Three arms** — Manual / Chatbot / Research Agent, same question and deadline
3. **Metrics table** (define targets before any run; no invented performance numbers)
   - Evidence: claims traceable to sources
   - Feasibility: plan fits stated resources
   - Efficiency: fewer repeated discovery / context-reentry steps
   - Continuity: reuses project history after the constraint change
   - Cross-platform: Windows and Linux clients complete the same pilot path against one backend
4. **Scoring rubric** — pass/fail or 1–5 per metric, with what counts as pass
5. **Run log template** — start time, artifacts produced, blockers, reviewer notes

## Steps

1. Lock the research question and the deliverable package (literature brief,
   paper comparison, evidence ledger, feasible plan, technical roadmap).
2. Freeze success criteria and the rubric **before** anyone runs an arm.
3. Specify identical starting materials for all three arms (seed papers or none).
4. Schedule the mid-pilot constraint change and what “reuse history” means.
5. Name who reviews (expert role) and what they see (blinded vs labeled arms).
6. Write the run log template into the project workspace.

## Quality check

- [ ] Success criteria written before any arm starts
- [ ] Three arms share the same question, deadline, and package definition
- [ ] Every metric has an observable pass condition (no vague “better”)
- [ ] Continuity metric requires a real constraint change and history reuse
- [ ] No fabricated baseline numbers; empty cells until measured
- [ ] Same backend reachable from Windows and Linux browsers for the pilot path

## Acceptance tests

| ID | Scenario | Expected |
|----|----------|----------|
| PE-1 | Packet missing pre-registered metrics | Quality check fails; no arm may start |
| PE-2 | Three arms with different deadlines | Rejected; arms must share question, deadline, package |
| PE-3 | Continuity metric with no mid-pilot constraint change | Rejected; must define the change and history-reuse rule |
| PE-4 | Metrics table filled with guessed percentages before any run | Rejected; cells stay empty until measured |
| PE-5 | Pilot UI/API only verified on one OS | Fail; same backend must complete the pilot flow in both Windows and Linux browsers |
