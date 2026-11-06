# UI direction: Muse → Research companion

- Date: 2026-10-24
- Meta **Muse** (https://ai.meta.com/muse/) is **not open source**.
- Closest open interaction model: [OpenMuse](https://github.com/CopilotKit/openmuse) (chat + activity/plan + rich cards + agent computer). Other canvas IDEs (Cate/OpenUI) are coding-agent mission control — different job.

## What we stole for ResearchOS

| Muse (life agent) | ResearchOS (research agent) |
|-------------------|-----------------------------|
| Feels like messaging a person | Single chat thread, bubbles |
| Large bottom composer | Same |
| Suggested prompts | Research interest prompts |
| Action plan / goals while working | 5-step P0 plan card |
| Approve spend/send | Direction candidate cards (human lock) |
| Browser / doc widgets in thread | Dual-shelf + evidence ledger cards |
| Side chats / workspace | Rail → workspace snapshot |

## Explicit non-goals

- Do not clone Meta branding, avatar IP, or “Muse” name in product chrome
- Do not auto-send / auto-publish papers (our non-goal remains)

## Demo

Refresh `http://127.0.0.1:8765/` — chat-first shell; send any interest to run `p0-chain`.
