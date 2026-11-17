@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\manage.ps1" uninstall -PauseAtEnd %*
exit /b %errorlevel%
