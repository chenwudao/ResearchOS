# Evidence ledger

- Question: Does dual-shelf (foundational vs frontier) briefing raise claim-citation coverage vs chatbot-only search for one course RQ?
- Mode: sample

| claim_id | claim | type | source | locator | support | status | notes |
|---|---|---|---|---|---|---|---|
| C1 | Method X improves metric Y on dataset Z | finding | Smith et al. 2024 | p.12 / Table 2 | supports | verified | demo row |
| C2 | Training fits in one GPU-week | plan-premise | none | none | unknown | gap | needs compute evidence |
| S3 | Method origin for retrieve-and-cite evidence hygiene | finding | arxiv:2312.07559 | demo-shelf | supports | verified | foundational: Template for ledger-backed claims |
| S4 | Survey/method origin for perspective-guided questioning | finding | arxiv:2402.14207 | demo-shelf | supports | verified | foundational: Pre-writing structure without publishable-final claim |
| S5 | Recent RQ/idea generation from papers + graphs | finding | aclanthology:2025.naacl-long.342 | demo-shelf | supports | verified | frontier: Frontier seed-anchored problem finding |
| S6 | Human-in-the-loop RQ co-creation | finding | arxiv:2310.06155 | demo-shelf | supports | verified | frontier: Supports guided, not auto-decided, direction/RQ skills |
| G7 | Dual-shelf UI improves student citation coverage by X% | plan-premise | none | none | unknown | gap | No local pilot data yet — needs pilot-eval-design run |

## Gaps

- C2: no primary source (depends_on_plan=True)
- G7: No local pilot data yet — needs pilot-eval-design run (depends_on_plan=True)
