# ResearchOS / Research Companion — Skill Survey: Research Guidance & Literature

**Purpose.** Map products, papers, and agent-skill patterns onto a student Research Companion that (1) guides BIG direction → SMALL questions, (2) surfaces foundational + frontier work, (3) improves project skills. Existing modules: **Radar / ReproBox / Debugger / LabLens / Replay**. Existing skills: `project-gap-audit`, `module-spec`, `pilot-eval-design`, `evidence-ledger`. **Gap:** literature search, paper comparison, and planning skills.

**Method note.** WebSearch + WebFetch (2026-10-23, user zone UTC+8). Product claims below are from vendor pages / papers as cited. **Fetch failures:** `https://scispace.com/` → 403 Forbidden; `https://openalex.org/` → bot wall (API docs usable). Do not invent paper results beyond what those sources state.

---

## A) Proposed ResearchOS skills (8)

Each skill is kebab-case, maps to the vision, and feeds an existing module where possible.

### 1. `direction-framing`
| | |
|---|---|
| **Purpose** | Guide the user from vague interest → 1–3 candidate **BIG** research directions with scope, constraints, and “why now.” |
| **Inputs** | Topic dump / course brief; optional advisor constraints; time/compute budget; prior `project-gap-audit` output. |
| **Outputs** | Direction cards: problem space, stakeholders, constraints, risk/novelty notes, suggested next skill (`rq-decomposition`). |
| **Quality checks** | Each direction is falsifiable in principle; constraints explicit; no invented citations; user must pick or merge before proceeding. |
| **Feeds** | **Radar** (topic watch seeds); **Replay** (decision trail). |

### 2. `rq-decomposition`
| | |
|---|---|
| **Purpose** | Turn a chosen BIG direction into a tree of **SMALL** concrete research questions (RQs), with PECOS/PICO-style slots where useful. |
| **Inputs** | Selected direction card; success criteria; resource limits. |
| **Outputs** | RQ tree (must-answer / nice-to-have / out-of-scope); operationalization hints (data, metric, baseline). |
| **Quality checks** | Each leaf RQ is answerable in one pilot; parent–child coverage without duplication; out-of-scope list non-empty. |
| **Feeds** | **Radar** (query seeds); `pilot-eval-design`; **Replay**. |

### 3. `seed-paper-neighborhood`
| | |
|---|---|
| **Purpose** | From 1–N seed papers (or a seed RQ), expand a **citation / similarity neighborhood** and label **foundational vs frontier**. |
| **Inputs** | Seed DOIs/titles/PDFs; preferred venues; year cutoffs; OpenAlex / Semantic Scholar IDs if available. |
| **Outputs** | Graph or ranked lists: prior works, derivatives, similar works; tags `{foundational, survey, sota/frontier, contested}`; BibTeX/CSV for `evidence-ledger`. |
| **Quality checks** | Every node has DOI or stable ID; foundational ≠ “high citation only” (also: surveys, canonical methods, early definitions); frontier has recency *and* topical centrality; duplicates merged. |
| **Feeds** | **Radar**; **LabLens** (reading queue); `evidence-ledger`. |

### 4. `foundational-frontier-split`
| | |
|---|---|
| **Purpose** | Explicit dual shelf for one RQ: **must-read foundations** vs **must-track frontier**, with a short “bridge” narrative. |
| **Inputs** | Neighborhood from `seed-paper-neighborhood`; RQ text. |
| **Outputs** | Two annotated shortlists (e.g. 5–8 each) + bridge paragraph + open questions. |
| **Quality checks** | No shelf empty without justified reason; each paper has 1-line “role for *this* RQ”; contradictions flagged for Scite-style follow-up. |
| **Feeds** | **LabLens**; **Radar** (frontier alerts); `module-spec`. |

### 5. `claim-evidence-map`
| | |
|---|---|
| **Purpose** | Link project claims / hypotheses to passages and citation stance (support / contradict / mention), for auditability. |
| **Inputs** | Claim list (from `evidence-ledger` or user); paper set / PDFs; optional Smart Citation tallies. |
| **Outputs** | Claim → evidence rows (quote/span, paper ID, stance, confidence, “needs human verify”). |
| **Quality checks** | Every affirmative claim has ≥1 grounded span or is marked unsupported; zero fabricated DOIs; unsure preferred over wrong. |
| **Feeds** | `evidence-ledger`; **Debugger** (failed assumptions); **Replay**. |

