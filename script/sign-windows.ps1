param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Path
)

Write-Host "Skipping Windows signing (SSL.com eSigner temporarily disabled)"
exit 0
