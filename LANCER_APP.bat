@echo off
title LM Watermark - Demarrage

echo.
echo  ==========================================
echo   LM Watermark - Luc Moreno Photographe
echo  ==========================================
echo.

:: Verifier Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERREUR] Node.js n'est pas installe ou pas dans le PATH.
    echo  Telechargez-le sur https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [OK] Node.js detecte : %NODE_VER%
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo  [INFO] Installation des dependances (premiere fois, 2-3 minutes)...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERREUR] L'installation a echoue.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Dependances installees.
) else (
    echo  [OK] Dependances deja installees.
)

echo.
echo  [INFO] Demarrage de l'application...
echo.

call npm start

if %errorlevel% neq 0 (
    echo.
    echo  [ERREUR] L'application n'a pas pu demarrer.
    pause
)
