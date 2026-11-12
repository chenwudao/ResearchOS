"""Verify the pinned DSH SDK before integrating ResearchOS task execution."""
from pathlib import Path
import json
import sys
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo" / "api"))
from workspace import DATA, deepseek_key
from deepseek_harness import DeepSeekHarness

def main():
    folder = DATA / "runtime-spike"
    folder.mkdir(parents=True, exist_ok=True)
    marker = uuid4().hex
    (folder / "fixture.txt").write_text(marker, encoding="utf-8")
    config = dict(
        dsh_home=str((folder / "home").resolve()),
        cwd=str(folder.resolve()),
        profile="sdk-minimal",
        provider="deepseek-official",
        model="deepseek-flash",
        api_key=deepseek_key(),
    )
    session_id = "spike-" + uuid4().hex
    methods = set()
    with DeepSeekHarness(**config) as harness:
        session = harness.start_session(session_id)
        result = session.run(
            "Use your shell tool to read fixture.txt in the working directory. "
            "Reply with its contents only. Remember the contents.",
            on_notification=lambda item: methods.add(item.method),
        )
        assert marker in result.final_response, "Tool read did not return the fixture contents"
        assert result.finish_reason == "completed", result.finish_reason
    with DeepSeekHarness(**config) as harness:
        restored = harness.resume_session(session_id)
        result = restored.run(
            "Without using tools, repeat the contents you previously read from fixture.txt."
        )
        assert marker in result.final_response, "Session history was not recovered"
    report = {"session_id": session_id, "tool_read": True, "history_restored": True,
              "notification_methods": sorted(methods),
              "cancellation": "SDK has no per-session cancellation; process isolation required"}
    (folder / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
