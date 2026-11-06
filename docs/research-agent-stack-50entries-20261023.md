# Research-Agent / AI-for-Science Stack for Student ResearchOS

**Curated:** 2026-10-23 (UTC+8)  
**Vision alignment:** (1) Guide BIG research direction + SMALL questions — human decides; (2) For each question, surface foundational + frontier papers; (3) Flexible practical research companion — **not** autonomous paper mills.

**Method:** Multiple WebSearches + WebFetch of key product/paper/GitHub pages. Entries below are real systems with URLs verified or widely cited in library guides / arXiv / vendor pages. Prefer 2023–2026 systems.

**Fit legend (ResearchOS):**
- **steal** — patterns/APIs to copy closely into core UX
- **adapt** — valuable ideas; reshape for HITL student companion
- **avoid-core** — interesting for study; do **not** make the product’s default loop (paper mills / unsupervised end-to-end “scientist”)

**Fetch notes:** SciSpace homepage sometimes returns 403 to automated fetchers (site exists; use library guides + product URL). OpenAlex marketing pages may bot-wall; API/docs at `docs.openalex.org` / `help.openalex.org` are usable. GitHub HTML fetches sometimes return thin metadata — URLs still confirmed via search.

---

## How this maps to ResearchOS UX

| Vision pillar | Primary buckets | Steal/adapt from |
|---|---|---|
| BIG direction → SMALL questions (human decides) | A, parts of D | CoQuest, PersonaFlow, IRIS, IdeaSynth, Google Co-Scientist *interaction* model |
| Foundational + frontier dual shelf | B, G, F | Connected Papers / Litmaps / ResearchRabbit maps; OpenAlex + S2 graphs; Scite stance |
| Practical companion (not paper mill) | C, D outline-only, F, G | PaperQA2, OpenScholar/Asta ScholarQA, FutureHouse Crow/Falcon, Elicit tables |
| Study but fence off | E | AI Scientist, Agent Laboratory, CycleResearcher, AgentRxiv, NovelSeek |

---

## A. RQ / direction co-creation agents

| # | Name | One-line what it does | URL | Bucket | Fit |
|---|---|---|---|---|---|
| 1 | **CoQuest** | LLM agent for human–AI co-creation of research questions; compares breadth-first vs depth-first ideation; shows AI delays aid reflection/control. | Paper: https://doi.org/10.1145/3613904.3642698 · Code: https://github.com/yiren-liu/coquest · arXiv HTML: https://arxiv.org/html/2310.06155 | A | **steal** — RQ tree UX, breadth/depth modes, explicit “human creativity not automation” framing |
| 2 | **PersonaFlow** | Graph/mind-map ideation with LLM-simulated domain-expert personas that critique and refine research ideas. | arXiv: https://arxiv.org/abs/2409.12538 · Code: https://github.com/yiren-liu/personaflow | A | **adapt** — multi-persona critique panels; keep human as editor-in-chief |
| 3 | **IRIS** (Interactive Research Ideation System) | Open HITL ideation platform: MCTS test-time expansion, fine-grained feedback, query-based literature synthesis. | arXiv: https://arxiv.org/abs/2504.16728 · Code: https://github.com/Anikethh/IRIS-Interactive-Research-Ideation-System | A | **steal** — steerability + transparency; literature-grounded idea nodes |
| 4 | **ResearchAgent** | From a seed paper, walks citation graphs + entity knowledge to propose problem/method/experiment ideas, refined by LLM reviewing agents. | arXiv: https://arxiv.org/abs/2404.07738 · ACL Anthology: https://aclanthology.org/2025.naacl-long.342/ | A | **adapt** — seed→idea pipeline; require human accept/reject before any “experiment” step |
| 5 | **SciMON** | Literature-grounded scientific inspiration machine that revises ideas for novelty vs prior work. | arXiv: https://arxiv.org/abs/2305.14259 | A | **adapt** — novelty-vs-literature check as a ResearchOS gate |
| 6 | **HypoGeniC** | Data-driven hypothesis generation with reward-based exploration and a “wrong example bank.” | arXiv: https://arxiv.org/abs/2404.04326 · Code: https://github.com/ChicagoHAI/hypothesis_generation | A | **adapt** — for empirical/student datasets; not default literature RQ path |
| 7 | **IdeaSynth** | Iteratively evolves and composes idea *facets* with literature-grounded feedback into a research brief. | arXiv: https://arxiv.org/abs/2410.04025 · ACM: https://dl.acm.org/doi/10.1145/3706598.3714057 | A | **steal** — facet composition UI (problem / method / eval) before prose |
| 8 | **Google AI Co-Scientist** | Multi-agent (Generation/Reflection/Ranking/Evolution/…) hypothesis & protocol collaborator on Gemini; Trusted Tester access; Nature/arXiv reports. | Blog: https://research.google/blog/accelerating-scientific-breakthroughs-with-an-ai-co-scientist/ · arXiv: https://arxiv.org/abs/2502.18864 · Nature: https://www.nature.com/articles/s41586-026-10644-y | A (+E caution) | **adapt** — tournament ranking + scientist feedback loops; **avoid-core** unsupervised “discover new knowledge” marketing for students |