### 6. `survey-outline-assist`
| | |
|---|---|
| **Purpose** | Produce a **human-editable** related-work / mini-survey outline (not a fake paper), from RQ + paper set. |
| **Inputs** | RQ; curated paper set; target length / section count. |
| **Outputs** | Hierarchical outline with section intents, assigned papers, and “gaps / empty clusters” callouts. |
| **Quality checks** | Outline cites only papers in the set (or flagged for retrieval); coverage vs structure scores recorded; user must approve before prose generation. |
| **Feeds** | **LabLens**; writing path into `module-spec` / reports; **Replay**. |

### 7. `paper-compare-matrix`
| | |
|---|---|
| **Purpose** | Structured comparison of methods/datasets/results across N papers for design decisions. |
| **Inputs** | Paper set (PDFs or structured extractions); comparison dimensions (task, data, metric, compute, limitations). |
| **Outputs** | Evidence table + “what to steal / avoid for *our* pilot” bullets. |
| **Quality checks** | Cell values tied to source spans; missing cells marked unknown (not hallucinated); extraction prompts versioned. |
| **Feeds** | `pilot-eval-design`; **ReproBox** (baselines to re-run); **LabLens**. |

### 8. `lit-plan-and-monitor`
| | |
|---|---|
| **Purpose** | Turn literature work into a timeboxed plan + monitoring queries (weekly frontier digests). |
| **Inputs** | RQ tree; foundational/frontier shelves; calendar / milestone. |
| **Outputs** | Reading schedule; search strings / OpenAlex–S2 queries; alert criteria; “stop reading” criteria. |
| **Quality checks** | Plan fits stated hours; each milestone links to an RQ leaf; alerts tied to saved queries (reproducible). |
| **Feeds** | **Radar**; **Replay**; routines if scheduled digests exist. |

---

## B) Inspirations (product / paper → skill)

| Skill | Primary inspirations | URLs |
|---|---|---|
| `direction-framing` | ResearchAgent (problem identification from core paper + citation graph + entity store); Agent Laboratory (human idea as input; co-pilot framing); STORM (perspective-guided question asking) | https://arxiv.org/abs/2404.07738 · https://aclanthology.org/2025.naacl-long.342/ · https://agentlaboratory.github.io/ · https://arxiv.org/abs/2501.04227 · https://storm-project.stanford.edu/research/storm/ · https://arxiv.org/abs/2402.14207 |
| `rq-decomposition` | STORM (multi-perspective Q&A → outline); Elicit Research Agent (question → search/extract/synthesize); Consensus (ask full RQ, evidence-backed insights) | https://storm-project.stanford.edu/research/storm/ · https://elicit.com/solutions/research-agent · https://consensus.app/home/features/literature-review/ |
| `seed-paper-neighborhood` | Connected Papers (similarity graph; Prior / Derivative Works); ResearchRabbit (collections; similar / earlier / later); Litmaps (seed maps + monitoring); Google Scholar Related / Cited by; Semantic Scholar Recommendations API; OpenAlex works graph | https://www.connectedpapers.com/ · https://www.researchrabbit.ai/ · https://www.litmaps.com/ · https://scholar.google.com/ · https://www.semanticscholar.org/product/api · https://docs.openalex.org/ (site `openalex.org` bot-blocked on fetch) |
| `foundational-frontier-split` | Connected Papers Prior vs Derivative; ResearchRabbit Earlier vs Later; Litmaps date×cite orientation; Semantic Scholar TLDRs / recommendations | (same neighborhood URLs) · https://www.semanticscholar.org/ |
| `claim-evidence-map` | PaperQA (search → gather evidence → answer with citations; LitQA); Scite Smart Citations (support / contradict / mention); Elicit (claim ↔ passage); Consensus (claim ↔ paper) | https://arxiv.org/abs/2312.07559 · https://github.com/Future-House/paper-qa · https://scite.ai/ · https://docs.scite.ai/guides/smart-citations · https://elicit.com/solutions/research-agent · https://consensus.app/home/features/literature-review/ |
| `survey-outline-assist` | STORM (pre-writing outline via retrieval + multi-perspective questions); AutoSurvey (retrieve → outline → parallel subsections → refine → multi-LLM eval) | https://storm-project.stanford.edu/research/storm/ · https://arxiv.org/abs/2402.14207 · https://arxiv.org/abs/2406.10252 · https://github.com/AutoSurveys/AutoSurvey · NeurIPS 2024 proceedings PDF: https://proceedings.neurips.cc/paper_files/paper/2024/file/d07a9fc7da2e2ec0574c38d5f504d105-Paper-Conference.pdf |
| `paper-compare-matrix` | Elicit (tables / systematic-review-style extraction); Consensus study snapshots & evidence tables; SciSpace Copilot / Agent (paper Q&A, multi-tool research) — **homepage fetch 403**; Semantic Reader (in-context citations for reading) | https://elicit.com/solutions/research-agent · https://consensus.app/home/features/literature-review/ · https://scispace.com/ (403 on fetch; features also described at https://scispace.com/resources/introducing-copilot-ai-assistant-explains-research-papers/ and https://scispace.com/resources/scispace-ai-research-super-agent/) · https://www.semanticscholar.org/product/semantic-reader · https://openreader.semanticscholar.org/ |
| `lit-plan-and-monitor` | Litmaps Monitor; ResearchRabbit iterative collections; Radar module fit; Claude/Cursor **SKILL.md** lit-review patterns (search log, screen, extract, verify) | https://www.litmaps.com/ · https://www.researchrabbit.ai/ · examples: https://github.com/taoyunudt/literature-review-skill · https://github.com/mronkko/claude-academic-research/blob/main/skills/systematic-review/SKILL.md |

