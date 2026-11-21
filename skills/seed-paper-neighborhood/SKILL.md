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

1. Resolve seeds to stable IDs. For a seed title or topic, call the available Weave `paper_search` tool with `includeStatus: true`. Keep the query and each provider's status with the run log.
2. Use `paper_lookup` to resolve seed identifiers. Use `paper_neighbors` for outgoing references and incoming citations. The indexed count describes the source coverage and may exceed returned rows. `paper_citations` provides Crossref's outgoing references as an additional source. Explain coverage gaps before drawing conclusions.
3. Deduplicate by DOI or provider ID. Keep version links for a preprint and a published paper when the source supports that link. Label topical similarity separately from citation relationships.
4. Treat search results as metadata. For a claim about methods, datasets, or results, use `paper_read` with the registered project PDF or exact arXiv version and record the returned page and source locator.
5. Write the paper set and search log, then pass them to `foundational-frontier-split` and `evidence-ledger`.

## Quality check

- [ ] Every node has a stable ID
- [ ] Prior / derivative / similar not all identical lists
- [ ] Duplicates merged
- [ ] No invented paper titles or DOIs
- [ ] The search log lists provider failures and missing coverage

## Acceptance tests

| ID | Scenario | Expected |
|----|----------|----------|
| SN-1 | One seed DOI | Non-empty prior and derivative (or justified empty) |
| SN-2 | RQ only, no seed | Returns search hints and asks for a seed |
| SN-3 | Duplicate aliases | Single merged node |
