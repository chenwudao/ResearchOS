$ErrorActionPreference = "Stop"
$environmentPython = Join-Path $PSScriptRoot ".venv/Scripts/python.exe"
$launcher = Join-Path $PSScriptRoot "scripts/start.py"
if (Test-Path -LiteralPath $environmentPython) {
    & $environmentPython $launcher @args
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3.12 $launcher @args
} else {
    & python $launcher @args
}
exit $LASTEXITCODE