---

## B. Literature discovery / citation graphs / dual foundational–frontier

| # | Name | One-line what it does | URL | Bucket | Fit |
|---|---|---|---|---|---|
| 9 | **Connected Papers** | Similarity graph (co-citation + bibliographic coupling) from a seed; prior vs derivative works views. | https://www.connectedpapers.com/ | B / G | **steal** — foundational (prior) vs frontier (derivative) dual view |
| 10 | **ResearchRabbit** | Visual “rabbit hole” discovery of related papers/authors with collections and alerts. | https://www.researchrabbit.ai/ | B / G | **steal** — collections + author networks for student reading lists |
| 11 | **Litmaps** | Timeline × citation maps, seed sets, filters, email alerts for new related work. | https://www.litmaps.com/ | B / G | **steal** — time axis for frontier; alerts → Radar module |
| 12 | **Inciteful** | Free citation-network explorer: similar / important / review papers, PageRank-style importance. | https://inciteful.xyz/ | B / G | **adapt** — “most important / review” shelves for foundations |
| 13 | **Undermind** | Natural-language deep search with citation-influence ranking and visual maps. | https://www.undermind.ai/ | B / G | **adapt** — NL query → ranked map; verify every hit |
| 14 | **Keenious** | Recommends papers from pasted text / PDF / draft (OpenAlex + S2); Word/Docs plugins. | https://keenious.com/ | B / G | **adapt** — “from my draft, what’s missing?” companion |
| 15 | **Semantic Scholar Academic Graph + Recommendations** | Paper/author/citation graph API, TLDRs, SPECTER2 embeddings, similar-paper recommendations. | Product API: https://www.semanticscholar.org/product/api · Graph docs: https://api.semanticscholar.org/api-docs/graph · Recs: https://api.semanticscholar.org/api-docs/recommendations | B / F | **steal** — primary graph backend for dual-shelf ranking |
| 16 | **LitSearch** (Princeton) | Retrieval benchmark (597 NL queries) for scientific literature search systems. | Paper: https://aclanthology.org/2024.emnlp-main.840/ · Code: https://github.com/princeton-nlp/LitSearch | B (eval) | **adapt** — eval harness for ResearchOS retrieval, not end-user UX |

---

## C. Claim–evidence / PaperQA-style RAG agents

