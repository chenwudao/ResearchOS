"""Exercise parallel project Bot delegation through the pinned Web runtime."""
import http.server
import json
import shlex
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as launcher
import features
from project_service import create_entry, create_project, mutate, output_references


XRD_RECORD = "n_742a4b68ca824ed3a57f6c3bbef54a97"
XRD_DOI = "10.1038/s41467-019-13749-3"
LEGACY_ACCEPTANCE = ("再次调用 labweave_feature_entries(feat_546dd22dceb5e62d) 能读到 ≥5 条记录，"
                     "每条含可验证的 DOI/arXiv 链接（用 labweave_paper_lookup 核验过）。")
XRD_HISTORY = (f"基于第一阶段调研（记录 {XRD_RECORD}，含卡键："
               f"lit-xrd-dl-2020（DOI {XRD_DOI}，深度学习 XRD 相识别）、lit-xrd-supervised-2023）梳理证据。")


def main():
    concurrent = threading.Barrier(2, timeout=45)
    release = threading.Event()
    result = []
    bot_ids = []
    stage_file = {}
    saved_cards = {}
    engineering_bot = {}
    tracked_file = []
    calls = {"PAPER_ALPHA": "alpha_context", "PAPER_BETA": "beta_context"}
    charts = [{"title": "阶段证据图", "type": "line", "xLabel": "轮次", "yLabel": "覆盖数",
               "points": [{"x": 1, "y": 2}, {"x": 2, "y": 3}]}]

    class Model(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            if self.path != "/release":
                self.send_error(404)
                return
            release.set()
            self.send_response(204)
            self.end_headers()

        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            messages = request["messages"]
            user_text = "\n".join(str(message.get("content", "")) for message in messages if message["role"] == "user")
            tools = {tool["function"]["name"] for tool in request.get("tools", [])}
            outputs = {message.get("tool_call_id"): message["content"] for message in messages if message["role"] == "tool"}
            command = None
            answer = "科研分派验收"
            system = "\n".join(str(message.get("content", "")) for message in messages if message["role"] == "system")
            if "WEAVE_PROJECT_INTENT" in system:
                intake = json.loads(user_text)
                latest = intake["latest"]
                answers = intake.get("answers")
                needs_review = "WEAVE_DELEGATION_PROBE" in latest
                missing = ["literature_scope", "deliverable"] if needs_review and not answers else []
                if needs_review and answers:
                    assert answers == [
                        {"id": "workflow_direction", "value": "逐阶段确认"},
                        {"id": "literature_scope", "value": "只核对 PAPER_ALPHA 和 PAPER_BETA 的原文证据"},
                        {"id": "deliverable", "value": "带出处的摘要"},
                    ]
                answer = json.dumps({"mode": "MANAGE" if "WEAVE_LOOKUP_PROBE" in latest else "EXECUTE",
                                     "research": any(marker in latest for marker in ("WEAVE_CLARIFY_PROBE",
                                                      "WEAVE_DIRECT_QUESTION",
                                                      "WEAVE_DELEGATION_PROBE", "WEAVE_BOT_PRESENTATION")),
                                     "workflow": "confirm" if missing or any(marker in latest for marker in (
                                         "WEAVE_CLARIFY_PROBE", "WEAVE_DIRECT_QUESTION")) else "within_scope",
                                     "missing": missing})
            elif "WEAVE_FILE_CHANGE_PROBE" in user_text and "structured_output" in tools:
                shell = next(name for name in ("pwsh", "powershell", "bash") if name in tools)
                windows_shell = shell != "bash"
                target = str(tracked_file[0])
                quoted_target = "'" + target.replace("'", "''") + "'" if windows_shell else shlex.quote(target)
                commands = ([
                    f"Set-Content -LiteralPath {quoted_target} -Value 'initial'",
                    f"Add-Content -LiteralPath {quoted_target} -Value 'revised'",
                    f"Remove-Item -LiteralPath {quoted_target}",
                ] if windows_shell else [
                    f"printf 'initial' > {quoted_target}",
                    f"printf 'revised' >> {quoted_target}",
                    f"rm -- {quoted_target}",
                ])
                for index, shell_command in enumerate(commands):
                    key = f"file_change_{index}"
                    if key not in outputs:
                        prefix = "$ErrorActionPreference = 'Stop'\n" if windows_shell else "set -e\n"
                        receipt = "\nWrite-Output 'WEAVE_FILES_APPLIED'" if windows_shell else "\nprintf 'WEAVE_FILES_APPLIED'"
                        parameters = next(tool["function"]["parameters"] for tool in request["tools"]
                                          if tool["function"]["name"] == shell)
                        args = {"command": prefix + shell_command + receipt, "description": "Test a project file change"}
                        if "workdir" in parameters.get("properties", {}):
                            args["workdir"] = str(tracked_file[0].parent.parent)
                        command = (key, shell, args)
                        break
                    assert "WEAVE_FILES_APPLIED" in outputs[key], outputs[key]
                else:
                    command = ("file_change_summary", "structured_output", {
                        "title": "项目文件验收", "answer": "已验证文件新增、修改和删除。", "outcome": "completed",
                    })
            elif "structured_output" in tools:
                assignment = next(str(message.get("content", "")) for message in messages
                                  if message["role"] == "user" and "Assignment:" in str(message.get("content", "")))
                assert "Omit tool names, MCP names, and call-by-call narration" in assignment
                marker = next(key for key in calls if key in assignment)
                if "WEAVE_FOLLOW_UP" not in assignment:
                    assert "Weave 科研项目闭环" in system + "\n" + user_text
                if marker == "PAPER_ALPHA":
                    assert "internal-alpha-key" in assignment
                if marker == "PAPER_BETA" and "WEAVE_FOLLOW_UP" not in assignment:
                    assert "labweave_feature_entries(feat_546dd22dceb5e62d)" in assignment
                assert "lead with the conclusion" in assignment
                expected_skill = "weave-research-notes" if marker == "PAPER_ALPHA" else "weave-research-mindmap"
                assert expected_skill in assignment
                assert {"labweave_paper_search", "labweave_paper_lookup", "labweave_paper_neighbors", "labweave_paper_read"} <= tools
                assert "skill" in tools
                assert "seed-paper-neighborhood" in system + "\n" + user_text
                lookup = calls[marker]
                draft = marker + "_draft"
                if "WEAVE_FOLLOW_UP" in assignment:
                    assert marker == "PAPER_BETA" and "Prior assignment being followed up" in assignment
                    command = ("followup-result", "structured_output", {"title": "跟进交付", "answer": "已按补充要求再次核对。",
                                                                       "outcome": "completed"})
                elif draft not in outputs:
                    assert "labweave_bot_canvas_draft" in tools
                    assert "WEAVE_DELEGATION_PROBE" in user_text
                    command = (draft, "labweave_bot_canvas_draft", {"key": "first", "title": "实时草稿 " + marker,
                                                                  "summary": "正在核对阶段证据。",
                                                                  "text": "**先整理主要证据，出处待核验。**",
                                                                  "files": ["outputs/stage.txt"], "visualizations": charts,
                                                                  "sources": [{"recordId": XRD_RECORD}]})
                elif marker == "PAPER_BETA" and "beta_branch" not in outputs:
                    primary = json.loads(outputs[draft])["id"]
                    command = ("beta_branch", "labweave_bot_canvas_draft", {
                        "key": "second", "title": "从证据草稿分支", "text": "补充一条支持证据。",
                        "parentId": primary,
                    })
                elif lookup not in outputs:
                    concurrent.wait()
                    assert release.wait(80), "Project task view did not observe active workers"
                    command = (lookup, "labweave_project_get_context", {})
                else:
                    assert "分派验收项目" in outputs[lookup], outputs
                    draft_id = json.loads(outputs[draft])["id"]
                    command = (marker + "_result", "structured_output", {"title": marker, "answer": "已核对 " + marker,
                                                                        "summary": "阶段证据已核对。",
                                                                        "outcome": "completed", "visualizations": charts,
                                                                        "files": ["outputs/stage.txt"],
                                                                        "sources": [{"recordId": XRD_RECORD}],
                                                                        **({"dependsOn": [saved_cards["overview"]]}
                                                                           if marker == "PAPER_BETA" else {
                                                                               "publishDraftIds": [draft_id],
                                                                               "relatedIds": [draft_id],
                                                                           })})
            elif "WEAVE_FILE_CHANGE_PROBE" in user_text and "labweave_bot_delegate" in tools:
                if "file_delegate" not in outputs:
                    command = ("file_delegate", "labweave_bot_delegate", {"assignments": [{
                        "featureId": engineering_bot["id"], "task": "WEAVE_FILE_CHANGE_PROBE",
                    }]})
                else:
                    assert json.loads(outputs["file_delegate"])[0]["status"] == "completed"
                    answer = "已验收项目文件变化"
            elif "WEAVE_FOLLOW_UP" in user_text and "labweave_bot_delegate" in tools:
                assert "This input follows up a prior task" in user_text
                if "delegate-followup" not in outputs:
                    command = ("delegate-followup", "labweave_bot_delegate", {"assignments": [
                        {"featureId": bot_ids[1], "task": "再次核对 PAPER_BETA WEAVE_FOLLOW_UP"}
                    ]})
                else:
                    assert json.loads(outputs["delegate-followup"])[0]["status"] == "completed"
                    answer = "已验收后续交付"
            elif "WEAVE_BOT_PRESENTATION" in user_text and "labweave_project_get_context" in tools:
                assert "Weave 科研项目闭环" in system + "\n" + user_text
                assert "lead with the conclusion" in system + "\n" + user_text
                assert "Omit tool names, MCP names, and call-by-call narration" in system + "\n" + user_text
                if "presentation_lookup" not in outputs:
                    command = ("presentation_lookup", "labweave_project_get_context", {})
                elif "presentation_card" not in outputs:
                    command = ("presentation_card", "labweave_feature_push", {
                        "featureId": bot_ids[1], "title": "XRD 核查记录", "summary": "核对了相识别的证据。",
                        "text": "**结论**：已核对文献的相识别结果。", "sources": [{"recordId": XRD_RECORD}],
                    })
                else:
                    answer = ("## 本轮结论\n\n| 项目 | 状态 |\n| --- | --- |\n| 资料 | **已核验** |\n\n"
                              f"[第一阶段 XRD 文献调研](weave-record:{XRD_RECORD})。\n\n"
                              f"[阶段文件](weave-file:{stage_file['id']})。\n\n"
                              "已完成 labweave_paper_lookup 和 mcp__fixture__lookup。\n\n"
                              "```text\n阶段交付\n```")
            elif "WEAVE_BYPASS_PROBE" in user_text and "WEAVE_DELEGATION_PROBE" not in user_text and tools:
                assert "labweave_experiment_record" not in tools
                assert {"labweave_bot_delegate", "labweave_project_get_context"} <= tools
                if "bypass_probe" not in outputs:
                    command = ("bypass_probe", "labweave_feature_push", {
                        "featureId": bot_ids[1], "text": "BYPASS_COMPLETION_CLAIM",
                    })
                else:
                    assert json.loads(outputs["bypass_probe"])["status"] == "requires_bot"
                    answer = "BYPASS_COMPLETION_CLAIM"
            elif "WEAVE_DELEGATION_PROBE" in user_text and "labweave_bot_delegate" in tools:
                assert "Weave 科研项目闭环" in system + "\n" + user_text
                if "delegate_probe" not in outputs:
                    assert "只核对 PAPER_ALPHA 和 PAPER_BETA 的原文证据" in user_text
                    command = ("delegate_probe", "labweave_bot_delegate", {"assignments": [
                        {"featureId": bot_ids[0], "task": "PAPER_ALPHA internal-alpha-key",
                         "publicTask": "核查第一阶段的原文证据", "acceptance": "附可复查的来源"},
                        {"featureId": bot_ids[1], "task": "PAPER_BETA " + XRD_HISTORY,
                         "acceptance": "附可复查的来源\n\n" + LEGACY_ACCEPTANCE},
                    ]})
                elif "next_stage" not in outputs:
                    assert "ask_user_question" in tools
                    command = ("next_stage", "ask_user_question", {"questions": [{
                        "id": "map_evidence", "question": "是否继续整理证据关系？",
                        "options": [{"label": "继续整理"}, {"label": "先暂停"}],
                    }]})
                else:
                    assert json.loads(outputs["next_stage"])["answers"][0]["selected"] == ["先暂停"]
                    result.append(outputs["delegate_probe"])
                    answer = "分派结果已返回"
            elif "WEAVE_LOOKUP_PROBE" in user_text:
                answer = "已有结论可直接查询"
            if command:
                identity, name, args = command
                delta = {"role": "assistant", "tool_calls": [{"index": 0, "id": identity, "type": "function",
                         "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)}}]}
                reason = "tool_calls"
            else:
                delta = {"role": "assistant", "content": answer}
                reason = "stop"

            def chunk(value, finish):
                body = {"id": "weave-delegation", "object": "chat.completion.chunk", "created": 1,
                        "model": request["model"], "choices": [{"index": 0, "delta": value, "finish_reason": finish}]}
                return "data: " + json.dumps(body) + "\n\n"

            thinking = chunk({"role": "assistant", "reasoning_content": "Fixture reasoning"}, None) if (
                "WEAVE_BOT_PRESENTATION" in user_text and command is None
            ) else ""
            response = (thinking + chunk(delta, None) + chunk({}, reason) + "data: [DONE]\n\n").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)

    saved_data = launcher.workspace.DATA
    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), Model) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with TemporaryDirectory(prefix="weave-delegation-", dir=Path(tempfile.gettempdir()).resolve(),
                                    ignore_cleanup_errors=True) as directory:
                root = Path(directory)
                launcher.workspace.DATA = root / "data"
                scope = create_project("分派验收项目")["id"]
                outputs = launcher.workspace.DATA / "projects" / scope / "outputs"
                outputs.mkdir(parents=True, exist_ok=True)
                tracked_file.append(outputs / "change-note.txt")
                (outputs / "stage.txt").write_text("真实阶段文件", encoding="utf-8")
                stage_file.update(output_references(scope, ["outputs/stage.txt"])[0])
                bot_ids.append(features.create_feature(scope, "原文核对", paradigm="notes", temporary=True)["feature"]["id"])
                bot_ids.append(features.create_feature(scope, "证据关系", paradigm="mindmap")["feature"]["id"])
                engineering_bot.update(features.create_feature(scope, "文件验收工程台", paradigm="engineering")["feature"])
                saved_cards["overview"] = create_entry(scope, bot_ids[1], {
                    "title": "对照总览", "text": "用于画布分支验收",
                })["id"]
                mutate(scope, lambda state: state["rails"].setdefault("library", []).append({
                    "id": XRD_RECORD, "title": "第一阶段 XRD 文献调研",
                    "text": "**核心证据**：XRD 相识别文献原始记录。",
                }))
                group = features.create_feature(scope, "方法证据组", paradigm="mindmap")["feature"]["id"]
                home = root / "web"
                profile = home / "profiles/web"
                profile.mkdir(parents=True)
                (home / ".credentials.yaml").write_text(
                    "version: 1\nrefs:\n  CUSTOMGW_API_KEY: sk-local-delegation-fixture\n", encoding="utf-8")
                (profile / "cordis.patch.yml").write_text(f"""- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      customgw:
        apiKeyEnv: CUSTOMGW_API_KEY
        api: openai-completions
        baseURL: "http://127.0.0.1:{server.server_port}/v1"
        models:
          - id: gpt-fixture-pro
            contextWindow: 128000
            maxTokens: 4096
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: customgw
    model: gpt-fixture-pro
""", encoding="utf-8")
                with launcher.native_services(0, home=home, configured=False, background=False) as (url, _):
                    subprocess.run(["node", str(ROOT / "tests/integration_bot_delegation.cjs")],
                                   input=json.dumps({"url": url, "releaseUrl": f"http://127.0.0.1:{server.server_port}/release",
                                                     "groupId": group, "memberId": bot_ids[1]}),
                                   text=True, cwd=ROOT, check=True, timeout=240)
                    assert len(result) == 1, result
                    outcomes = json.loads(result[0])
                    assert [item["status"] for item in outcomes] == ["completed", "completed"], outcomes
                    assert outcomes[0]["archived"] and not outcomes[1].get("archived"), outcomes
                    assert len({item["childSessionId"] for item in outcomes}) == 2, outcomes
                    for bot, marker, outcome in zip(bot_ids, calls, outcomes, strict=True):
                        assert outcome["featureId"] == bot and marker in outcome["answer"], outcomes
                        project = launcher.workspace.snapshot()["state"]["projects"][0]
                        entry = next(entry for entry in project["rails"][bot] if entry["id"] == outcome["recordId"])
                        assert marker in entry["text"] and entry["visualizations"] == charts, entry
                        assert entry["summary"] == "阶段证据已核对。", entry
                        assert entry["outputFiles"][0]["name"] == "stage.txt", entry
                print("Live project task list, parallel Bot runs, preserved archived results, and regrouping verified.")
        finally:
            release.set()
            launcher.workspace.DATA = saved_data
            server.shutdown()


if __name__ == "__main__":
    main()
