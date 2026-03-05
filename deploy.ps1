# Deploy Script for DWP Intelligence 3D Pipeline
$PROJECT_ID = "dwpaivibecode"
$REGION = "asia-southeast3"
$REPO_NAME = "pipeline-repo"
$IMAGE_NAME = "pipeline-app"

# Ensure gcloud is configured
Write-Host "Configuring Project: $PROJECT_ID..." -ForegroundColor Cyan
gcloud config set project $PROJECT_ID

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
    --substitutions="_NEXT_PUBLIC_SUPABASE_URL=$($env:NEXT_PUBLIC_SUPABASE_URL),_NEXT_PUBLIC_SUPABASE_ANON_KEY=$($env:NEXT_PUBLIC_SUPABASE_ANON_KEY),_GEMINI_CLIENT_ID=$($env:GEMINI_CLIENT_ID),_GEMINI_API_KEY=$($env:GEMINI_API_KEY),_APS_CLIENT_ID=$($env:APS_CLIENT_ID),_APS_CLIENT_SECRET=$($env:APS_CLIENT_SECRET),_APS_CALLBACK_URL=$($env:APS_CALLBACK_URL),_CLAUDE_API_KEY=$($env:CLAUDE_API_KEY)"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment Successful!" -ForegroundColor Green
    Write-Host "Check the URL above to access the application."
}
else {
    Write-Host "Deployment Failed. Check the logs above." -ForegroundColor Red
}
