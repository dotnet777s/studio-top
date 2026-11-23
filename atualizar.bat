@echo off
cd /d "%~dp0"
title TopCar - Atualizar o app
echo Baixando a versao mais nova do GitHub...
git pull --ff-only
if errorlevel 1 (
  echo Nao consegui atualizar. Se alguem editou arquivos do app nesta maquina, fale com o responsavel.
  pause
  exit /b 1
)
echo Atualizado. Feche o app (se estiver aberto) e abra de novo pelo iniciar.bat.
pause
