# Security Audit Log Investigation Script
# Uses only Search-UnifiedAuditLog cmdlet

# ============================================================================
# CONFIGURATION - Edit these values
# ============================================================================

$start = Get-Date "2026-04-28 03:30:00Z"  # Last cutoff (UTC)
$end = (Get-Date).ToUniversalTime()        # Now (UTC)

# Known attacker IPs
$badIPs = @(
    "41.108.243.252",
    "43.133.60.85",
    "45.8.98.142",
    "86.109.75.195",
    "203.30.221.7",
    "175.176.71.15",
    "175.176.71.24",
    "113.19.181.169",
    "113.19.181.90",
    "154.254.183.206",
    "172.69.17.195"
)

# Destructive operator
$destructiveUser = "business-basic@envicommops.onmicrosoft.com"

# OAuth backdoor app ID
$backdoorAppId = "14d82eec-204b-4c2f-b7e8-296a70dab67e"

# Suspect service principal
$suspectSP = "9a35edab-1a56-4992-a453-67a4972299f1"

# High-risk operations
$riskyOps = @(
    "Add user.", "Delete user.", "Update PasswordProfile.",
    "Add member to role.", "Remove member from role.",
    "Consent to application.", "Add service principal.", "Remove service principal.",
    "Add delegated permission grant.", "Add app role assignment grant to user.",
    "Add OAuth2PermissionGrant.", "Update application.", "Delete application.",
    "Set-Mailbox", "New-Mailbox", "Add-MailboxPermission", "Add-MailboxFolderPermission",
    "New-InboxRule", "Set-InboxRule", "Update-InboxRule", "ModifyFolderPermissions",
    "New-TransportRule", "Set-TransportRule",
    "StrongAuthenticationPhoneAppDetail set.", "StrongAuthenticationUserDetails set.",
    "Disable account.", "Enable account.", "Change user password.",
    "SiteCollectionAdminAdded", "SharingPolicyChanged", "SiteAccessWithCustomScripts"
)

# ============================================================================
# CHECK 1: Destructive Operator Activity
# ============================================================================

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " CHECK 1: Destructive Operator Activity" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host "`nQuerying: $destructiveUser" -ForegroundColor Yellow

$r1 = Search-UnifiedAuditLog -StartDate $start -EndDate $end `
    -UserIds $destructiveUser -ResultSize 5000 |
    Select-Object CreationDate, UserIds, Operations, ClientIP

if ($r1) {
    Write-Host "[ALERT] $($r1.Count) records found!" -ForegroundColor Red
    $r1 | Format-Table -AutoSize
} else {
    Write-Host "[OK] No activity" -ForegroundColor Green
}

# ============================================================================
# CHECK 2: OAuth Backdoor Usage
# ============================================================================

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " CHECK 2: OAuth Backdoor (Microsoft Graph CLI Tools)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host "`nQuerying app ID: $backdoorAppId" -ForegroundColor Yellow

$r2 = Search-UnifiedAuditLog -StartDate $start -EndDate $end `
    -FreeText $backdoorAppId -ResultSize 5000 |
    Select-Object CreationDate, UserIds, Operations, ClientIP

if ($r2) {
    Write-Host "[ALERT] $($r2.Count) records found!" -ForegroundColor Red
    $r2 | Format-Table -AutoSize
} else {
    Write-Host "[OK] No activity" -ForegroundColor Green
}

# ============================================================================
# CHECK 3: Suspect Service Principal
# ============================================================================

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " CHECK 3: Suspect Service Principal" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host "`nQuerying: $suspectSP" -ForegroundColor Yellow

$r3 = Search-UnifiedAuditLog -StartDate $start -EndDate $end `
    -FreeText $suspectSP -ResultSize 5000 |
    Select-Object CreationDate, UserIds, Operations

if ($r3) {
    Write-Host "[ALERT] $($r3.Count) records found!" -ForegroundColor Red
    $r3 | Format-Table -AutoSize
} else {
    Write-Host "[OK] No activity" -ForegroundColor Green
}

# ============================================================================
# CHECK 4: Known Attacker IPs
# ============================================================================

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " CHECK 4: Known Attacker IPs" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host "`nQuerying $($badIPs.Count) IPs..." -ForegroundColor Yellow

