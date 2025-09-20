@echo off

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js not found, please install Node.js first
    exit /b 1
)

REM Change directory to script location
cd /d %~dp0

REM Create VBScript for completely hidden startup
echo Set WshShell = CreateObject("WScript.Shell") > start_hidden.vbs
echo WshShell.Run "node src/server.js", 0, False >> start_hidden.vbs
echo Set WshShell = Nothing >> start_hidden.vbs

REM Execute VBScript to start server completely hidden
cscript //nologo start_hidden.vbs

REM Wait a short time for server to start
timeout /t 1 /nobreak >nul

REM Open browser to access loading page
START "" http://localhost:3001/loading

REM Clean up temporary VBScript file
del start_hidden.vbs