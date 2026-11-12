from pathlib import Path
from tempfile import TemporaryDirectory
from http.server import ThreadingHTTPServer
from threading import Thread
import os, subprocess, sys
sys.path.insert(0,str(Path('demo/api').resolve()))
import main, workspace
os.environ["DEEPSEEK_API_KEY"]=workspace.deepseek_key()
with TemporaryDirectory() as folder:
    workspace.DATA=Path(folder)
    with ThreadingHTTPServer(('127.0.0.1',0),main.Handler) as server:
        Thread(target=server.serve_forever,daemon=True).start()
        try:
            subprocess.run(['node','tests/integration_ui.cjs',str(server.server_port)],check=True)
        finally:
            main.tasks.shutdown()
            server.shutdown()
