@echo off
title POS La Gelateria de Roses
color 0A
cd /d "%~dp0"

echo.
echo   ============================================
echo      POS LA GELATERIA DE ROSES
echo   ============================================
echo.

REM Comprovar Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo   [ERROR] Node.js no esta instal.lat. https://nodejs.org
  pause
  exit /b
)

REM Dependencies (nomes el primer cop)
if not exist "node_modules" (
  echo   Primera execucio: instal.lant dependencies...
  call npm install
  echo.
)

REM ---- Buscar Chrome (funciona en Windows en qualsevol idioma) ----
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

echo   Engegant servidor...
echo.

REM Arrencar el servidor EN SEGON PLA (en una finestra a part)
start "Servidor POS" /min cmd /c "node --no-warnings servidor\server.js"

REM ESPERAR que el servidor estigui llest (comprovar cada segon, fins a 20s)
echo   Esperant que el servidor estigui a punt...
set /a intents=0
:esperar
timeout /t 1 >nul
set /a intents+=1
REM provar si el servidor respon
powershell -NoProfile -Command "try{(Invoke-WebRequest -Uri http://localhost:3001 -TimeoutSec 1 -UseBasicParsing)|Out-Null;exit 0}catch{exit 1}" >nul 2>nul
if %errorlevel% neq 0 (
  if %intents% LSS 20 goto esperar
)

echo   Servidor a punt! Obrint pantalla completa...

REM Obrir Chrome en mode KIOSK (pantalla completa)
if defined CHROME (
  "%CHROME%" --kiosk --app=http://localhost:3001 --overscroll-history-navigation=0
) else (
  echo   [AVIS] No s'ha trobat Chrome. Obrint navegador per defecte.
  start http://localhost:3001
)

REM Quan es tanca Chrome, aquesta finestra queda oberta (el servidor segueix en la seva finestra)
echo.
echo   Chrome tancat. El servidor segueix obert a la seva finestra.
echo   Pots tancar aquesta finestra.
pause
