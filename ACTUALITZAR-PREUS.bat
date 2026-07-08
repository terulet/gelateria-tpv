@echo off
title Actualitzar preus - La Gelateria de Roses
color 0E
cd /d "%~dp0"

echo.
echo   ============================================
echo      ACTUALITZAR PREUS - La Gelateria
echo   ============================================
echo.
echo   Aixo aplica els preus del sistema sense
echo   esborrar les vendes ni els tancaments.
echo.

node --no-warnings servidor\actualizar-precios.js

echo.
pause
