# HTH PC info collector (read-only). Student file; not part of the provided starter.
# Run from the on-client folder as a normal user:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\student\collect-pc-info.ps1
# It READS network adapter counts, firewall profile state and System/Application event counts, then writes ONE json file.
# Safety rules kept by this script:
#   - No admin rights. Items that need admin are reported as unavailable (reason: access_denied) and never changed.
#   - No Set-/New-/Remove-/Enable-/Disable- commands on the network, firewall or security settings. The only write is the output file.
#   - No IP, MAC, Wi-Fi name, computer name or event message text is collected. Only counts and on/off values.
#   - No network requests and no attack or intrusion simulation.
# The counts are NOT intrusion or attack detection results.
param(
  [string]$OutFile = (Join-Path $env:TEMP 'hth-pc-info.json'),
  [int]$WindowHours = 24
)
$ErrorActionPreference = 'Stop'
if ($WindowHours -lt 1 -or $WindowHours -gt 168) { $WindowHours = 24 }
$EventCap = 10000

function Get-Reason($err) {
  $name = $err.Exception.GetType().Name
  if ($name -like '*Unauthorized*' -or $err.Exception.Message -match 'denied|permission|0x5\b') { return 'access_denied' }
  if ($name -like '*NotSupported*' -or $name -like '*CommandNotFound*') { return 'not_supported' }
  return 'command_failed'
}

# 1) Network configuration summary (counts only)
$network = $null
try {
  $adapters = @(Get-NetAdapter)
  $up = @($adapters | Where-Object { $_.Status -eq 'Up' })
  $wired = @($adapters | Where-Object { [string]$_.PhysicalMediaType -match '802\.3' }).Count
  $wireless = @($adapters | Where-Object { [string]$_.PhysicalMediaType -match '802\.11' }).Count
  $configs = @(Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' })
  $network = [ordered]@{
    status = 'ok'
    adapters = [ordered]@{ total = $adapters.Count; up = $up.Count; wired = $wired; wireless = $wireless; other = ($adapters.Count - $wired - $wireless) }
    ipv4Configured = @($configs | Where-Object { $_.IPv4Address }).Count
    gatewayConfigured = @($configs | Where-Object { $_.IPv4DefaultGateway }).Count
    dnsConfigured = @($configs | Where-Object { $_.DNSServer -and @($_.DNSServer.ServerAddresses).Count -gt 0 }).Count
  }
} catch { $network = [ordered]@{ status = 'unavailable'; reason = (Get-Reason $_) } }

# 2) Firewall profiles (read only)
$firewall = $null
try {
  $profiles = @(Get-NetFirewallProfile | ForEach-Object {
    [ordered]@{ name = [string]$_.Name; enabled = ([string]$_.Enabled -eq 'True'); defaultInbound = [string]$_.DefaultInboundAction }
  })
  $firewall = [ordered]@{ status = 'ok'; profiles = $profiles }
} catch { $firewall = [ordered]@{ status = 'unavailable'; reason = (Get-Reason $_) } }

# 3) Windows event log counts (System and Application only; Security needs admin and is never read)
$since = (Get-Date).AddHours(-$WindowHours)
function Count-Events($log, $level) {
  try {
    $found = @(Get-WinEvent -FilterHashtable @{ LogName = $log; Level = $level; StartTime = $since } -MaxEvents ($EventCap + 1) -ErrorAction Stop)
    return @{ ok = $true; count = [Math]::Min($found.Count, $EventCap); truncated = ($found.Count -gt $EventCap) }
  } catch {
    if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { return @{ ok = $true; count = 0; truncated = $false } }
    return @{ ok = $false; reason = (Get-Reason $_) }
  }
}
$logs = @()
foreach ($log in 'System', 'Application') {
  $err = Count-Events $log 2
  $warn = Count-Events $log 3
  if ($err.ok -and $warn.ok) {
    $logs += [ordered]@{ log = $log; status = 'ok'; errors = $err.count; warnings = $warn.count; truncated = ($err.truncated -or $warn.truncated) }
  } else {
    $reason = if (-not $err.ok) { $err.reason } else { $warn.reason }
    $logs += [ordered]@{ log = $log; status = 'unavailable'; reason = $reason }
  }
}

$result = [ordered]@{
  schema = 'hth.pcinfo.v1'
  collectedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  windowHours = $WindowHours
  network = $network
  firewall = $firewall
  eventLogs = [ordered]@{ windowHours = $WindowHours; logs = $logs }
}
$json = $result | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "saved: $OutFile"
Write-Output "collectedAt(UTC): $($result.collectedAt)  windowHours: $WindowHours"
Write-Output 'Counts are not intrusion or attack detection results. Nothing was changed on this PC.'
