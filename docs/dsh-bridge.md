# ResearchOS ↔ DeepSeek Harness bridge (first cut)

## What’s running

| Process | Port | Role |
| --- | --- | --- |
| ResearchOS demo (`python3 api/main.py`) | `8765` | Shell + skill API + **DSH bridge** |
| DeepSeek Harness (`dsh web` / `npx @deepseek-ai/dsh web --no-open`) | `3080` | Real harness UI / sessions / tools |

ResearchOS keeps project chat in a local SQLite database. DSH sessions, when created inside DSH, live under `~/.dsh/` (expected `sessions/` after real chats; `DSH_HOME` overrides the root).

## Auth constraint (why this bridge shape)

`dsh web` prints a process launch URL once:

```text
dsh web: http://127.0.0.1:3080/?token=...
```

Only `GET /?token=...` exchanges that token for an **HttpOnly + SameSite=Strict** cookie. The token is **not** accepted on `/api/*` or `Authorization`. So the ResearchOS page on `:8765` cannot silently reuse the DSH cookie cross-port.

First-cut bridge therefore:

1. Probe DSH from the ResearchOS backend (`GET /api/dsh/status`).
2. Redirect **this browser** through `GET /api/dsh/open` → launch URL (sets the DSH cookie for `127.0.0.1:3080`).
3. Optional composer handoff: `POST /api/dsh/handoff` stores the prompt (+ clipboard) so you can paste into DSH. Full typért session RPC over `WS /api/remote.mux` is **next cut**.

## Endpoints (ResearchOS :8765)

- `GET /api/dsh/status` — listening? has launch token? server-side cookie valid? (never returns the raw token)
- `GET /api/dsh/open` — `302` to the stored launch URL (or bare `:3080/` if missing)
- `POST /api/dsh/launch-url` — body `{ "launch_url": "http://127.0.0.1:3080/?token=..." }` after a DSH restart
- `GET|POST /api/dsh/handoff` — read / save a prompt handoff

Local secret state: `demo/.local/dsh-bridge.json` (mode `0600`). **Do not commit or paste.**

## Shell UX

- Topbar **DSH** button — status label + open harness
- Composer **在 DSH 继续** — save handoff, copy prompt, open harness

## Try it

1. Confirm DSH: `curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3080/` → `401` means up but unauthed.
2. Confirm bridge: `curl -sS http://127.0.0.1:8765/api/dsh/status`
3. Hard-refresh ResearchOS: `http://127.0.0.1:8765/`
4. Click **DSH** once (browser must follow redirect to `:3080/?token=...`).
5. Inside DSH: Settings → Models → add DeepSeek API key if composer stays disabled; Choose workspace → ResearchOS project folder if asked.

## After `dsh web` restart

Launch token rotates. Paste the new printed URL:

```bash
curl -sS -X POST http://127.0.0.1:8765/api/dsh/launch-url \
  -H 'Content-Type: application/json' \
  -d '{"launch_url":"http://127.0.0.1:3080/?token=PASTE"}'
```

## Not in this cut

- Embedding DSH in an iframe (cookie / frame policies make this a poor fit)
- Proxying `listSessions` / `createSession` through typért WS
- Auto-injecting ResearchOS chat history into DSH sessions
