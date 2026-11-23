@echo off
cd /d "%~dp0"
title TopCar - Restaurar dados
set PY=python
if exist ".venv\Scripts\python.exe" set PY=".venv\Scripts\python.exe"
set ARQ=%~1
if "%ARQ%"=="" set /p ARQ=Arraste aqui o arquivo ZIP do backup e aperte Enter:
%PY% dados.py restaurar %ARQ%
pause
