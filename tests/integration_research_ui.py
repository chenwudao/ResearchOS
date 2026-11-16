"""Browser workflow acceptance using real sklearn runs, isolated from user data."""
from pathlib import Path
from tempfile import TemporaryDirectory
from http.server import ThreadingHTTPServer
from threading import Thread
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'demo/api'))
import main, workspace, research_workflows
with TemporaryDirectory() as folder:
    workspace.DATA = Path(folder) / 'local'
    with ThreadingHTTPServer(('127.0.0.1', 0), main.Handler) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            subprocess.run(['node', 'tests/integration_research_ui.cjs', str(server.server_port)], check=True)
        finally:
            research_workflows.shutdown()
            main.tasks.shutdown()
            server.shutdown()
