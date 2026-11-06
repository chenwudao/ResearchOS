---
name: foundational-frontier-split
description: >-
  For one small RQ and its paper neighborhood, produce dual shelves —
  foundational vs frontier — plus bridge notes and gaps for evidence-ledger.
---

# Foundational / frontier split

Use after `seed-paper-neighborhood` (or with an explicit curated paper set) for
one must-RQ from `rq-decomposition`. Then pipe gaps into `evidence-ledger`.

## Definition of “foundational” (default)

**Primary:** must-read **survey/tutorial** + **method origin** papers that define
the problem or core technique for this RQ.

**Secondary signal:** high citation / shared ancestor in the citation graph
(supports ranking, never the sole rule).

## Definition of “frontier”

Work from roughly the last **2–3 years** (or the field’s latest milestone wave)
that is topically central to the RQ. Prefer lab diversity; flag same-lab clusters.

## Input

- One small RQ (required)
- Neighborhood from `seed-paper-neighborhood` (preferred) or manual paper set
- Optional year/venue preferences

## Output

1. **Foundational shelf** (2–4 annotated papers)
2. **Frontier shelf** (2–4 annotated papers)
3. Short **bridge** narrative (how frontier extends foundations)
4. **Gaps** — unsupported claims → `evidence-ledger`

Every affirmative paper row needs a stable ID. Sourceless sentences go only into Gaps.

## Steps

1. Filter neighborhood to the RQ.
2. Split shelves using the definitions above.
3. Write bridge + gaps.
4. Append run-log; offer one-click ledger ingest of gap rows.

## Quality check

- [ ] Both shelves non-empty (or justified empty)
- [ ] Foundational prefers survey and/or method origin when they exist
- [ ] Frontier not all from one lab
- [ ] No DOI-less affirmative claims outside Gaps
- [ ] Each row has a one-line role for *this* RQ

## Acceptance tests

| ID | Scenario | Expected |
|----|----------|----------|
| FF-1 | Mature topic + neighborhood | Survey/origin in foundational; recent work in frontier |
| FF-2 | Only blogs, no IDs | Content → Gaps |
| FF-3 | Sample/demo mode | `mode: sample` + `demo/output/` artifacts |
