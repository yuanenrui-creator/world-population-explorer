@echo off
title GlobalPulse - World Population Explorer
echo Starting GlobalPulse Web Application...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
pause
