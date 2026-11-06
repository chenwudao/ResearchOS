---
name: evidence-ledger
description: >-
  Build a claim-level evidence ledger that ties every research assertion to a
  source passage, experiment log, or explicit gap — for synthesis and review.
---

# Evidence ledger

Use when synthesizing papers or experiment results into verifiable claims
(开题报告 “evidence ledger” / Research Replay knowledge archive), or before
planning so decisions cite evidence instead of chat memory.

## Input

- Project question and current claim set (draft OK)
- Source materials: papers (PDF/URL), notes, code commits, experiment logs
- Optional: prior ledger entries to extend (do not silently rewrite history)

## Output

A ledger table (markdown or CSV) with one row per claim:

| claim_id | claim | claim_type | source | locator | support | status | notes |
|----------|-------|------------|--------|---------|---------|--------|-------|

Field meanings:

- **claim_type**: finding / method / limit / assumption / plan-premise
- **source**: paper cite, log path, or `none`
- **locator**: page/section, figure, commit hash, log line range
- **support**: supports / weak / contradicts / unknown
- **status**: verified / needs-check / gap / discarded

Plus a short **gap list**: claims with `source=none` or `status=gap`, ranked by
how much the plan depends on them.

## Steps

1. Extract candidate claims from the brief or plan (one atomic sentence each).
2. For each claim, attach the best primary source and a precise locator.
3. Mark support strength; if only secondary paraphrase exists, set `weak` and
   queue a close-reading follow-up.
4. Never invent locators; if unverified, set `needs-check` and leave locator blank.
5. Emit the gap list and suggest the next skill (`close-reading`, `repro-pipeline`,
   or `feasibility-check`) for the top gaps.
6. Append to project memory; keep prior rows immutable except via a new revision
   note (who/when/why).

## Quality check

- [ ] Every non-gap claim has a source and locator a reviewer can open in &lt;30s
- [ ] No claim cites “the model said” or unsourced chat as evidence
- [ ] Contradictions are explicit rows, not deleted
- [ ] Gap list exists and is ordered by plan dependency
- [ ] Ledger is stored in the project workspace path, not only in chat

## Acceptance tests

| ID | Scenario | Expected |
|----|----------|----------|
| EL-1 | Claim with only “model said so” as source | Must be `gap` or `needs-check`, never `verified` |
| EL-2 | Verified claim without page/section/locator | Quality check fails |
| EL-3 | Two sources disagree on the same claim | Two rows or explicit `contradicts`; neither silently dropped |
| EL-4 | Plan depends on three `gap` claims | Gap list ranks those three first by dependency |
