@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\TopCar Conteudo.lnk'); $s.TargetPath='%~dp0iniciar.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
echo Pronto: o app vai abrir sozinho (minimizado) quando o Windows ligar.
echo Para desfazer, apague o atalho "TopCar Conteudo" da pasta Inicializar (Win+R, shell:startup).
pause