**Also relevant (cross-cutting):**
- **Semantic Scholar / Semantic Reader:** https://www.semanticscholar.org/ · API https://www.semanticscholar.org/product/api · Reader https://www.semanticscholar.org/product/semantic-reader
- **OpenAlex:** API-oriented access https://docs.openalex.org/ · semantic search help https://help.openalex.org/api/semantic-search/ (marketing site blocked automated fetch)
- **Notebook-centric agents:** Hugging Face Jupyter Agent https://github.com/huggingface/jupyter-agent/ — patterns for **ReproBox** / experiment notebooks, not lit discovery
- **Agent Laboratory:** human-guided lit → experiment → report; co-pilot > full autonomy for quality https://agentlaboratory.github.io/ · https://arxiv.org/abs/2501.04227
- **The AI Scientist (Sakana):** end-to-end idea → code → experiment → manuscript → auto-review loop https://sakana.ai/ai-scientist/ · https://arxiv.org/abs/2408.06292 — see §D for what **not** to copy

---

## C) Recommended build order (for *this* student project)

Prioritize **direction → question → foundational + frontier papers**, then comparison / claims, then survey prose & monitoring.

### P0 (ship first — closes the stated gap)
1. **`direction-framing`** — cheap, no corpus required; unblocks everything.
2. **`rq-decomposition`** — produces searchable, pilot-sized questions.
3. **`seed-paper-neighborhood`** — wire OpenAlex and/or Semantic Scholar (APIs); optional Connected Papers–style prior/derivative labels.
4. **`foundational-frontier-split`** — thin skill on top of neighborhood; directly matches vision item 2.

*Wire into:* Radar (seeds + alerts stub), LabLens (reading queue), Replay (choices), `evidence-ledger` (paper IDs).

### P1 (next — design quality & rigor)
5. **`paper-compare-matrix`** — feeds `pilot-eval-design` and ReproBox baselines.
6. **`claim-evidence-map`** — harden `evidence-ledger`; PaperQA-style retrieve-and-cite on *local* PDFs before any web assistant tone.
7. **`survey-outline-assist`** — STORM/AutoSurvey **outline-only** first; human approve before long prose.
8. **`lit-plan-and-monitor`** — Litmaps-like monitors into Radar; schedule digests.

