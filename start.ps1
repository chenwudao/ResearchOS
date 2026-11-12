$ErrorActionPreference = "Stop"
python (Join-Path $PSScriptRoot "scripts/start.py") @args
exit $LASTEXITCODE
