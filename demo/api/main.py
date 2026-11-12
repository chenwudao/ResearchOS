"""ResearchOS demo backend — port 8765 (jerry owns listener; jaden owns /api/skills/run/*)."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime
import json
import re
import urllib.parse
try:
    from dsh_bridge import (
        public_status as dsh_public_status,
        set_launch_url as dsh_set_launch_url,
        resolve_open_url as dsh_resolve_open_url,
        save_handoff as dsh_save_handoff,
        read_handoff as dsh_read_handoff,
    )
except ImportError:  # pragma: no cover - allow running outside demo/api cwd
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent))
    from dsh_bridge import (  # type: ignore
        public_status as dsh_public_status,
        set_launch_url as dsh_set_launch_url,
        resolve_open_url as dsh_resolve_open_url,
        save_handoff as dsh_save_handoff,
        read_handoff as dsh_read_handoff,
    )

import automation
import tasks
from workspace_http import serve as serve_workspace

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
SKILLS = ROOT.parent / "skills"
OUTPUT = ROOT / "output"
PORT = 8765
KNOWN = [
    "project-gap-audit",
    "module-spec",
    "pilot-eval-design",
    "evidence-ledger",
    "direction-framing",
    "rq-decomposition",
    "seed-paper-neighborhood",
    "foundational-frontier-split",
]


def list_skills():
    found = []
    if SKILLS.is_dir():
        for p in sorted(SKILLS.iterdir()):
            if (p / "SKILL.md").is_file():
                found.append(p.name)
    return found or list(KNOWN)


def parse_skill(name: str):
    path = SKILLS / name / "SKILL.md"
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8")
    fm = {}
    body = text
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            for line in parts[1].strip().splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    fm[k.strip()] = v.strip().strip("'\"")
            body = parts[2].strip()
    sections = {}
    current = "_preamble"
    buf = []
    for line in body.splitlines():
        if line.startswith("## "):
            sections[current] = "\n".join(buf).strip()
            current = line[3:].strip()
            buf = []
        else:
            buf.append(line)
    sections[current] = "\n".join(buf).strip()
    return {
        "ok": True,
        "skill": name,
        "name": fm.get("name", name),
        "description": fm.get("description", "").replace(">-", "").strip(),
        "path": str(path),
        "sections": {k: v for k, v in sections.items() if k != "_preamble" or v},
        "mode": "dry-run",
        "note": "Demo returns skill spec only; real agent execution comes later.",
    }


def sample_ledger(question: str = ""):
    q = question or "Demo research question"
    rows = [
        {
            "claim_id": "C1",
            "claim": "Method X improves metric Y on dataset Z",
            "claim_type": "finding",
            "source": "Smith et al. 2024",
            "locator": "p.12 / Table 2",
            "support": "supports",
            "status": "verified",
            "notes": "demo row",
        },
        {
            "claim_id": "C2",
            "claim": "Training fits in one GPU-week",
            "claim_type": "plan-premise",
            "source": "none",
            "locator": "none",
            "support": "unknown",
            "status": "gap",
            "notes": "needs compute evidence",
        },
    ]
    gaps = [{"claim_id": "C2", "reason": "no primary source", "depends_on_plan": True}]
    return {
        "ok": True,
        "skill": "evidence-ledger",
        "question": q,
        "rows": rows,
        "gaps": gaps,
        "mode": "sample",
    }


def sample_pilot(question: str = ""):
    return {
        "ok": True,
        "skill": "pilot-eval-design",
        "question": question or "Demo research question",
        "arms": ["manual", "chatbot", "research_agent"],
        "metrics": ["evidence", "feasibility", "efficiency", "continuity", "cross_platform"],
        "sequence": ["topic", "package", "expert_review", "changed_constraint"],
        "mode": "demo-sample",
    }





def sample_direction_framing(interest: str = ""):
    interest = interest or "flexible practical research assistant for students"
    return {
        "ok": True,
        "skill": "direction-framing",
        "mode": "sample",
        "interest": interest,
        "cards": [
            {
                "id": "A",
                "statement": "Human-guided research companion: direction → RQs → foundational/frontier shelves",
                "why_now": "Course teams need auditable literature packs, not auto-papers",
                "non_goals": ["Autonomous paper writing", "Unverified claim generation"],
                "success": "One demo chain produces dual shelves + gaps for a locked RQ",
            },
            {
                "id": "B",
                "statement": "Citation-graph tooling only (Radar as discovery clone)",
                "why_now": "Strong discovery UX already exists in ResearchRabbit/Connected Papers",
                "non_goals": ["RQ coaching", "Evidence ledger"],
                "success": "Neighborhood graph from one seed DOI",
            },
            {
                "id": "C",
                "statement": "Experiment ReproBox first (run baselines before literature depth)",
                "why_now": "Some labs already know the RQ and need compute hygiene",
                "non_goals": ["Cold-start direction framing"],
                "success": "One baseline re-run with logged config",
            },
        ],
        "decision_prompt": "Pick A/B/C or merge; ResearchOS default recommendation is A.",
        "defaults": {
            "seed_paper": "optional",
            "foundational_rule": "survey + method origin; citations secondary",
        },
    }


def sample_rq_decomposition(direction: str = ""):
    direction = direction or "Human-guided research companion: direction → RQs → foundational/frontier shelves"
    return {
        "ok": True,
        "skill": "rq-decomposition",
        "mode": "sample",
        "direction": direction,
        "rqs": [
            {
                "rq_id": "R1",
                "text": "Does dual-shelf (foundational vs frontier) briefing raise claim-citation coverage vs chatbot-only search for one course RQ?",
                "type": "eval",
                "depends_on": [],
                "evidence_needed": "both",
                "priority": "must",
            },
            {
                "rq_id": "R2",
                "text": "Which citation-graph signals best separate method-origin papers from high-cite surveys for student RQs?",
                "type": "method",
                "depends_on": ["R1"],
                "evidence_needed": "paper",
                "priority": "must",
            },
            {
                "rq_id": "R3",
                "text": "Can a 15-minute direction-framing session produce peer-restatable agendas for novice users?",
                "type": "eval",
                "depends_on": [],
                "evidence_needed": "experiment",
                "priority": "nice",
            },
        ],
        "out_of_scope": [
            "Fully autonomous manuscript generation",
            "Domain-specific wet-lab protocols",
        ],
    }


def sample_seed_paper_neighborhood(seed: str = ""):
    seed = seed or "arxiv:2402.14207"
    return {
        "ok": True,
        "skill": "seed-paper-neighborhood",
        "mode": "sample",
        "seed": seed,
        "prior": [
            {"id": "arxiv:2312.07559", "title": "PaperQA", "relation": "prior evidence-agent line", "tags": ["method-origin"]},
        ],
        "derivative": [
            {"id": "aclanthology:2025.naacl-long.342", "title": "ResearchAgent", "relation": "later RQ/idea agents", "tags": ["sota"]},
        ],
        "similar": [
            {"id": "arxiv:2310.06155", "title": "CoQuest", "relation": "similar human-LLM RQ co-creation", "tags": ["similar"]},
        ],
    }


def sample_foundational_frontier_split(rq: str = ""):
    rq = rq or "Does dual-shelf briefing raise claim-citation coverage vs chatbot-only search?"
    return {
        "ok": True,
        "skill": "foundational-frontier-split",
        "mode": "sample",
        "rq": rq,
        "foundational_rule": "survey + method origin; citation count secondary",
        "foundational": [
            {
                "id": "arxiv:2312.07559",
                "title": "PaperQA",
                "role": "Method origin for retrieve-and-cite evidence hygiene",
                "why": "Template for ledger-backed claims",
            },
            {
                "id": "arxiv:2402.14207",
                "title": "STORM",
                "role": "Survey/method origin for perspective-guided questioning",
                "why": "Pre-writing structure without publishable-final claim",
            },
        ],
        "frontier": [
            {
                "id": "aclanthology:2025.naacl-long.342",
                "title": "ResearchAgent (NAACL 2025)",
                "role": "Recent RQ/idea generation from papers + graphs",
                "why": "Frontier seed-anchored problem finding",
                "year": 2025,
            },
            {
                "id": "arxiv:2310.06155",
                "title": "CoQuest",
                "role": "Human-in-the-loop RQ co-creation",
                "why": "Supports guided, not auto-decided, direction/RQ skills",
                "year": 2023,
            },
        ],
        "bridge": "Foundations supply provenance and questioning structure; frontier adds collaborative RQ agents on academic graphs.",
        "gaps": [
            {
                "claim": "Dual-shelf UI improves student citation coverage by X%",
                "reason": "No local pilot data yet — needs pilot-eval-design run",
            }
        ],
    }



def ingest_split_gaps_to_ledger(split_payload: dict) -> dict:
    """Merge foundational-frontier-split gaps into a sample ledger artifact."""
    rq = split_payload.get("rq") or "from foundational-frontier-split"
    base = sample_ledger(rq)
    rows = list(base.get("rows") or [])
    gaps = list(base.get("gaps") or [])
    # Add verified-ish rows from shelves (demo: mark as needs-locator if only id/title)
    n = len(rows)
    for shelf_name in ("foundational", "frontier"):
        for paper in split_payload.get(shelf_name) or []:
            n += 1
            cid = f"S{n}"
            rows.append({
                "claim_id": cid,
                "claim": paper.get("role") or paper.get("title") or "paper role",
                "claim_type": "finding",
                "source": paper.get("id") or paper.get("title") or "unknown",
                "locator": "demo-shelf",
                "support": "supports",
                "status": "verified" if paper.get("id") else "gap",
                "notes": f"{shelf_name}: {paper.get('why', '')}",
            })
    for g in split_payload.get("gaps") or []:
        n += 1
        cid = f"G{n}"
        rows.append({
            "claim_id": cid,
            "claim": g.get("claim") or "unsupported claim",
            "claim_type": "plan-premise",
            "source": "none",
            "locator": "none",
            "support": "unknown",
            "status": "gap",
            "notes": g.get("reason") or "",
        })
        gaps.append({"claim_id": cid, "reason": g.get("reason") or "from split", "depends_on_plan": True})
    payload = {
        "ok": True,
        "skill": "evidence-ledger",
        "question": rq,
        "rows": rows,
        "gaps": gaps,
        "mode": "sample",
        "upstream": "foundational-frontier-split",
    }
    return write_ledger_artifacts(payload)


def run_p0_chain(interest: str = "", seed: str = "") -> dict:
    """One-click P0 sample chain: direction → RQ → neighborhood → split → ledger."""
    steps = []

    framing = sample_direction_framing(interest)
    card_a = next((c for c in framing.get("cards") or [] if c.get("id") == "A"), None)
    locked_direction = (card_a or {}).get("statement") or (
        (framing.get("cards") or [{}])[0].get("statement") or ""
    )
    framing["demo_locked_direction"] = locked_direction
    framing_out = write_json_artifact("direction-framing", framing)
    steps.append({
        "skill": "direction-framing",
        "artifacts": framing_out.get("artifacts"),
        "summary": "Locked card A: %s" % (locked_direction[:120],),
    })

    rq_payload = sample_rq_decomposition(locked_direction)
    r1 = next((r for r in rq_payload.get("rqs") or [] if r.get("rq_id") == "R1"), None)
    locked_rq = (r1 or {}).get("text") or (
        (rq_payload.get("rqs") or [{}])[0].get("text") or ""
    )
    rq_payload["demo_locked_rq"] = locked_rq
    rq_out = write_json_artifact("rq-decomposition", rq_payload)
    steps.append({
        "skill": "rq-decomposition",
        "artifacts": rq_out.get("artifacts"),
        "summary": "Locked R1: %s" % (locked_rq[:120],),
    })

    neigh = sample_seed_paper_neighborhood(seed)
    neigh_out = write_json_artifact("seed-paper-neighborhood", neigh)
    steps.append({
        "skill": "seed-paper-neighborhood",
        "artifacts": neigh_out.get("artifacts"),
        "summary": "Seed neighborhood for %s" % (neigh.get("seed") or seed or "default",),
    })

    split = sample_foundational_frontier_split(locked_rq)
    split_out = write_json_artifact("foundational-frontier-split", split)
    steps.append({
        "skill": "foundational-frontier-split",
        "artifacts": split_out.get("artifacts"),
        "summary": "Foundational=%d frontier=%d gaps=%d"
        % (
            len(split.get("foundational") or []),
            len(split.get("frontier") or []),
            len(split.get("gaps") or []),
        ),
    })

    ledger = ingest_split_gaps_to_ledger(split)
    steps.append({
        "skill": "evidence-ledger",
        "artifacts": ledger.get("artifacts"),
        "summary": "rows=%d gaps=%d" % (
            len(ledger.get("rows") or []),
            len(ledger.get("gaps") or []),
        ),
    })

    append_run_log(
        "p0-chain",
        "interest=%r seed=%r steps=%d" % ((interest or "")[:60], (seed or "")[:40], len(steps)),
        "; ".join(
            (s.get("artifacts") or {}).get("json")
            or (s.get("artifacts") or {}).get("markdown")
            or ""
            for s in steps
        ),
    )

    return {
        "ok": True,
        "skill": "p0-chain",
        "mode": "sample",
        "interest": interest or framing.get("interest"),
        "seed": seed or neigh.get("seed"),
        "demo_locked_direction": locked_direction,
        "demo_locked_rq": locked_rq,
        "steps": steps,
        "ledger": ledger,
        "next": None,
        "status": "ok",
    }


def write_json_artifact(skill: str, payload: dict) -> dict:
    ensure_output()
    path = OUTPUT / f"{skill}-latest.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    append_run_log(skill, "sample", str(path))
    out = dict(payload)
    out["artifacts"] = {"json": str(path)}
    return out


def ensure_output():
    OUTPUT.mkdir(parents=True, exist_ok=True)


def ledger_to_markdown(payload: dict) -> str:
    q = payload.get("question", "")
    lines = [
        "# Evidence ledger",
        "",
        f"- Question: {q}",
        f"- Mode: {payload.get('mode', '')}",
        "",
        "| claim_id | claim | type | source | locator | support | status | notes |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in payload.get("rows") or []:
        lines.append(
            "| {claim_id} | {claim} | {claim_type} | {source} | {locator} | {support} | {status} | {notes} |".format(
                **r
            )
        )
    lines += ["", "## Gaps", ""]
    for g in payload.get("gaps") or []:
        lines.append(
            f"- {g.get('claim_id')}: {g.get('reason')} (depends_on_plan={g.get('depends_on_plan')})"
        )
    lines.append("")
    return "\n".join(lines)


def append_run_log(skill: str, input_summary: str, artifact_path: str):
    ensure_output()
    log = OUTPUT / "run-log.md"
    if not log.exists():
        log.write_text("# ResearchOS run log\n\n", encoding="utf-8")
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with log.open("a", encoding="utf-8") as f:
        f.write(f"- {ts} · `{skill}` · {input_summary} · artifact: `{artifact_path}`\n")


def write_ledger_artifacts(payload: dict) -> dict:
    ensure_output()
    md_path = OUTPUT / "evidence-ledger-latest.md"
    json_path = OUTPUT / "evidence-ledger-latest.json"
    md_path.write_text(ledger_to_markdown(payload), encoding="utf-8")
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    append_run_log(
        "evidence-ledger",
        "question=%r" % ((payload.get("question") or "")[:80],),
        str(md_path),
    )
    out = dict(payload)
    out["artifacts"] = {"markdown": str(md_path), "json": str(json_path)}
    out["mode"] = "sample"
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _qs_first(self, qs, *keys, default=""):
        for k in keys:
            vals = qs.get(k)
            if vals and vals[0] != "":
                return vals[0]
        return default

    def _body_first(self, payload, *keys, default=""):
        for k in keys:
            v = payload.get(k)
            if v is not None and v != "":
                return v
        return default

    def _run_sample_skill(self, name, *, interest="", direction="", seed="", rq="", question=""):
        """Dispatch one sample skill; attach next-chain pointer."""
        next_map = {
            "direction-framing": "rq-decomposition",
            "rq-decomposition": "seed-paper-neighborhood",
            "seed-paper-neighborhood": "foundational-frontier-split",
            "foundational-frontier-split": "evidence-ledger",
            "evidence-ledger": None,
        }
        if name == "evidence-ledger":
            out = write_ledger_artifacts(sample_ledger(question or rq or direction or interest))
            out["next"] = None
            out["status"] = "ok"
            return out
        if name == "direction-framing":
            out = write_json_artifact(name, sample_direction_framing(interest or question))
            out["next"] = next_map[name]
            out["status"] = "ok"
            return out
        if name == "rq-decomposition":
            out = write_json_artifact(name, sample_rq_decomposition(direction or question))
            out["next"] = next_map[name]
            out["status"] = "ok"
            return out
        if name == "seed-paper-neighborhood":
            out = write_json_artifact(name, sample_seed_paper_neighborhood(seed or question))
            out["next"] = next_map[name]
            out["status"] = "ok"
            return out
        if name == "foundational-frontier-split":
            split = sample_foundational_frontier_split(rq or question)
            out = write_json_artifact(name, split)
            ledger = ingest_split_gaps_to_ledger(split)
            out["ledger"] = {
                "mode": ledger.get("mode"),
                "artifacts": ledger.get("artifacts"),
                "gap_count": len(ledger.get("gaps") or []),
                "row_count": len(ledger.get("rows") or []),
            }
            out["next"] = next_map[name]
            out["status"] = "ok"
            return out
        if name == "p0-chain":
            return run_p0_chain(interest=interest or question, seed=seed)
        return None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/workspace/"):
            return serve_workspace(self, "GET", path)
        if path == "/api/health":
            return self._json(
                200,
                {
                    "ok": True,
                    "service": "ResearchOS demo",
                    "port": PORT,
                    "skills_router": "jaden",
                    "p0_chain": "/api/skills/run/p0-chain",
                    "dsh_bridge": "/api/dsh/status",
                },
            )
        if path in ("/api/output", "/api/output/"):
            ensure_output()
            items = []
            for fp in sorted(OUTPUT.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
                if not fp.is_file():
                    continue
                if fp.suffix.lower() not in {".json", ".md", ".txt"}:
                    continue
                if ".." in fp.name:
                    continue
                st = fp.stat()
                items.append(
                    {
                        "name": fp.name,
                        "size": st.st_size,
                        "mtime": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
                        "url": f"/api/output/{fp.name}",
                    }
                )
            return self._json(200, {"ok": True, "count": len(items), "items": items})
        m_out = re.fullmatch(r"/api/output/([A-Za-z0-9._-]+)", path)
        if m_out:
            name = m_out.group(1)
            # only allow known latest artifacts under OUTPUT
            if ".." in name or "/" in name or "\\" in name:
                return self._json(400, {"ok": False, "error": "bad name"})
            fp = OUTPUT / name
            if not fp.is_file() or not fp.resolve().is_relative_to(OUTPUT.resolve()):
                return self._json(404, {"ok": False, "error": "artifact not found", "name": name})
            if name.endswith(".json"):
                try:
                    return self._json(200, json.loads(fp.read_text(encoding="utf-8")))
                except Exception as e:
                    return self._json(500, {"ok": False, "error": str(e)})
            body = fp.read_bytes()
            self.send_response(200)
            ctype = "text/markdown; charset=utf-8" if name.endswith(".md") else "application/octet-stream"
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/skills":
            skills = list(list_skills())
            if "p0-chain" not in skills:
                skills.append("p0-chain")
            return self._json(
                200,
                {
                    "skills": skills,
                    "run": "/api/skills/run/<name>",
                    "note": (
                        "Sample skills write artifacts under demo/output/. "
                        "Virtual skill p0-chain runs direction-framing → rq-decomposition → "
                        "seed-paper-neighborhood → foundational-frontier-split → evidence-ledger. "
                        "GET /api/skills/run/evidence-ledger returns sample ledger + artifacts."
                    ),
                },
            )
        m = re.fullmatch(r"/api/skills/run/([a-z0-9-]+)", path)
        if m:
            name = m.group(1)
            qs = urllib.parse.parse_qs(parsed.query)
            interest = self._qs_first(qs, "interest", "question", "q")
            direction = self._qs_first(qs, "direction", "question", "q")
            seed = self._qs_first(qs, "seed", "question", "q")
            rq = self._qs_first(qs, "rq", "question", "q")
            q = self._qs_first(qs, "question", "q")
            # Prefer skill-specific keys when present
            if name == "direction-framing":
                interest = self._qs_first(qs, "interest", "question", "q")
                q = interest
            elif name == "rq-decomposition":
                direction = self._qs_first(qs, "direction", "question", "q")
                q = direction
            elif name == "seed-paper-neighborhood":
                seed = self._qs_first(qs, "seed", "question", "q")
                q = seed
            elif name == "foundational-frontier-split":
                rq = self._qs_first(qs, "rq", "question", "q")
                q = rq
            elif name == "p0-chain":
                interest = self._qs_first(qs, "interest", "question", "q")
                seed = self._qs_first(qs, "seed")
            out = self._run_sample_skill(
                name,
                interest=interest,
                direction=direction,
                seed=seed,
                rq=rq,
                question=q,
            )
            if out is not None:
                return self._json(200, out)
            data = parse_skill(name)
            if not data:
                return self._json(404, {"ok": False, "error": "skill not found", "skill": name})
            return self._json(200, data)
        if path in ("/api/dsh", "/api/dsh/", "/api/dsh/status"):
            return self._json(200, dsh_public_status())
        if path == "/api/dsh/open":
            target = dsh_resolve_open_url()
            self.send_response(302)
            self.send_header("Location", target)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return
        if path == "/api/dsh/handoff":
            return self._json(200, dsh_read_handoff())
        if path in ("/", ""):
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/workspace/"):
            return serve_workspace(self, "POST", parsed.path)
        m = re.fullmatch(r"/api/skills/run/([a-z0-9-]+)", parsed.path)
        if m:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw.decode() or "{}")
            except json.JSONDecodeError:
                return self._json(400, {"ok": False, "error": "invalid json"})
            name = m.group(1)
            interest = self._body_first(payload, "interest", "question", "q")
            direction = self._body_first(payload, "direction", "question", "q")
            seed = self._body_first(payload, "seed", "question", "q")
            rq = self._body_first(payload, "rq", "question", "q")
            q = self._body_first(payload, "question", "q")
            if name == "direction-framing":
                interest = self._body_first(payload, "interest", "question", "q")
                q = interest
            elif name == "rq-decomposition":
                direction = self._body_first(payload, "direction", "question", "q")
                q = direction
            elif name == "seed-paper-neighborhood":
                seed = self._body_first(payload, "seed", "question", "q")
                q = seed
            elif name == "foundational-frontier-split":
                rq = self._body_first(payload, "rq", "question", "q")
                q = rq
            elif name == "p0-chain":
                interest = self._body_first(payload, "interest", "question", "q")
                seed = self._body_first(payload, "seed")
            out = self._run_sample_skill(
                name,
                interest=interest,
                direction=direction,
                seed=seed,
                rq=rq,
                question=q,
            )
            if out is not None:
                out = dict(out)
                out["input"] = payload
                return self._json(200, out)
            data = parse_skill(name)
            if not data:
                return self._json(404, {"ok": False, "error": "skill not found", "skill": name})
            if name == "pilot-eval-design":
                out = sample_pilot(q)
                out["input"] = payload
                out["status"] = "accepted-demo"
                return self._json(200, out)
            data["input"] = payload
            data["status"] = "accepted-dry-run"
            return self._json(200, data)
        if parsed.path in ("/api/dsh/launch-url", "/api/dsh/launch_url"):
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw.decode() or "{}")
            except json.JSONDecodeError:
                return self._json(400, {"ok": False, "error": "invalid json"})
            url = self._body_first(payload, "launch_url", "url", "token_url")
            try:
                return self._json(200, dsh_set_launch_url(url))
            except ValueError as e:
                return self._json(400, {"ok": False, "error": str(e)})
        if parsed.path == "/api/dsh/handoff":
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw.decode() or "{}")
            except json.JSONDecodeError:
                return self._json(400, {"ok": False, "error": "invalid json"})
            prompt = self._body_first(payload, "prompt", "text", "message", "q")
            meta = {k: payload.get(k) for k in ("project_id", "source") if k in payload}
            return self._json(200, dsh_save_handoff(prompt, meta))
        return self._json(404, {"ok": False, "error": "not found"})

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/api/dsh/open":
            target = dsh_resolve_open_url()
            self.send_response(302)
            self.send_header("Location", target)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return
        if path.startswith("/api/"):
            # Headers-only OK for probes; body omitted.
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return
        return super().do_HEAD()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))



if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"ResearchOS on http://127.0.0.1:{PORT}")
    tasks.recover()
    stop_automation = automation.start()
    try:
        httpd.serve_forever()
    finally:
        stop_automation.set()
        tasks.shutdown()
        httpd.server_close()
