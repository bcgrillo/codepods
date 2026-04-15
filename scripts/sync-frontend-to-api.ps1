param(
  [string]$FrontendDir = "src/Codepods.Frontend",
  [string]$ApiWwwRoot = "src/Codepods.Api/wwwroot"
)

$frontendDist = Join-Path $FrontendDir "dist"

if (-not (Test-Path $frontendDist)) {
  Write-Error "Frontend dist folder not found: $frontendDist. Run frontend build first."
  exit 1
}

New-Item -ItemType Directory -Force -Path $ApiWwwRoot | Out-Null
Remove-Item -Recurse -Force (Join-Path $ApiWwwRoot "*") -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force (Join-Path $frontendDist "*") $ApiWwwRoot

Write-Host "Frontend synced into $ApiWwwRoot"
