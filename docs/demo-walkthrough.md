# ResearchOS demo walkthrough (P0 sample)

- Date: 2026-10-23
- Mode: **sample** (returns structured fixtures + writes artifacts; not live OpenAlex yet)

## Start

```bash
cd "桌面/reasearchos agent/demo"
./start.sh
# open http://127.0.0.1:8765
```

## One-click P0 chain

1. Optional: fill 兴趣 / 种子论文（arxiv/DOI）
2. Click **跑 P0 全链**
3. Or: `GET/POST /api/skills/run/p0-chain?interest=...&seed=...`

Order:

1. `direction-framing`
2. `rq-decomposition`
3. `seed-paper-neighborhood`
4. `foundational-frontier-split`
5. `evidence-ledger`

## Where outputs land

| Step | Artifact |
|------|----------|
| each skill | `demo/output/<skill>-latest.json` |
| ledger | `demo/output/evidence-ledger-latest.{json,md}` |
| audit trail | `demo/output/run-log.md` |

## Skill specs

See `skills/<name>/SKILL.md` for the four P0 skills + `evidence-ledger`.

## What this is / is not

- **Is:** human-guided spine demo for 方向 → 小问题 → 基础/前沿邻域 → 双栏 → 证据账本
- **Is not:** live paper search, auto-writing papers, or full five-module product

## UI polish (2026-10-24)

Product-style dark console at `http://127.0.0.1:8765/` — pipeline strip, direction cards, RQ cards, dual shelves, evidence ledger table. Hydrates step details via `GET /api/output/<skill>-latest.json`.

Narrative/tagline: see `product-narrative.md`.
