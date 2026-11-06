---
name: rq-decomposition
description: >-
  Split one chosen BIG direction into 3–7 testable small research questions
  with type, dependencies, and expected evidence — ready for literature skills.
---

# RQ decomposition

Use after the human locks a direction via `direction-framing`.

## Input

- Selected direction card (required)
- Resource limits (hours, GPUs, data)
- Optional: known must-include / must-exclude topics

## Output

3–7 **small RQs**, each with:

| Field | Meaning |
|-------|---------|
| `rq_id` | R1, R2, … |
| `text` | Object × variable × criterion (testable) |
| `type` | mechanism / method / eval / system |
| `depends_on` | other rq_ids or ∅ |
| `evidence_needed` | paper / experiment / both |
| `priority` | must / nice |

Plus **out-of-scope** list (non-empty).

Suggested next skills: `seed-paper-neighborhood` then `foundational-frontier-split`
(or brief path into `evidence-ledger`).

## Steps

1. Restate the locked direction and constraints.
2. Draft RQs; reject slogan questions (“how to improve X?”).
3. Mark dependencies so a pilot can order work.
4. Hand off each must-RQ to neighborhood / foundational-frontier skills.

## Quality check

- [ ] Every must-RQ answerable by one paper set or one pilot experiment
- [ ] Out-of-scope list present
- [ ] No RQ duplicates the direction slogan
- [ ] ≤7 must+nice combined unless human asks for more

## Acceptance tests

| ID | Scenario | Expected |
|----|----------|----------|
| RQ-1 | Direction locked | 3–7 RQs + non-empty out-of-scope |
| RQ-2 | Vague RQ text | Skill rewrites into object×variable×criterion |
| RQ-3 | Output consumed downstream | Each must-RQ becomes one neighborhood/split request |
