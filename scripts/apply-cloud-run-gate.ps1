# scripts/apply-cloud-run-gate.ps1
# Injects the Cloud Run isolation gate into frontend/index.html.
# Idempotent - safe to run repeatedly.

param(
  [string]$HtmlPath = "frontend/index.html",
  [string]$GatePath = "scripts/cloud-run-gate.html"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $HtmlPath)) {
  Write-Error "HTML file not found: $HtmlPath (run from repo root)"
  exit 1
}
if (-not (Test-Path $GatePath)) {
  Write-Error "Gate snippet not found: $GatePath"
  exit 1
}

$content = Get-Content $HtmlPath -Raw -Encoding UTF8
$gate    = Get-Content $GatePath -Raw -Encoding UTF8

if ($content.Contains("<!-- CLOUD_RUN_GATE_START -->")) {
  Write-Host "Gate already present in $HtmlPath - no changes." -ForegroundColor Yellow
  exit 0
}

$pattern = '(<script[^>]*api-shim[^>]*></script>)'
if ($content -notmatch $pattern) {
  Write-Error "Could not find api-shim script tag in $HtmlPath. Injection aborted."
  exit 1
}

# Escape $ signs in the gate so -replace doesn't treat them as backreferences
$gateEscaped = $gate -replace '\$', '$$$$'
$updated = $content -replace $pattern, ('$1' + "`n" + $gateEscaped)

Set-Content -Path $HtmlPath -Value $updated -Encoding UTF8 -NoNewline

Write-Host "Gate injected into $HtmlPath." -ForegroundColor Green