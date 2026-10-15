@echo off
rem google-services-mcps bootstrap installer for Windows Command Prompt (cmd.exe).
rem It downloads the repository zip from GitHub, replaces the install folder, and runs gsm.mjs with every argument.
rem
rem One-liners (Windows Command Prompt):
rem   curl -fsSL -o "%TEMP%\install-gsm.cmd" https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.cmd && "%TEMP%\install-gsm.cmd" install --agent claude --plugin gmail
rem   curl -fsSL -o "%TEMP%\install-gsm.cmd" https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.cmd && "%TEMP%\install-gsm.cmd" uninstall --all --yes
rem
rem Environment (all optional):
rem   GSM_ARCHIVE_URL  full URL or file:// URL of a zip archive. Overrides GSM_REF.
rem   GSM_REF          branch, tag or commit (default main), used as .../zip/GSM_REF on codeload.github.com.
rem   GSM_DIR          install folder (default %USERPROFILE%\google-services-mcps).
rem
rem With no arguments it prints the usage and exits 0 without downloading.
rem Delayed expansion is not enabled, so the arguments reach gsm.mjs exactly as typed (quote the ones with spaces).
rem Every goto in this file jumps forward, and :cleanup is the last label. Batch files saved with LF line endings
rem (the repository form, which the raw download gives) fail on a backward goto with "cannot find the batch label".

setlocal
set "GSM_RC=1"
set "TMP_DIR="
set "STAGE="
if "%~1"=="" goto :usage

rem Node.js 20 or newer is required. Nothing is installed automatically. call: a node.cmd shim would otherwise end this file.
set "GSM_NODE_OK="
call node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" >nul 2>&1 && set "GSM_NODE_OK=1"
if not defined GSM_NODE_OK goto :no_node

rem A new temporary folder for the download and the extraction. It is removed at the end, also after an error.
set "TMP_DIR=%TEMP%\gsm-install-%RANDOM%%RANDOM%"
md "%TMP_DIR%" >nul 2>&1
if not exist "%TMP_DIR%\" goto :fail_tmp
set "EXTRACT=%TMP_DIR%\extract"
md "%EXTRACT%" >nul 2>&1

set "GSM_URL=https://codeload.github.com/FiredMosquito831/google-services-mcps/zip/refs/heads/main"
if defined GSM_REF set "GSM_URL=https://codeload.github.com/FiredMosquito831/google-services-mcps/zip/%GSM_REF%"
if defined GSM_ARCHIVE_URL set "GSM_URL=%GSM_ARCHIVE_URL%"

echo Downloading google-services-mcps from GitHub ...
curl -fsSL -o "%TMP_DIR%\source.zip" "%GSM_URL%"
if errorlevel 1 goto :fail_download

rem tar: the System32 copy is bsdtar, which reads zip. Falls back to whatever tar is on PATH.
set "TAR=%SystemRoot%\System32\tar.exe"
if not exist "%TAR%" set "TAR=tar"
"%TAR%" -xf "%TMP_DIR%\source.zip" -C "%EXTRACT%"
if errorlevel 1 goto :fail_extract

rem The archive has one top folder (google-services-mcps-main). Use the folder that holds gsm.mjs.
set "GSM_SRC="
if exist "%EXTRACT%\gsm.mjs" set "GSM_SRC=%EXTRACT%"
pushd "%EXTRACT%"
for /d %%D in (*) do if exist "%%~fD\gsm.mjs" set "GSM_SRC=%%~fD"
popd
if not defined GSM_SRC goto :fail_source

rem The new copy is staged next to the install folder, then the old folder is removed and the copy renamed into place.
set "INSTALL_DIR=%USERPROFILE%\google-services-mcps"
if defined GSM_DIR set "INSTALL_DIR=%GSM_DIR%"
set "STAGE=%INSTALL_DIR%.partial"
for %%P in ("%INSTALL_DIR%\..") do set "INSTALL_PARENT=%%~fP"
md "%INSTALL_PARENT%" >nul 2>&1
if exist "%STAGE%" rd /s /q "%STAGE%"
move "%GSM_SRC%" "%STAGE%" >nul
if errorlevel 1 goto :fail_move
if exist "%INSTALL_DIR%" rd /s /q "%INSTALL_DIR%"
if exist "%INSTALL_DIR%" goto :fail_move
move "%STAGE%" "%INSTALL_DIR%" >nul
if errorlevel 1 goto :fail_move
set "STAGE="

rem The download is in place, so the temporary folder goes now.
rd /s /q "%TMP_DIR%"
set "TMP_DIR="

echo Installing with: node gsm.mjs %*
node "%INSTALL_DIR%\gsm.mjs" %*
set "GSM_RC=%ERRORLEVEL%"
goto :cleanup

:usage
echo google-services-mcps installer for Windows Command Prompt
echo.
echo   Install:    curl -fsSL -o "%%TEMP%%\install-gsm.cmd" https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.cmd ^&^& "%%TEMP%%\install-gsm.cmd" install --agent claude --plugin gmail
echo   Uninstall:  curl -fsSL -o "%%TEMP%%\install-gsm.cmd" https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.cmd ^&^& "%%TEMP%%\install-gsm.cmd" uninstall --all --yes
echo.
echo Run with install, list, uninstall, status, products, doctor or --help
exit /b 0

:no_node
echo Node.js 20 or newer is required, and node was not found or is older. 1>&2
echo Get it from https://nodejs.org 1>&2
echo Or install it with: winget install OpenJS.NodeJS.LTS 1>&2
goto :cleanup

:fail_tmp
echo Could not create a temporary folder under %TEMP%. 1>&2
goto :cleanup

:fail_download
echo Download failed. Check the network, or the GSM_ARCHIVE_URL setting. 1>&2
goto :cleanup

:fail_extract
echo Could not extract the download with tar. 1>&2
goto :cleanup

:fail_source
echo The download does not contain gsm.mjs. Check GSM_REF or GSM_ARCHIVE_URL. 1>&2
goto :cleanup

:fail_move
echo Could not put the install folder in place: "%INSTALL_DIR%" 1>&2
goto :cleanup

:cleanup
if defined STAGE if exist "%STAGE%" rd /s /q "%STAGE%"
if defined TMP_DIR if exist "%TMP_DIR%" rd /s /q "%TMP_DIR%"
exit /b %GSM_RC%
