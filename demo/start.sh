#!/usr/bin/env bash
set -eu
exec bash "$(dirname "$0")/../start.sh" "$@"
