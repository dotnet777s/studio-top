@echo off
cd /d "%~dp0"
title TopCar - Setor de Conteudo
where python >nul 2>nul
if errorlevel 1 (
  echo Python nao encontrado. Instale o Python 3.12 ou mais novo em https://www.python.org/downloads/
  echo e marque a opcao "Add python.exe to PATH" na instalacao. Depois abra este arquivo de novo.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo Preparando o ambiente pela primeira vez, aguarde...
  python -m venv .venv
  if errorlevel 1 ( pause & exit /b 1 )
)
fc /b requirements.txt ".venv\requirements.ok" >nul 2>nul
if errorlevel 1 (
  echo Instalando/atualizando as bibliotecas...
  ".venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r requirements.txt
  if errorlevel 1 ( echo Falha ao instalar as bibliotecas. Verifique a internet. & pause & exit /b 1 )
  copy /y requirements.txt ".venv\requirements.ok" >nul
)
if not exist ".env" (
  copy .env.example .env >nul
  echo.
  echo Primeira vez: preencha o arquivo .env que vai abrir agora
  echo com a chave do Gemini e o banco do estoque, salve e feche o Bloco de Notas.
  notepad .env
)
start "" /b cmd /c "timeout /t 5 >nul & start http://localhost:5000"
".venv\Scripts\python.exe" app.py
echo.
echo O app foi fechado.
pause
