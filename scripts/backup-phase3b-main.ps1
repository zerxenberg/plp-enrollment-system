# Manual main-project backup gate. Requires PostgreSQL 17+ pg_dump/pg_restore.
# Run from the project root after setting SUPABASE_DB_HOST, SUPABASE_DB_PORT,
# SUPABASE_DB_USER, SUPABASE_DB_NAME in the local PowerShell session.
# Use the session pooler host from Supabase Dashboard > Connect if needed.
# Never store or pass the database password in a command argument or repository.
$ErrorActionPreference = 'Stop'

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw 'pg_dump is unavailable. Install PostgreSQL 17 client tools first.'
}
if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) {
  throw 'pg_restore is unavailable. Install PostgreSQL 17 client tools first.'
}
foreach ($required in @('SUPABASE_DB_HOST','SUPABASE_DB_USER','SUPABASE_DB_NAME')) {
  if (-not [Environment]::GetEnvironmentVariable($required)) {
    throw "Required local environment variable $required is missing."
  }
}
$dumpMajor = [regex]::Match((& pg_dump --version), '(\d+)(?:\.\d+)?\s*$')
if (-not $dumpMajor.Success -or [int]$dumpMajor.Groups[1].Value -lt 17) {
  throw 'Use PostgreSQL 17 or newer client tools for this PostgreSQL 17 database.'
}

$backupDirectory = Join-Path $env:USERPROFILE 'PLP-Enrollment-Private-Backups'
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$backupFile = Join-Path $backupDirectory ("plp-main-before-phase3b-$timestamp.dump")
$manifestFile = "$backupFile.sha256"

$env:PGHOST = $env:SUPABASE_DB_HOST
$env:PGPORT = if ($env:SUPABASE_DB_PORT) { $env:SUPABASE_DB_PORT } else { '5432' }
$env:PGUSER = $env:SUPABASE_DB_USER
$env:PGDATABASE = $env:SUPABASE_DB_NAME
$env:PGSSLMODE = 'require'

# pg_dump reads the password through the local process environment, never a
# URL or command line argument. Release it on exit and do not print it.
$secret = Read-Host 'Supabase PostgreSQL password (local prompt only)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  & pg_dump --format=custom --no-owner --no-acl --file="$backupFile"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump exited with $LASTEXITCODE." }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
if (-not (Test-Path -LiteralPath $backupFile)) {
  throw 'Backup file was not created.'
}
if ((Get-Item -LiteralPath $backupFile).Length -lt 1024) {
  throw 'Backup file size is unexpectedly small. Treat as invalid.'
}
& pg_restore --list "$backupFile" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'pg_restore could not read the archive catalog. Treat as invalid.'
}
$hash = (Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash
Set-Content -LiteralPath $manifestFile -Value "$hash  $([IO.Path]::GetFileName($backupFile))" -Encoding Ascii
Write-Output "Backup archive created: $backupFile"
Write-Output "SHA256: $hash"
Write-Output 'Archive catalog verified. A separate full restore test is still required before applying production migrations.'
