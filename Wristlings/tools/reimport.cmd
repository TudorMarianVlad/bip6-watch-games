@echo off
setlocal
rem Re-import edited source art and rebuild everything after Aseprite edits.
rem Usage: reimport.cmd emberwing,midnyx  (comma-separated ids, no spaces)

set "IDS=%*"
if "%IDS%"=="" (
  echo Usage: reimport.cmd id1,id2,id3
  echo Example: reimport.cmd emberwing,midnyx
  exit /b 1
)

set "WRIST=%~dp0.."
echo Re-importing: %IDS%

node "%~dp0import.cjs" --only "%IDS%" || exit /b 1
node "%~dp0sheet.cjs" || exit /b 1
node "%~dp0widget-preview.cjs" || exit /b 1
node "%~dp0roster.cjs" || exit /b 1

pushd "%WRIST%"
node "..\tools\preview.cjs" "Wristlings" --no-open || (popd & exit /b 1)
node "..\tools\publish-demos.cjs" || (popd & exit /b 1)
echo Building .zab...
call "%APPDATA%\npm\zeus.cmd" build
popd

echo Done. Check tools\sheet_named.png and docs\roster.html.