| # | Name | One-line what it does | URL | Bucket | Fit |
|---|---|---|---|---|---|
| 17 | **PaperQA2** (FutureHouse) | Agentic scientific RAG: paper search → gather evidence (RCS) → cited answer; citation traversal; LitQA-strong. | Code: https://github.com/Future-House/paper-qa · Paper: https://arxiv.org/abs/2409.13740 · News: https://www.futurehouse.org/news/paperqa2-achieves-sota-performance-on-rag-qa-arena-science-benchmark | C | **steal** — evidence summaries + citations as default answer contract |
| 18 | **FutureHouse Platform** (Crow / Falcon / Owl / Phoenix) | Hosted science agents: Crow (concise lit Q&A), Falcon (deep review), Owl (“has anyone done X?”), Phoenix (chem tools). | Platform: https://platform.futurehouse.org · Launch: https://www.futurehouse.org/news/launching-futurehouse-platform-ai-agents | C / G | **adapt** — API patterns; Owl for novelty checks; keep answers provisional for students |
| 19 | **Aviary** | Framework for training language agents on hard scientific tasks (literature, biology); “Crow” agents. | https://www.futurehouse.org/research/aviary · Code: https://github.com/Future-House/aviary | C / F | **adapt** — agent training/eval scaffold, not student-facing mill |
| 20 | **OpenScholar** | Open RAG over ~45M OA papers; citation-backed synthesis; ScholarQABench. | Paper: https://arxiv.org/html/2411.14199 · Code: https://github.com/AkariAsai/OpenScholar | C | **steal** — open attribution-first synthesis |
| 21 | **Ai2 Scholar QA / Asta “Summarize literature”** | Organized literature synthesis with attribution; folded into Ai2 Asta research assistant. | Paper: https://arxiv.org/abs/2504.10861 · Lib: https://github.com/allenai/ai2-scholarqa-lib · Asta: https://asta.allen.ai/ · Blog: https://allenai.org/blog/asta | C / G | **steal** — sectioned attributed reports; open stack |
| 22 | **Scite** | Smart Citations: support / contrast / mention context on how papers are cited. | https://scite.ai/ | C / G | **steal** — claim stance column in evidence ledger |
| 23 | **LitQA / LAB-Bench** | Benchmarks for full-text scientific Q&A and source retrieval (used to score PaperQA-class systems). | https://github.com/Future-House/litqa · AstaBench: https://allenai.org/asta/bench · https://github.com/allenai/asta-bench | C (eval) | **adapt** — quality gates before shipping ResearchOS RAG |

---

## D. Survey / outline agents

| # | Name | One-line what it does | URL | Bucket | Fit |
|---|---|---|---|---|---|
| 24 | **STORM / Co-STORM** (Stanford OVAL) | Researches a topic via perspective-guided Qs + simulated expert dialogue; outline then long article with citations; Co-STORM adds human-in-discourse. | Code: https://github.com/stanford-oval/storm · Paper: https://arxiv.org/abs/2402.14207 | D | **adapt** — **outline + perspectives** for related-work; Co-STORM HITL; avoid auto-publishing Wikipedia articles as “student papers” |
| 25 | **AutoSurvey** | Parallel outline drafts → merged outline → parallel subsection writing + revision with RAG over retrieved papers. | Paper: https://arxiv.org/html/2406.10252 · Code: https://github.com/AutoSurveys/AutoSurvey | D | **adapt** — outline merge UI; stop before unsupervised full-survey generation as core |
| 26 | **SurveyX** | Prep + generation phases with online retrieval, AttributeTree preprocessing, re-polish; aims at human-comparable surveys. | Paper: https://arxiv.org/abs/2502.14776 · Code: https://github.com/IAAR-Shanghai/SurveyX · Site: http://www.surveyx.cn | D | **adapt** — structure/citation quality metrics; human approve outline first |

---

## E. End-to-end lab agents — **CAUTION / what not to copy for core UX**

> **ResearchOS policy:** These systems are important to *understand* (competitors, advisors will ask). Default product should **not** be “idea → code → fake paper → auto-review.” Prefer co-pilot stages with mandatory human gates (Agent Laboratory’s finding: human feedback improves quality).

