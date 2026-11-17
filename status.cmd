@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\manage.ps1" status -PauseAtEnd %*
exit /b %errorlevel%
