# habeet: makes the live site public (turns off Vercel Authentication) and checks that everything answers.
# Run from the project folder:  .\scripts\go-live.ps1
# It asks for a Vercel token with hidden typing. Nothing is stored.
$ErrorActionPreference = 'Stop'
$site = 'https://habeet.vercel.app'

if (-not (Test-Path '.vercel\project.json')) { throw 'Run this from the habeet folder after running "npx vercel" once.' }
$proj = Get-Content '.vercel\project.json' -Raw | ConvertFrom-Json

$secure = Read-Host -Prompt 'Vercel token (vercel.com/account/tokens)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }

# 1. Turn off Vercel Authentication so anyone can open the site
$uri = 'https://api.vercel.com/v9/projects/' + $proj.projectId + '?teamId=' + $proj.orgId
Invoke-RestMethod -Method Patch -Uri $uri -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body '{"ssoProtection":null}' | Out-Null
Write-Host 'Vercel Authentication turned off.'
Start-Sleep -Seconds 5

# 2. The site answers without a login
$r = Invoke-WebRequest -Uri $site -UseBasicParsing
Write-Host ("Site status: " + $r.StatusCode + " (200 means it is public)")

# 3. The live config points at your Supabase project
$cfg = (Invoke-WebRequest -Uri ($site + '/js/config.js') -UseBasicParsing).Content
$m = [regex]::Match($cfg, "supabaseUrl: '([^']+)'")
$k = [regex]::Match($cfg, "supabaseKey: '([^']+)'")
if (-not $m.Success -or -not $k.Success) { throw 'js/config.js on the live site has no Supabase address or key.' }
Write-Host ("Live config points at: " + $m.Groups[1].Value)

# 4. Strangers cannot read the data table with just the public key
try {
  $rows = Invoke-RestMethod -Uri ($m.Groups[1].Value + '/rest/v1/user_data?select=*') -Headers @{ apikey = $k.Groups[1].Value }
  Write-Host ("Public read returned " + @($rows).Count + " rows (0 is correct).")
} catch {
  Write-Host 'Public read was blocked (correct).'
}
Write-Host 'Done. Now create an account at the site and check the email arrives.'
