"""Credential lookup uses isolated fixtures and preserves existing precedence."""
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo/api"))
import workspace


class KeyConfigTests(unittest.TestCase):
    def test_priority_and_empty_or_missing_files(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            legacy = root / "data" / "deepseek.key"
            local = root / "config" / "deepseek.key"
            home = root / "home" / "deepseek.key"
            legacy.parent.mkdir()
            local.parent.mkdir()
            home.parent.mkdir()
            with patch.object(workspace, "DATA", legacy.parent), \
                 patch.object(workspace, "local_key_paths", return_value=[local, home]), \
                 patch.dict(os.environ, {}, clear=True):
                self.assertEqual(workspace.deepseek_key(), "")
                home.write_text(" home-fixture \n", encoding="utf-8")
                self.assertEqual(workspace.deepseek_key(), "home-fixture")
                local.write_text(" local-fixture \n", encoding="utf-8")
                self.assertEqual(workspace.deepseek_key(), "local-fixture")
                legacy.write_text(" legacy-fixture \n", encoding="utf-8")
                self.assertEqual(workspace.deepseek_key(), "legacy-fixture")
                with patch.dict(os.environ, {"DEEPSEEK_API_KEY": " environment-fixture "}):
                    self.assertEqual(workspace.deepseek_key(), "environment-fixture")
                with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "  "}):
                    self.assertEqual(workspace.deepseek_key(), "legacy-fixture")
                legacy.write_text(" \n", encoding="utf-8")
                self.assertEqual(workspace.deepseek_key(), "local-fixture")
                local.write_text(" \n", encoding="utf-8")
                self.assertEqual(workspace.deepseek_key(), "home-fixture")
                home.write_text(" \n", encoding="utf-8")
                self.assertEqual(workspace.deepseek_key(), "")

    def test_windows_and_xdg_config_paths(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch.dict(os.environ, {"LOCALAPPDATA": str(root / "local"),
                                         "XDG_CONFIG_HOME": str(root / "xdg")}, clear=True):
                with patch.object(workspace.sys, "platform", "win32"):
                    self.assertEqual(workspace.local_key_path(), root / "local" / "LabWeave" / "deepseek.key")
                with patch.object(workspace.sys, "platform", "linux"):
                    self.assertEqual(workspace.local_key_path(), root / "xdg" / "labweave" / "deepseek.key")
            with patch.dict(os.environ, {}, clear=True), patch.object(Path, "home", return_value=root):
                with patch.object(workspace.sys, "platform", "win32"):
                    self.assertEqual(workspace.local_key_path(), root / "AppData" / "Local" / "LabWeave" / "deepseek.key")
                    self.assertEqual(workspace.local_key_paths(), [root / "AppData" / "Local" / "LabWeave" / "deepseek.key", root / ".labweave" / "deepseek.key"])
                with patch.object(workspace.sys, "platform", "linux"):
                    self.assertEqual(workspace.local_key_path(), root / ".config" / "labweave" / "deepseek.key")
                    self.assertEqual(workspace.local_key_paths(), [root / ".config" / "labweave" / "deepseek.key"])


if __name__ == "__main__":
    unittest.main()
