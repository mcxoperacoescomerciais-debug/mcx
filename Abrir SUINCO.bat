@echo off
title SUINCO - Gestao de Loja (deixe esta janela aberta)
cd /d "%~dp0web"
echo.
echo  SUINCO ^| Gestao de Loja
echo  ------------------------
echo  O sistema esta iniciando. O navegador abre sozinho em alguns segundos.
echo  Deixe ESTA janela aberta enquanto usa o sistema. Para encerrar, feche-a.
echo.
if not exist node_modules (
  echo  Primeira execucao: instalando componentes, pode levar alguns minutos...
  call npm.cmd install
)
start "" cmd /c "timeout /t 12 /nobreak >nul && start http://localhost:3000/login"
call npm.cmd run dev
