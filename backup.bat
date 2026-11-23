@echo off
cd /d "%~dp0"
title TopCar - Backup dos dados
set PY=python
if exist ".venv\Scripts\python.exe" set PY=".venv\Scripts\python.exe"
%PY% dados.py backup
echo.
echo O arquivo ficou na pasta backups. Para levar a outra maquina: copie o ZIP e use o restaurar.bat la.
pause