| # | Name | One-line what it does | URL | Bucket | Fit |
|---|---|---|---|---|---|
| 27 | **The AI Scientist** (Sakana) | Fully automated ML research loop: ideation, lit search, experiments, paper writing, simulated review (~$15/paper claims). | arXiv: https://arxiv.org/abs/2408.06292 · Code: https://github.com/SakanaAI/AI-Scientist | E | **avoid-core** — antithesis of “human decides”; study failure modes (hallucinated novelty, weak eval) |
| 28 | **The AI Scientist-v2** | Agentic tree search; workshop-level automated discovery claims. | arXiv: https://arxiv.org/abs/2504.08066 · Code: https://github.com/SakanaAI/AI-Scientist-v2 | E | **avoid-core** — same caution; optional advanced “sandbox” only |
| 29 | **Agent Laboratory** | Human-provided idea → literature, experimentation, report; autonomous or co-pilot modes; human feedback helps a lot. | arXiv: https://arxiv.org/abs/2501.04227 · Code: https://github.com/SamuelSchmidgall/AgentLaboratory | E | **adapt** stage scaffolding; **avoid-core** unsupervised paper emission |
| 30 | **AgentRxiv** | Shared preprint-like archive where research agents upload/retrieve/build on each other’s work. | arXiv: https://arxiv.org/abs/2503.18102 (tied to Agent Laboratory ecosystem) | E | **avoid-core** for student ResearchOS; fascinating for agent-science meta-research |
| 31 | **CycleResearcher** | Automated research improved via automated review loops. | arXiv: https://arxiv.org/abs/2411.00816 | E | **avoid-core** — auto-review ≠ learning to peer-review |
| 32 | **AI-Researcher** (HKUDS) | Autonomous pipeline from literature/idea through algorithm design/validation to manuscript. | https://arxiv.org/html/2505.18705 · Code: https://github.com/HKUDS/AI-Researcher | E | **avoid-core** |
| 33 | **NovelSeek** | Closed-loop agent-as-scientist from hypothesis to verification. | https://arxiv.org/html/2505.16938 | E | **avoid-core** |
| 34 | **Robin** (FutureHouse) | Multi-agent discovery chaining lit agents + experiment proposal/analysis (e.g. drug candidate case study). | Paper: https://arxiv.org/pdf/2505.13400 · Code: https://github.com/Future-House/robin | E / C | **adapt** specialist chaining; **avoid-core** as default student UX |
| 35 | **Virtual Lab** (Stanford Zou group) | Human-guided multi-agent “lab meetings” that designed nanobodies with wet-lab validation (Nature 2025). | bioRxiv: https://www.biorxiv.org/content/10.1101/2024.11.11.623004v1 · Nature: https://www.nature.com/articles/s41586-025-09442-9 · Code: https://github.com/zou-group/virtual-lab | E | **adapt** — meeting/role protocol with PI human; domain-specific tools |

---

## F. Open APIs & infra

| # | Name | One-line what it does | URL | Bucket | Fit |
|---|---|---|---|---|---|
| 36 | **OpenAlex** | Free comprehensive scholarly graph (works, authors, institutions, concepts, citations); REST API + dumps; agent-friendly docs (`llms.txt`). | Docs: https://docs.openalex.org/ · Help: https://help.openalex.org/ · API: https://api.openalex.org/ | F | **steal** — default metadata/citation backend |
| 37 | **arXiv API** | Atom query API for preprint search/metadata (and HTML/PDF retrieval patterns). | https://info.arxiv.org/help/api/user-manual.html | F | **steal** — CS/physics frontier feed |
| 38 | **Crossref REST API** | DOI registration metadata, references, funders — polite pool with mailto. | https://api.crossref.org/ · Guide hub: https://researchguides.smu.edu.sg/api-list/metadata-api | F | **steal** — DOI truth source |
| 39 | **Unpaywall / OA links** | Best OA PDF/HTML location for a DOI (also surfaced via OpenAlex). | https://api.unpaywall.org/ · OpenAlex OA notes: https://help.openalex.org/access/unpaywall/ | F | **steal** — full-text fetch for RAG |
| 40 | **CORE API** | Aggregated repository full text / metadata for OA literature. | https://core.ac.uk/documentation/api | F | **adapt** — secondary full-text source |
| 41 | **langchain-openalex** | LangChain tools/retriever for OpenAlex search & work lookup (PyPI, Oct 2026). | https://pypi.org/project/langchain-openalex/ | F | **adapt** — quick prototype wiring (pin versions; community packages churn) |
| 42 | **LangChain ArxivRetriever** | Classic community retriever for arXiv abstracts/full text. | https://reference.langchain.com/python/langchain-community/retrievers/arxiv/ArxivRetriever | F | **adapt** — note langchain-community sunset trajectory; prefer dedicated packages |
| 43 | **Ai2 AstaBench** | Benchmark suite for AI agents for science (includes ScholarQA-style tasks). | https://allenai.org/asta/bench · https://github.com/allenai/asta-bench | F (eval) | **adapt** — regression suite for ResearchOS agents |

