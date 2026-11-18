#!/usr/bin/env bash
set -eu
root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ -x "$root/.venv/bin/python" ]; then
    exec "$root/.venv/bin/python" "$root/scripts/start.py" "$@"
elif command -v python3.12 >/dev/null 2>&1; then
    exec python3.12 "$root/scripts/start.py" "$@"
fi
exec python3 "$root/scripts/start.py" "$@"
