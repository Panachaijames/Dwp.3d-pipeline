# Deploy Script for DWP Intelligence 3D Pipeline
$PROJECT_ID = "dwpaivibecode"
$REGION = "asia-southeast3"
$REPO_NAME = "pipeline-repo"
$IMAGE_NAME = "pipeline-app"
$SERVICE_NAME = "dwp-pipeline-v2"

# Ensure gcloud is configured
Write-Host "Configuring Project: $PROJECT_ID..." -ForegroundColor Cyan
gcloud config set project $PROJECT_ID

# Use a repo-local temp directory to avoid Windows temp-file lock issues during gcloud packaging.
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
                # Remove quotes if present
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

# Submit Build
Write-Host "Submitting Cloud Build..." -ForegroundColor Cyan
# Note: You should replace the substitution values below with your actual environment variables or remove them if passing via secret manager
# If executing locally, credentials need to be set in the shell or passed manually.
gcloud builds submit --config cloudbuild.yaml . `
    --substitutions="_CLOUD_RUN_SERVICE=$SERVICE_NAME,_NEXT_PUBLIC_SUPABASE_URL=$($env:NEXT_PUBLIC_SUPABASE_URL),_NEXT_PUBLIC_SUPABASE_ANON_KEY=$($env:NEXT_PUBLIC_SUPABASE_ANON_KEY),_NEXT_PUBLIC_SUPABASE_PROJECT_ALL_URL=$($env:NEXT_PUBLIC_SUPABASE_PROJECT_ALL_URL),_NEXT_PUBLIC_SUPABASE_PROJECT_ALL_ANON=$($env:NEXT_PUBLIC_SUPABASE_PROJECT_ALL_ANON),_NEXT_PUBLIC_SUPABASE_PROJECT_ALL_SCHEMA=$($env:NEXT_PUBLIC_SUPABASE_PROJECT_ALL_SCHEMA),_GEMINI_CLIENT_ID=$($env:GEMINI_CLIENT_ID),_GEMINI_CLIENT_SECRET=$($env:GEMINI_CLIENT_SECRET),_GEMINI_API_KEY=$($env:GEMINI_API_KEY),_APS_CLIENT_ID=$($env:APS_CLIENT_ID),_APS_CLIENT_SECRET=$($env:APS_CLIENT_SECRET),_APS_CALLBACK_URL=$($env:APS_CALLBACK_URL),_CLAUDE_API_KEY=$($env:CLAUDE_API_KEY),_GOOGLE_SERVICE_ACCOUNT_EMAIL=$($env:GOOGLE_SERVICE_ACCOUNT_EMAIL),_GOOGLE_PRIVATE_KEY=$($env:GOOGLE_PRIVATE_KEY)"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment Successful!" -ForegroundColor Green
    Write-Host "Check the URL above to access the application."
}
else {
    Write-Host "Deployment Failed. Check the logs above." -ForegroundColor Red
}
