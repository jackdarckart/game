$ErrorActionPreference = 'Stop'

$base = 'http://127.0.0.1:3000'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$handle = 'Test_' + ([Guid]::NewGuid().ToString('N').Substring(0, 8))
$password = 'TestPass12345!'

Write-Host "[1/5] Health"
$health = Invoke-RestMethod -Uri "$base/api/health" -Method Get
if ($health.status -ne 'online') { throw 'Healthcheck fehlgeschlagen.' }

Write-Host "[2/5] Register: $handle"
$registerBody = @{ handle = $handle; password = $password } | ConvertTo-Json
$registered = Invoke-RestMethod -Uri "$base/api/register" -Method Post -ContentType 'application/json' -Body $registerBody -WebSession $session
if (-not $registered.success) { throw 'Register fehlgeschlagen.' }

Write-Host '[3/5] Vault lesen'
$vault = Invoke-RestMethod -Uri "$base/api/vault" -Method Get -WebSession $session
if (-not $vault.success) { throw 'Vault-Lesen fehlgeschlagen.' }

Write-Host '[4/5] Vault speichern'
$state = $vault.vault.gameState
$state.vibeScore = 123
$state.fragments = 456
$saveBody = @{ state = $state } | ConvertTo-Json -Depth 20
$saved = Invoke-RestMethod -Uri "$base/api/vault" -Method Put -ContentType 'application/json' -Body $saveBody -WebSession $session
if (-not $saved.success) { throw 'Vault-Speichern fehlgeschlagen.' }

Write-Host '[5/5] Session prüfen'
$sessionInfo = Invoke-RestMethod -Uri "$base/api/session" -Method Get -WebSession $session
if (-not $sessionInfo.authenticated -or $sessionInfo.user.handle -ne $handle) { throw 'Session-Prüfung fehlgeschlagen.' }

Write-Host ''
Write-Host 'SMOKE TEST ERFOLGREICH.' -ForegroundColor Green
Write-Host "Test-Account: $handle"
Write-Host 'Der Test-Account ist nur lokal angelegt. Bei Bedarf server/data/users.json und den verschlüsselten Vault löschen.'