### Explicit non-goals for early milestones
- Full AutoSurvey-length generated surveys as default UX.
- Autonomous experiment loops (AI Scientist / Agent Laboratory autonomous mode).
- Replacing advisor judgment or systematic-review methodology.

---

## D) What NOT to copy (over-scoped auto-scientist loops)

| Pattern | Why skip / narrow for ResearchOS | Source |
|---|---|---|
| **The AI Scientist open-ended loop** (idea → edit code → run → write paper → auto peer-review → archive → repeat) | Over-scope for a *guidance* companion; known issues: unfair baselines, weak numeracy, layout blindness, unsafe self-modification of run scripts; ethics/load on venues if mass-submitted | https://sakana.ai/ai-scientist/ |
| **Agent Laboratory full autonomous paper mill** | Their own human eval: autonomous papers score well below NeurIPS accept averages; co-pilot mode is the useful lesson (“you are the pilot”) | https://agentlaboratory.github.io/ |
| **AutoSurvey as one-click publishable survey** | Strong for outline+RAG speed; still has citation errors (misalignment, misinterpretation, overgeneralization). Copy **pipeline stages + citation metrics**, not “trust the PDF” | https://arxiv.org/abs/2406.10252 |
| **Consensus Meter / vote-counting as “truth”** | Useful for scoping agreement; not a meta-analysis (quality, effect size, bias not weighted). Keep as UI hint only | Consensus product + independent commentary (e.g. librarian writeups) |
| **Unverified LLM systematic reviews** | Independent work: incomplete recall, hallucinations/reference issues; Elicit best as human-supervised extraction aid, not standalone SR | Product pages + methodological studies citing Elicit/Consensus limitations |
| **ResearchAgent-style “novel idea generator” as the product core** | Valuable as *optional* ideation assist *after* RQ framing; do not let novelty theater replace gap audit + evidence ledger | https://arxiv.org/abs/2404.07738 |

**Design rule of thumb for ResearchOS:** assist **framing, retrieval, comparison, and evidence hygiene**; keep humans in the loop for direction choice, inclusion decisions, and any claim that enters the ledger. Automate the rabbit hole map—not the science career loop.

---

## Appendix — Quick product cheat sheet (as loaded)

| Tool | Role for ResearchOS | Official / primary URL | Fetch note |
|---|---|---|---|
| Elicit | RQ → search, extract, tables, cited reports | https://elicit.com/solutions/research-agent | OK |
| Consensus | RQ search, study snapshots, lit-review features | https://consensus.app/home/features/literature-review/ | OK |
| Scite | Smart Citations + grounded assistant | https://scite.ai/ | OK |
| ResearchRabbit | Seed → collection / citation rabbit hole | https://www.researchrabbit.ai/ | OK |
| Connected Papers | Single-seed similarity graph; prior/derivative | https://www.connectedpapers.com/ | OK |
| Litmaps | Seed maps + literature monitoring | https://www.litmaps.com/ | OK |
| Semantic Scholar / Reader | Search, graph API, AI reading (arXiv-heavy Reader) | https://www.semanticscholar.org/ · https://www.semanticscholar.org/product/semantic-reader | OK |
| OpenAlex | Open scholarly graph / semantic search API | https://docs.openalex.org/ · https://help.openalex.org/api/semantic-search/ | Homepage bot wall |
| SciSpace (Typeset) | Paper explain / multi-tool research agent | https://scispace.com/ | **403 on fetch** |
| Google Scholar | Related articles + Cited by chaining | https://scholar.google.com/ | Manual UX; no official open API |

---

## Fit with existing ResearchOS skills

| Existing | How new skills help |
|---|---|
| `project-gap-audit` | Consumes `foundational-frontier-split` + `paper-compare-matrix` to ground gaps in literature, not vibes. |
| `module-spec` | Uses RQ leaves + compare matrix to scope Radar/ReproBox/LabLens features. |
| `pilot-eval-design` | Takes compare-matrix baselines and RQ operationalization. |
| `evidence-ledger` | Filled by `claim-evidence-map` and neighborhood exports; never by uncited model prose. |

*End of survey. Paste-ready for `docs/skill-survey-research-guidance.md`.*
