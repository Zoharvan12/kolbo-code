param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Path
)

$ErrorActionPreference = "Stop"

if (-not $Path -or $Path.Count -eq 0) {
  throw "At least one path is required"
}

if ($env:GITHUB_ACTIONS -ne "true") {
  Write-Host "Skipping Windows signing (not on GitHub Actions)"
  exit 0
}

$username     = $env:SSLCOM_USERNAME
$password     = $env:SSLCOM_PASSWORD
$credentialId = $env:SSLCOM_CREDENTIAL_ID
$totpSecret   = $env:SSLCOM_TOTP_SECRET

if (-not $username -or -not $password -or -not $credentialId -or -not $totpSecret) {
  Write-Host "Skipping Windows signing (SSLCOM_* env vars not set)"
  exit 0
}

# Locate CodeSignTool.bat installed by the setup step (CODESIGN_TOOL_PATH = directory)
$toolDir = $env:CODESIGN_TOOL_PATH
if (-not $toolDir -or -not (Test-Path $toolDir)) {
  $toolDir = Get-ChildItem "$env:RUNNER_TOOL_CACHE\codesigntool" -Recurse -Filter "CodeSignTool.bat" -ErrorAction SilentlyContinue |
             Select-Object -First 1 -ExpandProperty DirectoryName
}
if (-not $toolDir) {
  throw "CodeSignTool.bat not found. Ensure the SSL.com setup step ran before the Tauri build."
}
$batPath = Join-Path $toolDir "CodeSignTool.bat"

foreach ($file in $Path) {
  $resolved = Resolve-Path $file -ErrorAction SilentlyContinue
  if (-not $resolved) { Write-Warning "File not found: $file"; continue }

  $filePath = $resolved.Path
  Write-Host "Signing: $filePath"

  & $batPath sign `
    "-username=$username" `
    "-password=$password" `
    "-credential_id=$credentialId" `
    "-totp_secret=$totpSecret" `
    "-input_file_path=$filePath" `
    -override

  if ($LASTEXITCODE -ne 0) {
    Write-Warning "SSL.com signing failed for $filePath (exit $LASTEXITCODE) — continuing unsigned"
  } else {
    Write-Host "Signed: $filePath"
  }
}
