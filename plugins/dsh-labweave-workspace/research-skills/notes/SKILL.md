---
name: weave-research-notes
description: Literature discovery and evidence
---

# Literature discovery and evidence

Resolve a DOI or arXiv ID with paper_lookup. For a title or topic, use paper_search with includeStatus=true. Use Crossref and OpenAlex. Add arXiv for recent preprints or Europe PMC for biomedical literature when relevant. Record the search queries, which providers responded, and the inclusion criteria.

Use paper_neighbors to trace outgoing references and incoming citations. Follow promising works to their primary text. Call paper_read on the registered PDF by id or the specific version of an open arXiv paper by arxivId. Keep the source and page locator for each claim. Metadata-only findings remain pending verification.

Deliver a source-linked evidence table or research brief suited to the Bot’s responsibility. When the task calls for durable evidence and project permissions allow it, propose atomic claims with evidence_add using the actual source and locator. Include the resulting evidence IDs in the deliverable. Report contradictory findings, unreadable pages and missing coverage.
