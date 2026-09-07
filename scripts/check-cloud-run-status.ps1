# ============================================================
# IMSE EASY EMS - Cloud Run Status Check
# Usage: .\scripts\check-cloud-run-status.ps1
# ============================================================

$PROJECT_ID = "easy-ems-507406"
$REGION = "asia-south1"
$SERVICE_NAME = "ems-backend"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Cloud Run Service Status" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Check service exists
$serviceExists = gcloud run services describe $SERVICE_NAME --region $REGION 2>$null
if (-not $serviceExists) {
    Write-Host "Service '$SERVICE_NAME' does not exist yet." -ForegroundColor Yellow
    Write-Host "Run: .\scripts\deploy-to-cloud-run.ps1"
    exit 0
}

# Get service URL
$serviceUrl = gcloud run services describe $SERVICE_NAME --region $REGION --format "value(status.url)"
Write-Host "URL: $serviceUrl" -ForegroundColor Green

# Get latest revision
$revision = gcloud run services describe $SERVICE_NAME --region $REGION --format "value(status.latestReadyRevisionName)"
Write-Host "Latest revision: $revision"

# Try health check
Write-Host "`nHealth check..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod "$serviceUrl/healthz" -TimeoutSec 30
    Write-Host "  Health: OK" -ForegroundColor Green
    Write-Host "  Response: $($response | ConvertTo-Json -Compress)"
} catch {
    Write-Host "  Health check FAILED: $_" -ForegroundColor Red
}

# Try database check
Write-Host "`nDatabase check..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod "$serviceUrl/readyz" -TimeoutSec 30
    Write-Host "  DB: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "  DB check FAILED: $_" -ForegroundColor Red
}

Write-Host "`nTo view recent logs:" -ForegroundColor Yellow
Write-Host "  gcloud run services logs read $SERVICE_NAME --region $REGION --limit 30"