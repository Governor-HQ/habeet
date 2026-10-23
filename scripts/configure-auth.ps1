# habeet: sets the sign-in email settings on your Supabase project (Brevo as the email sender).
# Run from the project folder:  .\scripts\configure-auth.ps1 -ProjectRef abcdefgh -SiteUrl https://your-habeet.vercel.app
# It asks for the secrets with hidden typing, so nothing lands in your PowerShell history or in git.
param(
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  [Parameter(Mandatory = $true)][string]$SiteUrl
)

$ErrorActionPreference = 'Stop'
$SiteUrl = $SiteUrl.TrimEnd('/')

function Get-Secret([string]$Name, [string]$Prompt) {
  $existing = [Environment]::GetEnvironmentVariable($Name)
  if ($existing) { return $existing }
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$token = Get-Secret 'SUPABASE_ACCESS_TOKEN' 'Supabase access token (Account, Access Tokens)'
$smtpUser = Get-Secret 'SMTP_USER' 'Brevo SMTP login (looks like 1234abc@smtp-brevo.com)'
$smtpPass = Get-Secret 'SMTP_PASS' 'Brevo SMTP key (not the API key)'
$from = Get-Secret 'SMTP_FROM' 'Verified sender email in Brevo (emails come from this address)'

$body = @{
  site_url              = $SiteUrl
  uri_allow_list        = "$SiteUrl,http://localhost:3000"
  smtp_host             = 'smtp-relay.brevo.com'
  smtp_port             = '587'
  smtp_user             = $smtpUser
  smtp_pass             = $smtpPass
  smtp_admin_email      = $from
  smtp_sender_name      = 'habeet'
  rate_limit_email_sent = 30
  password_min_length   = 8
  mailer_autoconfirm    = $false
} | ConvertTo-Json

$result = Invoke-RestMethod -Method Patch `
  -Uri "https://api.supabase.com/v1/projects/$ProjectRef/config/auth" `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType 'application/json' `
  -Body $body

# Show what was saved (the password is not printed)
$result | Select-Object site_url, uri_allow_list, smtp_host, smtp_port, smtp_admin_email, smtp_sender_name, rate_limit_email_sent, password_min_length, mailer_autoconfirm | Format-List
Write-Host 'Done. Create a test account in habeet and check the confirmation email arrives.'
