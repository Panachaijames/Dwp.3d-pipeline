# Deploy Script for Object Extractor AI
$PROJECT_ID = "dwpaivibecode"
$AR_REGION = "asia-southeast2"   # Artifact Registry region (repo already exists here)
$REGION = "asia-southeast3"      # Cloud Run deploy region
$REPO_NAME = "extractor-repo"
$IMAGE_NAME = "extractor-app"
$SERVICE_NAME = "object-extractor"

# Ensure gcloud is configured
Write-Host "Configuring Project: $PROJECT_ID..." -ForegroundColor Cyan
gcloud config set project $PROJECT_ID

# Use a repo-local temp directory to avoid Windows temp-file lock issues
$GCLOUD_TEMP_DIR = Join-Path $PSScriptRoot ".gcloud-tmp"
New-Item -ItemType Directory -Force -Path $GCLOUD_TEMP_DIR | Out-Null
[Environment]::SetEnvironmentVariable("TMP", $GCLOUD_TEMP_DIR, "Process")
[Environment]::SetEnvironmentVariable("TEMP", $GCLOUD_TEMP_DIR, "Process")
Write-Host "Using gcloud temp directory: $GCLOUD_TEMP_DIR" -ForegroundColor DarkGray

# Load environment variables from .env.local
Write-Host "Loading environment variables from .env.local..." -ForegroundColor Cyan
if (Test-Path .env.local) {
    Get-Content .env.local | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            $parts = $line.Split('=', 2)
            if ($parts.Count -eq 2) {
                $name = $parts[0].Trim()
                $value = $parts[1].Trim()
                $value = $value -replace '^"|"$', ''
                $value = $value -replace "^'|'$", ""
                [Environment]::SetEnvironmentVariable($name, $value, "Process")
                Write-Host "Loaded: $name" -ForegroundColor DarkGray
            }
        }
    }
}
else {
    Write-Warning ".env.local file not found! Build might fail if variables are missing."
}

# Create Artifact Registry repo if it doesn't exist
Write-Host "Ensuring Artifact Registry repo exists..." -ForegroundColor Cyan
gcloud artifacts repositories describe $REPO_NAME --location=$AR_REGION 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating Artifact Registry repository..." -ForegroundColor Yellow
    gcloud artifacts repositories create $REPO_NAME `
        --repository-format=docker `
        --location=$AR_REGION `
        --description="Object Extractor Docker images"
}

# Submit Build
Write-Host "Submitting Cloud Build..." -ForegroundColor Cyan
gcloud builds submit --config cloudbuild.yaml . `
    --substitutions="_CLOUD_RUN_SERVICE=$SERVICE_NAME,_GEMINI_API_KEY=$($env:GEMINI_API_KEY)"

if ($LASTEXITCODE -eq 0) {
    Write-Host "" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Deployment Successful!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Service URL:" -ForegroundColor Cyan
    gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)'
}
else {
    Write-Host "Deployment Failed. Check the logs above." -ForegroundColor Red
}
