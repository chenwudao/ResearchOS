"""The opt-in preview should not expose model credentials to package installation."""

import importlib.util
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("preview_launcher", ROOT / "scripts/start_dsh_preview.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class PreviewModelEnvironmentTests(unittest.TestCase):
    def test_key_only_reaches_web_when_requested(self):
        for enabled in (False, True):
            with self.subTest(enabled=enabled):
                observed = {}
                install = types.SimpleNamespace(wait=lambda timeout: 0)
                web = types.SimpleNamespace(poll=lambda: 0)
                temporary = types.SimpleNamespace(name="temporary-preview-home", cleanup=lambda: None)
                fake_workspace = types.ModuleType("workspace")
                fake_workspace.deepseek_key = lambda: "test-only-key"

                def start_process(_command, **kwargs):
                    observed["install"] = dict(kwargs["env"])
                    return install

                def start_web(env, _timeout):
                    observed["web"] = dict(env)
                    return web

                args = ["preview", "--use-existing-backend"]
                if enabled:
                    args.append("--use-configured-model")
                with patch.object(sys, "argv", args), \
                     patch.dict(os.environ, {"DEEPSEEK_API_KEY": "ambient-secret"}, clear=True), \
                     patch.dict(sys.modules, {"workspace": fake_workspace}), \
                     patch.object(launcher, "DSH", types.SimpleNamespace(is_file=lambda: True)), \
                     patch.object(launcher, "PLUGIN", types.SimpleNamespace(is_dir=lambda: True, __str__=lambda _: "plugin")), \
                     patch.object(launcher, "listening", return_value=True), \
                     patch.object(launcher.tempfile, "TemporaryDirectory", return_value=temporary), \
                     patch.object(launcher, "start_process", side_effect=start_process), \
                     patch.object(launcher, "start_web", side_effect=start_web), \
                     patch.object(launcher, "stop_process"):
                    self.assertEqual(launcher.main(), 0)
                self.assertNotIn("DEEPSEEK_API_KEY", observed["install"])
                self.assertEqual(observed["web"].get("DEEPSEEK_API_KEY"), "test-only-key" if enabled else None)


if __name__ == "__main__":
    unittest.main()
