"""Run one approved argv; terminate its tree if the controller disappears."""
import json
import os
import subprocess
import sys
import threading
import time


def parent_alive(pid):
    if os.name == 'nt':
        import ctypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.restype = ctypes.c_void_p
        kernel.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return False
        code = ctypes.c_ulong()
        ok = kernel.GetExitCodeProcess(handle, ctypes.byref(code))
        kernel.CloseHandle(handle)
        return bool(ok and code.value == 259)
    return os.getppid() == pid


def main():
    config = json.loads(sys.stdin.readline())
    process = subprocess.Popen(config['argv'], cwd=config['cwd'], env={**os.environ, **config['env']},
                               stdin=subprocess.DEVNULL, stdout=sys.stdout, stderr=sys.stderr,
                               creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)

    def watch():
        while process.poll() is None:
            if not parent_alive(config['parent']):
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/PID', str(os.getpid()), '/T', '/F'],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
                else:
                    import signal
                    os.killpg(os.getpgrp(), signal.SIGTERM)
                os._exit(125)
            time.sleep(.25)

    threading.Thread(target=watch, daemon=True).start()
    return process.wait()


if __name__ == '__main__':
    sys.exit(main())
