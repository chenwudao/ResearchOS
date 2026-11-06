#!/usr/bin/env bash
cd "$(dirname "$0")"
PORT=8765
if ss -tln | grep -q ":$PORT "; then
  echo "Port $PORT already in use — open http://127.0.0.1:$PORT"
  exit 0
fi
echo "Starting ResearchOS demo on http://127.0.0.1:$PORT"
exec python3 api/main.py
