"""Scoped trial approval, replay, interruption and formal protocol routing."""

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo/api"))
import features
import native_web
import features
import project_sandbox as sandbox
import project_service as projects
import workspace


class SandboxTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.old = workspace.DATA
        workspace.DATA = Path(self.temp.name) / "data"
        self.a = projects.create_project("甲")["id"]
        self.b = projects.create_project("乙")["id"]
        features.enable_builtin(self.a, "ideas")
        features.enable_builtin(self.a, "ideas")
        sandbox.recover()
        self.origin = {"sessionId": "session-a", "callId": "call-a", "bot": "点子", "featureId": "ideas"}
        self.args = {"title": "数据核查", "code": "print(7)", "timeoutSeconds": 5}
        self.started = []

        def execute(project, env, script, args, output, logs, timeout, stop):
            self.started.append((project, env))
            (logs / "stdout.log").write_text("result=7\n", encoding="utf-8")
            (output / "result.json").write_text('{"result":7}', encoding="utf-8")
            if args and args[0] == "wait":
                if stop.wait(3):
                    raise InterruptedError("stopped")
            return 0

        hook = patch.object(sandbox.runtime, "execute", side_effect=execute)
        hook.start()
        self.addCleanup(hook.stop)

    def tearDown(self):
        sandbox.shutdown()
        workspace.DATA = self.old
        self.temp.cleanup()

    def test_queue_grant_replay_and_scoped_artifact(self):
        r = sandbox.submit(self.a, self.args, self.origin)
        self.assertEqual(r["status"], "WAITING_APPROVAL")
        self.assertEqual(sandbox.submit(self.a, self.args, self.origin)["id"], r["id"])
        self.assertEqual(self.started, [])
        with self.assertRaises(workspace.WorkspaceError):
            sandbox.detail(self.b, r["id"])
        sandbox.approve_trial(self.a, r["id"])
        done = sandbox.detail(self.a, r["id"], 4)
        self.assertEqual((done["exitCode"], done["sourceBot"], done["status"]), (0, "点子", "SUCCEEDED"))
        self.assertEqual(done["stdout"].splitlines(), ["result=7"])
        self.assertEqual(sandbox.artifact(self.a, r["id"], "result.json")["text"], '{"result":7}')
        with self.assertRaises(workspace.WorkspaceError):
            sandbox.artifact(self.a, r["id"], "../../workspace.sqlite3")
        with self.assertRaises(workspace.WorkspaceError):
            sandbox.artifact(self.b, r["id"], "result.json")
        sandbox.approve_trial(self.a, r["id"])
        self.assertEqual(self.started, [(self.a, "default")])
        rails = projects.project(workspace.snapshot(), self.a)["rails"]
        self.assertEqual(sum(e.get("sandboxRunId") == r["id"] for e in rails["ideas"]), 1)
        self.assertEqual(sum(e.get("sandboxRunId") == r["id"] for e in rails["library"]), 1)

    def test_trial_receipt_follows_only_the_originating_chat(self):
        session = self.origin["sessionId"]
        run = sandbox.submit(self.a, self.args, self.origin)
        identity = run["id"]
        self.assertEqual(sandbox.dialog_delivery("global", session)[0]["status"], "WAITING_APPROVAL")
        self.assertEqual(sandbox.dialog_delivery(self.b, session), [])
        self.assertEqual(sandbox.dialog_delivery(self.a, "elsewhere"), [])
        sandbox.approve_trial(self.a, identity)
        sandbox.detail(self.a, identity, 4)
        receipts = sandbox.dialog_delivery(self.a, session)
        self.assertEqual([(r["id"], r["status"]) for r in receipts], [(identity, "SUCCEEDED")])
        self.assertEqual(sandbox.dialog_delivery(self.a, session, identity)["stdout"].strip(), "result=7")
        self.assertEqual(sandbox.dialog_delivery(self.a, session, identity, "result.json")["text"], '{"result":7}')
        for scope, sid in [(self.b, session), ("global", "elsewhere")]:
            with self.assertRaises(workspace.WorkspaceError):
                sandbox.dialog_delivery(scope, sid, identity, "result.json")

    def test_modified_queued_script_is_not_executed(self):
        path = projects.folder(self.a) / "check.py"
        path.write_text("print(1)")
        req = sandbox.submit(self.a, {"script": "check.py"}, self.origin)
        path.write_text("print(2)")
        sandbox.approve_trial(self.a, req["id"])
        done = sandbox.detail(self.a, req["id"], 4)
        self.assertEqual(done["status"], "BLOCKED")
        self.assertFalse(self.started)

    def test_approved_pool_auto_starts_distinct_requests_and_stop(self):
        with patch.object(sandbox, "environments", return_value=[{"id": "analysis"}]):
            cfg = {"grantSeconds": 30, "environment": "analysis", "requestId": "one-grant"}
            sandbox.configure(self.a, cfg)
            self.assertEqual(sandbox.configure(self.a, cfg)["seconds"], 30)
        first = sandbox.submit(self.a, {**self.args, "args": ["wait"]}, self.origin)
        second = sandbox.submit(self.a, self.args, {**self.origin, "callId": "call-b"})
        self.assertEqual(sandbox.detail(self.a, second["id"], 4)["status"], "SUCCEEDED")
        sandbox.cancel(self.a, first["id"])
        self.assertEqual(sandbox.detail(self.a, first["id"], 4)["status"], "CANCELLED")
        self.assertTrue(all(env == "analysis" for _, env in self.started))
        self.assertEqual(sandbox.dashboard(self.b)["runs"], [])

    def test_missing_runtime_records_failure_without_host_execution(self):
        with patch.object(
            sandbox.runtime, "execute", side_effect=workspace.WorkspaceError(503, "隔离后端不可用")
        ):
            req = sandbox.submit(self.a, self.args, self.origin)
            sandbox.approve_trial(self.a, req["id"])
            result = sandbox.detail(self.a, req["id"], 3)
            self.assertEqual(result["status"], "BLOCKED")
            self.assertIn("隔离后端", result["error"])
            self.assertEqual(result["artifacts"], [])

    def test_approved_matrix_uses_the_same_runtime(self):
        root = projects.folder(self.a)
        (root / "data.txt").write_text("1")
        (root / "method.py").write_text("print(1)")
        plan = {
            "question": "方法对照",
            "hypothesis": "候选方法更好",
            "inputs": ["data.txt"],
            "methods": [{"name": n, "script": "method.py"} for n in ("base", "candidate")],
            "matrix": {"seeds": [1, 2], "budgets": [1]},
            "protocol": {
                "metric": "score",
                "direction": "maximize",
                "baseline": "base",
                "split": "fixed",
                "minSeeds": 2,
            },
            "budget": {
                "maxRuns": 4,
                "retries": 0,
                "concurrency": 1,
                "wallSeconds": 60,
                "timeoutSeconds": 10,
            },
        }
        draft = native_web.project_action(self.a, {"action": "research/draft", "args": {"plan": plan}})
        self.assertEqual(draft["plan"]["environmentId"], "default")

        def cell(pid, env, script, argv, output, logs, timeout, event, deadline, seed):
            self.assertEqual((pid, env, script), (self.a, "default", "method.py"))
            self.assertIn("/output/metrics.json", argv)
            (output / "metrics.json").write_text('{"score":1,"split_id":"fixed"}')
            (logs / "stdout.log").write_text(str(seed))
            self.started.append(seed)
            return 0

        with patch.object(
            sandbox.runtime, "info", return_value={"python": "3.12", "packages": []}
        ), patch.object(sandbox.runtime, "execute", side_effect=cell):
            native_web.project_action(
                self.a,
                {
                    "action": "sandbox/approve-run",
                    "args": {"id": draft["id"], "revision": draft["revision"]},
                },
            )
            limit = time.monotonic() + 8
            while draft["id"] in native_web.research_api.flows.ACTIVE and time.monotonic() < limit:
                time.sleep(0.05)
            result = native_web.research_api.flows.get(self.a, draft["id"])
        self.assertEqual(result["status"], "REVIEW", result.get("error"))
        self.assertCountEqual(self.started, [1, 2, 1, 2])


if __name__ == "__main__":
    unittest.main()
