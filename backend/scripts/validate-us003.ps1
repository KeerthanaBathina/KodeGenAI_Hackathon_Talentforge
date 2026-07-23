$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$server = Start-Process -FilePath 'npx.cmd' -ArgumentList 'tsx','src/server.ts' -WorkingDirectory (Get-Location) -PassThru -WindowStyle Hidden

try {
  Start-Sleep -Seconds 5

  if ($server.HasExited) {
    throw 'Backend server exited early. Check backend/.env values.'
  }

  $db = @()
  $redis = @()

  for ($i = 1; $i -le 10; $i++) {
    $resp = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 20
    $json = $resp.Content | ConvertFrom-Json

    if ($json.db -ne 'ok' -or $json.redis -ne 'ok') {
      throw "Health degraded at sample ${i}: $($resp.Content)"
    }

    $db += [int]$json.db_ms
    $redis += [int]$json.redis_ms
    Start-Sleep -Milliseconds 500
  }

  Write-Output "DB_MS_MIN=$((($db | Measure-Object -Minimum).Minimum))"
  Write-Output "DB_MS_MAX=$((($db | Measure-Object -Maximum).Maximum))"
  Write-Output "DB_MS_AVG=$([math]::Round((($db | Measure-Object -Average).Average),2))"
  Write-Output "REDIS_MS_MIN=$((($redis | Measure-Object -Minimum).Minimum))"
  Write-Output "REDIS_MS_MAX=$((($redis | Measure-Object -Maximum).Maximum))"
  Write-Output "REDIS_MS_AVG=$([math]::Round((($redis | Measure-Object -Average).Average),2))"

  npx tsx scripts/test-rate-limit.ts http://localhost:3001
  if ($LASTEXITCODE -ne 0) {
    throw 'Rate limit test failed.'
  }

  npm run load-test:db
  if ($LASTEXITCODE -ne 0) {
    throw 'DB load test failed.'
  }
}
finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
}
