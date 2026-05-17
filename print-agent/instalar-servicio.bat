@echo off
setlocal enabledelayedexpansion

:: ============================================================
:: LogosPOS Print Agent — Instalador de Servicio Windows
:: Ejecutar como Administrador
:: ============================================================

title LogosPOS Print Agent — Instalacion

echo.
echo  =====================================================
echo   LogosPOS Print Agent ^| Instalacion de Servicio
echo  =====================================================
echo.

:: Verificar que se ejecuta como administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Este script debe ejecutarse como Administrador.
    echo.
    echo  Haz clic derecho en el archivo y selecciona
    echo  "Ejecutar como administrador".
    echo.
    pause
    exit /b 1
)

:: Directorio de este script
set "AGENT_DIR=%~dp0"
set "AGENT_DIR=%AGENT_DIR:~0,-1%"
set "SERVICE_NAME=LogosPOS-PrintAgent"
set "NSSM_URL=https://nssm.cc/release/nssm-2.24.zip"
set "NSSM_DIR=%AGENT_DIR%\nssm"
set "NSSM_EXE=%NSSM_DIR%\nssm.exe"

echo  Directorio del agente: %AGENT_DIR%
echo.

:: ── 1. Verificar Node.js ────────────────────────────────────
echo  [1/5] Verificando Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Node.js no esta instalado.
    echo.
    echo  Descargalo desde: https://nodejs.org  (version 18 o superior)
    echo  Luego vuelve a ejecutar este instalador.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  OK — Node.js %NODE_VER% encontrado.
echo.

:: ── 2. Instalar dependencias npm ────────────────────────────
echo  [2/5] Instalando dependencias npm...
cd /d "%AGENT_DIR%"
call npm install --omit=dev --silent
if %errorlevel% neq 0 (
    echo  [ERROR] Fallo npm install. Revisa tu conexion a internet.
    pause
    exit /b 1
)
echo  OK — Dependencias instaladas.
echo.

:: ── 3. Descargar NSSM si no existe ──────────────────────────
echo  [3/5] Verificando NSSM (gestor de servicios)...
if not exist "%NSSM_EXE%" (
    echo  Descargando NSSM...
    if not exist "%NSSM_DIR%" mkdir "%NSSM_DIR%"

    :: Intentar descarga con PowerShell
    powershell -Command "try { Invoke-WebRequest -Uri '%NSSM_URL%' -OutFile '%NSSM_DIR%\nssm.zip' -UseBasicParsing -ErrorAction Stop } catch { exit 1 }" >nul 2>&1
    if %errorlevel% neq 0 (
        echo  [ERROR] No se pudo descargar NSSM automaticamente.
        echo.
        echo  Descargalo manualmente desde: https://nssm.cc/download
        echo  Extrae nssm.exe (carpeta win64) y copialo a:
        echo  %NSSM_DIR%\nssm.exe
        echo.
        pause
        exit /b 1
    )

    :: Extraer nssm.exe (versión 64-bit)
    powershell -Command "Expand-Archive -Path '%NSSM_DIR%\nssm.zip' -DestinationPath '%NSSM_DIR%\tmp' -Force" >nul 2>&1
    copy /y "%NSSM_DIR%\tmp\nssm-2.24\win64\nssm.exe" "%NSSM_EXE%" >nul 2>&1
    rmdir /s /q "%NSSM_DIR%\tmp" >nul 2>&1
    del /q "%NSSM_DIR%\nssm.zip" >nul 2>&1

    if not exist "%NSSM_EXE%" (
        echo  [ERROR] No se pudo extraer nssm.exe.
        pause
        exit /b 1
    )
    echo  OK — NSSM descargado.
) else (
    echo  OK — NSSM ya presente.
)
echo.

:: ── 4. Eliminar servicio anterior si existe ─────────────────
echo  [4/5] Configurando servicio de Windows...
sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo  Servicio anterior encontrado, eliminando...
    "%NSSM_EXE%" stop "%SERVICE_NAME%" >nul 2>&1
    "%NSSM_EXE%" remove "%SERVICE_NAME%" confirm >nul 2>&1
    timeout /t 2 /nobreak >nul
)

:: Obtener ruta de node.exe
for /f "tokens=*" %%n in ('where node') do set NODE_EXE=%%n

:: Registrar el servicio
"%NSSM_EXE%" install "%SERVICE_NAME%" "%NODE_EXE%" "server.js"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppDirectory "%AGENT_DIR%"
"%NSSM_EXE%" set "%SERVICE_NAME%" DisplayName "LogosPOS Print Agent"
"%NSSM_EXE%" set "%SERVICE_NAME%" Description "Agente de impresion termica para LogosPOS. Puente HTTP a TCP para impresoras ESC/POS."
"%NSSM_EXE%" set "%SERVICE_NAME%" Start SERVICE_AUTO_START
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStdout "%AGENT_DIR%\logs\agent.log"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStderr "%AGENT_DIR%\logs\agent-error.log"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateFiles 1
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateBytes 5242880
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRestartDelay 3000

:: Crear carpeta de logs
if not exist "%AGENT_DIR%\logs" mkdir "%AGENT_DIR%\logs"

echo  OK — Servicio registrado.
echo.

:: ── 5. Iniciar el servicio ───────────────────────────────────
echo  [5/5] Iniciando servicio...
"%NSSM_EXE%" start "%SERVICE_NAME%"
timeout /t 3 /nobreak >nul

sc query "%SERVICE_NAME%" | find "RUNNING" >nul 2>&1
if %errorlevel% equ 0 (
    echo  OK — Servicio iniciado correctamente.
) else (
    echo  [ADVERTENCIA] El servicio no reporto estado RUNNING inmediatamente.
    echo  Puede que tarde unos segundos. Verifica en Servicios de Windows.
)

echo.
echo  =====================================================
echo   Instalacion completada exitosamente
echo  =====================================================
echo.
echo  El agente de impresion esta activo en:
echo    http://localhost:3000
echo.
echo  Se iniciara automaticamente cada vez que arranque Windows.
echo.
echo  Para verificar: abre el navegador y ve a
echo    http://localhost:3000/health
echo.
echo  Logs del agente: %AGENT_DIR%\logs\
echo.
pause
