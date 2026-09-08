# ============================================================
# IMSE EASY EMS - Resume Cloud SQL to continue testing
# ============================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "RESUMING Cloud SQL Instance" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host "`nCurrent status..." -ForegroundColor Yellow
gcloud sql instances describe ems-postgres --format="value(state)"

Write-Host "`nStarting instance (takes 2-5 min)..." -ForegroundColor Yellow
gcloud sql instances patch ems-postgres --activation-policy=ALWAYS --quiet

Write-Host "`nWaiting for RUNNABLE state..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
do {
    Start-Sleep -Seconds 10
    $state = gcloud sql instances describe ems-postgres --format="value(state)"
    Write-Host "  Status: $state" -ForegroundColor Gray
    $attempt++
    if ($attempt -ge $maxAttempts) {
        Write-Host "Taking longer than expected. Check console." -ForegroundColor Yellow
        break
    }
} while ($state -ne "RUNNABLE")

if ($state -eq "RUNNABLE") {
    Write-Host "`nCloud SQL is RUNNABLE" -ForegroundColor Green
    Write-Host "`nCloud Run app should now work again" -ForegroundColor Green
    Write-Host "  Test with: Invoke-WebRequest https://ems-backend-446056303892.asia-south1.run.app/readyz/" -ForegroundColor Gray
}