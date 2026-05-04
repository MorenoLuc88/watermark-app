@echo off
title LM Watermark - Compilation EXE

echo.
echo  ==========================================
echo   LM Watermark - Compilation EXE
echo  ==========================================
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo  [INFO] Installation des dependances...
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERREUR] npm install a echoue.
        pause
        exit /b 1
    )
)

echo  [INFO] Desactivation de la signature de code...
set WIN_CSC_LINK=
set CSC_LINK=
set CSC_IDENTITY_AUTO_DISCOVERY=false

echo  [INFO] Compilation en cours... (5-10 minutes)
echo  [INFO] Le fichier .exe sera dans le dossier dist\
echo.

call npx electron-builder --win --x64

if %errorlevel% equ 0 (
    echo.
    echo  [OK] Compilation reussie !
    echo  [INFO] Ton .exe est dans le dossier dist\
    start explorer dist
) else (
    echo.
    echo  [ERREUR] La compilation a echoue.
)

pause
