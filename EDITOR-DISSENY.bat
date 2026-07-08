@echo off
title Editor de disseny - La Gelateria de Roses
color 0B
cd /d "%~dp0"

echo.
echo   ============================================
echo      EDITOR DE DISSENY - La Gelateria
echo   ============================================
echo.
echo   S'obrira l'editor al navegador.
echo   Ajusta el disseny al teu gust i prem
echo   "Genera-ho" quan t'agradi.
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo   [ERROR] Node.js no esta instal.lat.
  pause
  exit /b
)

if not exist "node_modules" call npm install

start "" cmd /c "timeout /t 2 >nul & start http://localhost:3001/editor.html"
node --no-warnings servidor\server.js
pause
