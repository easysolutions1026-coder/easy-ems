# ============================================================
# IMSE EASY EMS - Cloud Run Deployment Script
# Usage: .\scripts\deploy-to-cloud-run.ps1
# ============================================================

$ErrorActionPreference = "Stop"

# --- Configuration ---
$PROJECT_ID = "easy-ems-507406"
$REGION = "asia-south1"
$SERVICE_NAME = "ems-backend"
$IMAGE_NAME = "gcr.io/$PROJECT_ID/$SERVICE_NAME"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "IMSE EASY EMS - Cloud Run Deployment" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Project:  $PROJECT_ID"
Write-Host "Region:   $REGION"
Write-Host "Service:  $SERVICE_NAME"
Write-Host "Image:    $IMAGE_NAME"
Write-Host ""

# --- Pre-flight checks ---
Write-Host "[1/6] Pre-flight checks..." -ForegroundColor Yellow

# Check gcloud is installed
try {
    $gcloudVersion = gcloud --version 2>&1 | Select-Object -First 1
    Write-Host "  OK gcloud installed: $gcloudVersion" -ForegroundColor Green
} catch {
    Write-Host "  FAIL gcloud not found. Please install Google Cloud SDK." -ForegroundColor Red
    exit 1
}

# Check authenticated
$account = gcloud config get-value account 2>$null
if ($account -eq "imseindia@gmail.com") {
    Write-Host "  OK Authenticated as: $account" -ForegroundColor Green
} else {
    Write-Host "  FAIL Not authenticated as imseindia@gmail.com (currently: $account)" -ForegroundColor Red
    Write-Host "  Run: gcloud auth login" -ForegroundColor Yellow
    exit 1
}

# Check project set
$currentProject = gcloud config get-value project 2>$null
if ($currentProject -eq $PROJECT_ID) {
    Write-Host "  OK Project set to: $currentProject" -ForegroundColor Green
} else {
    Write-Host "  FAIL Project not set. Setting now..." -ForegroundColor Yellow
    gcloud config set project $PROJECT_ID
}

# Check Docker files exist
$requiredFiles = @(
    "backend\Dockerfile.production",
    "prisma\schema.production.prisma",
    "backend\scripts\cloud-run-start.sh"
)
foreach ($f in $requiredFiles) {
    if (Test-Path $f) {
        Write-Host "  OK File exists: $f" -ForegroundColor Green
    } else {
        Write-Host "  FAIL Missing file: $f" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# --- Enable required APIs ---
Write-Host "[2/6] Ensuring required APIs are enabled..." -ForegroundColor Yellow
$apis = @("cloudbuild.googleapis.com", "run.googleapis.com", "artifactregistry.googleapis.com", "containerregistry.googleapis.com")
foreach ($api in $apis) {
    Write-Host "  Enabling $api..." -ForegroundColor Gray
    gcloud services enable $api --quiet
}
Write-Host "  OK APIs enabled" -ForegroundColor Green
Write-Host ""

# --- Build the Docker image using Cloud Build ---
Write-Host "[3/6] Building Docker image via Cloud Build (this takes 3-5 min)..." -ForegroundColor Yellow
Write-Host "  Building from: backend/Dockerfile.production"

gcloud builds submit `
    --config cloudbuild.yaml `
    --timeout=15m `
    .

if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAIL Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "  OK Build succeeded" -ForegroundColor Green
Write-Host ""

# --- Deploy to Cloud Run ---
Write-Host "[4/6] Deploying to Cloud Run..." -ForegroundColor Yellow

gcloud run deploy $SERVICE_NAME `
    --image $IMAGE_NAME `
    --region $REGION `
    --platform managed `
    --allow-unauthenticated `
    --port 8080 `
    --memory 512Mi `
    --cpu 1 `
    --min-instances 0 `
    --max-instances 3 `
    --timeout 300 `
    --concurrency 80 `
    --set-env-vars "NODE_ENV=production" `
    --set-env-vars "DATABASE_URL=file:/tmp/data.db" `
    --set-env-vars "GOOGLE_OAUTH_CLIENT_ID=446056303892-lcuj4rf9hv047sujfklb2vacqtd93k45.apps.googleusercontent.com" `
    --set-env-vars "GOOGLE_WORKSPACE_DOMAIN="

if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAIL Deployment failed" -ForegroundColor Red
    exit 1
}
Write-Host "  OK Deployment succeeded" -ForegroundColor Green
Write-Host ""

# --- Get the service URL ---
Write-Host "[5/6] Getting service URL..." -ForegroundColor Yellow
$serviceUrl = gcloud run services describe $SERVICE_NAME --region $REGION --format "value(status.url)"
Write-Host "  Service URL: $serviceUrl" -ForegroundColor Green
Write-Host ""

# --- Health check ---
Write-Host "[6/6] Running health check..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
try {
    $response = Invoke-RestMethod "$serviceUrl/healthz"
    if ($response.ok) {
        Write-Host "  OK Health check passed: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
    } else {
        Write-Host "  WARN Health check returned: $response" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  WARN Health check failed (cold start may still be initializing): $_" -ForegroundColor Yellow
    Write-Host "  Try again in a few seconds: Invoke-RestMethod $serviceUrl/healthz" -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT COMPLETE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access your app at:" -ForegroundColor Yellow
Write-Host "  $serviceUrl" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT NEXT STEPS:" -ForegroundColor Yellow
Write-Host "  1. Update OAuth Client authorized origins with the EXACT URL above"
Write-Host "     (if it differs from what we pre-registered)"
Write-Host "  2. Open the URL in browser to test sign-in"
Write-Host "  3. Data is ephemeral - resets when container idle"
Write-Host ""
Write-Host "To view logs:" -ForegroundColor Yellow
Write-Host "  gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50"
Write-Host ""
Write-Host "To redeploy (after code changes):" -ForegroundColor Yellow
Write-Host "  .\scripts\deploy-to-cloud-run.ps1"
Write-Host ""