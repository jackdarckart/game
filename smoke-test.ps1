$ErrorActionPreference = 'Stop'

$base = 'http://127.0.0.1:3000'
$accountA = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$accountB = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$handleA = 'Test_' + ([Guid]::NewGuid().ToString('N').Substring(0, 8))
$handleB = 'Test_' + ([Guid]::NewGuid().ToString('N').Substring(0, 8))
$password = 'TestPass12345!'

function Assert-UnauthenticatedVault {
  try {
    Invoke-RestMethod -Uri "$base/api/vault" -Method Get | Out-Null
    throw 'Unauthenticated vault request unexpectedly succeeded.'
  } catch {
    if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 401) { throw }
  }
}

Write-Host '[1/6] Health and private endpoint'
$health = Invoke-RestMethod -Uri "$base/api/health" -Method Get
if ($health.status -ne 'online') { throw 'Healthcheck fehlgeschlagen.' }
Assert-UnauthenticatedVault

Write-Host "[2/6] Register: $handleA"
$bodyA = @{ handle = $handleA; password = $password } | ConvertTo-Json
$registeredA = Invoke-RestMethod -Uri "$base/api/register" -Method Post -ContentType 'application/json' -Body $bodyA -WebSession $accountA
if (-not $registeredA.success -or $registeredA.user.handle -ne $handleA) { throw 'Register fehlgeschlagen.' }

Write-Host '[3/6] Vault lesen, speichern und erhaltene Daten prüfen'
$vaultA = Invoke-RestMethod -Uri "$base/api/vault" -Method Get -WebSession $accountA
if (-not $vaultA.success) { throw 'Vault-Lesen fehlgeschlagen.' }
$stateA = $vaultA.vault.gameState
$stateA.vibeScore = 123
$stateA.fragments = 456
$stateA | Add-Member -NotePropertyName extraSaveData -NotePropertyValue @{ preserved = $true; label = 'smoke-test' }
$saveBodyA = @{ state = $stateA } | ConvertTo-Json -Depth 20
$savedA = Invoke-RestMethod -Uri "$base/api/vault" -Method Put -ContentType 'application/json' -Body $saveBodyA -WebSession $accountA
if (-not $savedA.success -or -not $savedA.vault.gameState.extraSaveData.preserved) { throw 'Vault-Speichern oder Erhalt zusätzlicher Daten fehlgeschlagen.' }
try {
  $invalidBody = @{ state = @{ vibeScore = -1 } } | ConvertTo-Json -Depth 20
  Invoke-RestMethod -Uri "$base/api/vault" -Method Put -ContentType 'application/json' -Body $invalidBody -WebSession $accountA | Out-Null
  throw 'Invalid vault state unexpectedly succeeded.'
} catch {
  if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 400) { throw }
}
$afterInvalidSave = Invoke-RestMethod -Uri "$base/api/vault" -Method Get -WebSession $accountA
if ($afterInvalidSave.vault.gameState.vibeScore -ne 123) { throw 'Invalid state overwrote the existing vault.' }

Write-Host "[4/6] Account-Isolation: $handleB"
$bodyB = @{ handle = $handleB; password = $password } | ConvertTo-Json
Invoke-RestMethod -Uri "$base/api/register" -Method Post -ContentType 'application/json' -Body $bodyB -WebSession $accountB | Out-Null
$vaultB = Invoke-RestMethod -Uri "$base/api/vault" -Method Get -WebSession $accountB
if ($vaultB.vault.gameState.vibeScore -ne 0) { throw 'Neuer Account hat fremde Vault-Daten erhalten.' }
$stateB = $vaultB.vault.gameState
$stateB.vibeScore = 7
$saveBodyB = @{ userId = 'another-account'; state = $stateB } | ConvertTo-Json -Depth 20
Invoke-RestMethod -Uri "$base/api/vault" -Method Post -ContentType 'application/json' -Body $saveBodyB -WebSession $accountB | Out-Null
$vaultBAfterSave = Invoke-RestMethod -Uri "$base/api/vault" -Method Get -WebSession $accountB
if ($vaultBAfterSave.vault.gameState.vibeScore -ne 7) { throw 'POST /api/vault fehlgeschlagen.' }
$vaultAAfterSave = Invoke-RestMethod -Uri "$base/api/vault" -Method Get -WebSession $accountA
if ($vaultAAfterSave.vault.gameState.vibeScore -ne 123) { throw 'Account-Isolation fehlgeschlagen.' }

Write-Host '[5/6] Login and session detection'
$loginBody = @{ handle = $handleA; password = $password } | ConvertTo-Json
Invoke-RestMethod -Uri "$base/api/login" -Method Post -ContentType 'application/json' -Body $loginBody -WebSession $loginSession | Out-Null
$sessionInfo = Invoke-RestMethod -Uri "$base/api/session" -Method Get -WebSession $loginSession
if (-not $sessionInfo.authenticated -or $sessionInfo.user.handle -ne $handleA) { throw 'Login oder Session-Prüfung fehlgeschlagen.' }
$loginVault = Invoke-RestMethod -Uri "$base/api/vault" -Method Get -WebSession $loginSession
if ($loginVault.vault.gameState.vibeScore -ne 123) { throw 'Login hat den bestehenden Account-Vault nicht geladen.' }

Write-Host '[6/6] Logout'
Invoke-RestMethod -Uri "$base/api/logout" -Method Post -WebSession $loginSession | Out-Null
$loggedOut = Invoke-RestMethod -Uri "$base/api/session" -Method Get -WebSession $loginSession
if ($loggedOut.authenticated) { throw 'Logout fehlgeschlagen.' }
Assert-UnauthenticatedVault

Write-Host ''
Write-Host 'SMOKE TEST ERFOLGREICH.' -ForegroundColor Green
Write-Host "Test-Accounts: $handleA, $handleB"
Write-Host 'Testdaten liegen lokal unter server/data und können bei Bedarf gelöscht werden.'
