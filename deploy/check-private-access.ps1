param(
    [Parameter(Mandatory)][string]$ExpectedServiceSid,
    [Parameter(Mandatory)][string]$HandoffFile,
    [Parameter(Mandatory)][string]$ProtectedCollectorFile
)
# Read-only preflight. Run as the intended service identity, not as administrator.
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if ($ExpectedServiceSid -notmatch '^S-1-5-80-(\d+-){3,}\d+$' -or $identity.User.Value -ne $ExpectedServiceSid -or $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'The intended non-administrator virtual service account is required.'
}
$stream = [IO.File]::Open($HandoffFile, 'Open', 'Read', 'ReadWrite')
$stream.Dispose()
$writable = $false
try { $stream = [IO.File]::Open($HandoffFile, 'Open', 'Write', 'ReadWrite'); $writable = $true; $stream.Dispose() } catch [UnauthorizedAccessException] { }
if ($writable) { throw 'The service must not be able to write the handoff.' }
$readable = $false
try { $stream = [IO.File]::Open($ProtectedCollectorFile, 'Open', 'Read', 'ReadWrite'); $readable = $true; $stream.Dispose() } catch [UnauthorizedAccessException] { }
if ($readable) { throw 'Collector configuration must be inaccessible to this service.' }
'Read-only preflight passed. Runtime canonical-path, identity and payload checks still apply.'