$r4 = Search-UnifiedAuditLog -StartDate $start -EndDate $end `
    -IPAddresses $badIPs -ResultSize 5000 |
    Select-Object CreationDate, UserIds, Operations, ClientIP

if ($r4) {
    Write-Host "[ALERT] $($r4.Count) records found!" -ForegroundColor Red
    $r4 | Format-Table -AutoSize
} else {
    Write-Host "[OK] No activity" -ForegroundColor Green
}

# ============================================================================
# CHECK 5: High-Risk Admin Operations
# ============================================================================

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " CHECK 5: High-Risk Admin Operations" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host "`nQuerying $($riskyOps.Count) operation types..." -ForegroundColor Yellow

$r5 = Search-UnifiedAuditLog -StartDate $start -EndDate $end `
    -Operations $riskyOps -ResultSize 5000 |
    Select-Object CreationDate, UserIds, Operations, ObjectIds, ClientIP

if ($r5) {
    Write-Host "[ALERT] $($r5.Count) records found!" -ForegroundColor Red
    $r5 | Format-Table -AutoSize
} else {
    Write-Host "[OK] No activity" -ForegroundColor Green
}

# ============================================================================
# CHECK 6: Sign-ins Grouped by IP
# ============================================================================

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " CHECK 6: Sign-ins Grouped by IP" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host "`nAnalyzing sign-in events..." -ForegroundColor Yellow

$signins = Search-UnifiedAuditLog -StartDate $start -EndDate $end `
    -RecordType AzureActiveDirectoryStsLogon -ResultSize 5000

if ($signins) {
    $decoded = $signins | ForEach-Object {
        $a = $_.AuditData | ConvertFrom-Json
        [PSCustomObject]@{
            Time = $_.CreationDate
            User = $_.UserIds
            Operation = $a.Operation
            IP = $a.ClientIP
            AppId = $a.ApplicationId
        }
    }
    
    $ipSummary = $decoded | Group-Object IP | Sort-Object Count -Descending | Select-Object Count, Name
    
    Write-Host "Total sign-ins: $($signins.Count)" -ForegroundColor Cyan
    $ipSummary | Format-Table -AutoSize
    
    # Check for bad IPs
    $badIpSignins = $decoded | Where-Object { $badIPs -contains $_.IP }
    if ($badIpSignins) {
        Write-Host "[ALERT] $($badIpSignins.Count) sign-ins from bad IPs!" -ForegroundColor Red
        $badIpSignins | Format-Table -AutoSize
    }
} else {
    Write-Host "[OK] No sign-ins found" -ForegroundColor Green
}

# ============================================================================
# CHECK 7: Full Export
# ============================================================================

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " CHECK 7: Full Export for Offline Analysis" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host "`nPulling all logs..." -ForegroundColor Yellow

$sid = [guid]::NewGuid().ToString()
$all = @()

do {
    $batch = Search-UnifiedAuditLog -StartDate $start -EndDate $end `
        -SessionId $sid -SessionCommand ReturnLargeSet -ResultSize 5000
    $all += $batch
    Write-Host "Pulled $($all.Count) rows..." -ForegroundColor Cyan
} while ($batch.Count -eq 5000)

if ($all) {
    $ts = $start.ToString('yyyyMMddHHmm')
    $all | Export-Csv -Path ".\audit-since-$ts.csv" -NoTypeInformation
    Write-Host "[SAVED] audit-since-$ts.csv ($($all.Count) records)" -ForegroundColor Green
} else {
    Write-Host "[EMPTY] No records" -ForegroundColor Yellow
}

# ============================================================================
# SUMMARY
# ============================================================================

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " COMPLETE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Window: $start UTC to $end UTC" -ForegroundColor Gray
Write-Host ""
Write-Host "Priority actions:" -ForegroundColor Yellow
Write-Host "  - If Check 1 has results: Disable $destructiveUser NOW" -ForegroundColor Red
Write-Host "  - If Check 2 has results: Revoke consent on SP dca85b3b-..." -ForegroundColor Red
Write-Host ""