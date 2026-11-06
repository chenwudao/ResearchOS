---
name: seed-paper-neighborhood
description: >-
  From 1–N seed papers (or a seed RQ), expand a citation/similarity neighborhood
  and label prior, derivative, and similar works for Radar / LabLens queues.
---

# Seed paper neighborhood

Use after `rq-decomposition` when at least one seed DOI/title exists, or when
the user supplies seeds for an RQ. Feeds `foundational-frontier-split`.

## Input

- Seed DOIs / titles / PDFs (preferred) **or** a seed RQ with search hints
- Optional: preferred venues, year cutoffs, OpenAlex / Semantic Scholar IDs

## Output

Ranked neighborhood:

- **prior** (earlier / foundational candidates)
- **derivative** (later / citing works)
- **similar** (topical peers)

Each node: stable ID (DOI / OpenAlex / arXiv), year, one-line relation to seed,
optional tags `{survey, method-origin, sota, contested}`.

Export BibTeX/CSV-friendly rows for `evidence-ledger`.

## Steps

1. Resolve seeds to stable IDs (demo may use curated samples).
2. Expand prior / derivative / similar via open APIs when available.
3. Deduplicate; attach relation labels.
4. Write artifact + run-log; pass set to `foundational-frontier-split`.

## Quality check

- [ ] Every node has a stable ID
- [ ] Prior / derivative / similar not all identical lists
- [ ] Duplicates merged
- [ ] No invented paper titles or DOIs

## Acceptance tests

| ID | Scenario | Expected |
|----|----------|----------|
| SN-1 | One seed DOI | Non-empty prior and derivative (or justified empty) |
| SN-2 | RQ only, no seed | Returns search hints + asks for a seed, or limited sample with `mode: sample` |
| SN-3 | Duplicate aliases | Single merged node |