---

## G. Product UIs (student-facing inspiration)

| # | Name | One-line what it does | URL | Bucket | Fit |
|---|---|---|---|---|---|
| 44 | **Elicit** | Evidence-first research reports, systematic-review-style extraction tables, library, Routines, Research Agent, API/MCP (2026). | https://elicit.com/ | G / C | **steal** — tables + sentence-level citations + human-editable report scope |
| 45 | **Consensus** | Ask a research question; get consensus-style answers grounded in papers. | https://consensus.app/ | G | **adapt** — “what does the literature say?” widget; verify sources |
| 46 | **SciSpace** | All-in-one: search, PDF chat, extraction, cited answers, writing helpers (formerly Typeset). | https://scispace.com/ *(automated WebFetch often 403; URL confirmed via library guides)* | G | **adapt** — PDF companion UX; don’t copy uncritical “write my paper” flows |
| 47 | **Ai2 Asta** | Scholarly assistant over 108M+ abstracts / 12M+ full texts: find papers, generate report, analyze data, generate theories (beta). | https://asta.allen.ai/ | G / C | **adapt** — open product reference for ResearchOS IA |
| 48 | **NotebookLM** (Google) | Grounded notebook over *user-uploaded* sources (PDFs/notes) for synthesis Q&A. | Product docs / app via Google (widely used in 2025–2026 research workflow guides) | G | **adapt** — “your corpus only” mode reduces hallucination vs open-web agents |
| 49 | **Perplexity** (Deep Research-style) | General web/agent search with citations; useful for topic mapping, weaker for systematic lit review. | https://www.perplexity.ai/ | G | **adapt** — early exploration only; not evidence ledger |
| 50 | **ChatGPT Deep Research** | Multi-step open-web research briefs; citations need verification (library guidance). | OpenAI product (ChatGPT) | G | **adapt** — competitor pattern; ResearchOS should prefer scholarly APIs over open web |

---

## Recommended “steal stack” for ResearchOS core (opinionated)

1. **Direction → RQ:** CoQuest + IdeaSynth facets + IRIS steerability (**human pick gate**).  
2. **Dual shelf:** Connected Papers / Litmaps interaction model on **OpenAlex + Semantic Scholar** graphs; label foundational vs frontier explicitly.  
3. **Answer contract:** PaperQA2 / OpenScholar / Asta ScholarQA — every claim → span + paper ID; Scite stance column.  
4. **Outline assist:** STORM/AutoSurvey *outline stage only*, user edits before any long prose.  
5. **Fence:** AI Scientist / CycleResearcher / AgentRxiv-style loops stay in a labeled **Sandbox / CAUTION** module, never default home.

---

## Explicit non-goals (product)

- Autonomous paper mills that submit, peer-review-simulate, or claim “accepted workshop paper” without a human PI.  
- Replacing the student’s ability to read, argue, and choose RQs.  
- Invented citations or DOI-free “evidence.”

---

## Source hygiene checklist for implementers

- Prefer DOI / OpenAlex ID / S2 paperId on every node.  
- Separate **parametric LLM knowledge** from **retrieved evidence** in the UI.  
- Log agent tool traces (search queries, chunk IDs) into Replay.  
- Eval: LitSearch (retrieval), LitQA/AstaBench (QA), human accept rate on RQ cards.

---

## Count

**50 curated entries** across A–G (including eval/infra). All names above are attested via search/fetch as of **2026-10-23 (UTC+8)**. Where automated fetch was thin or blocked (some GitHub HTML, SciSpace 403, OpenAlex marketing bot-wall), the **URL still points at the real project**; do not treat thin fetch as non-existence.

---

*Companion doc:* `/workspace/docs/skill-survey-research-guidance.md` (skill proposals that consume this stack).
