@echo off
setlocal

:: ============================================================
:: LogosPOS Print Agent — Desinstalador de Servicio Windows
:: Ejecutar como Administrador
:: ============================================================

title LogosPOS Print Agent — Desinstalacion

echo.
echo  =====================================================
echo   LogosPOS Print Agent ^| Desinstalacion
echo  =====================================================
echo.

:: Verificar que se ejecuta como administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Este script debe ejecutarse como Administrador.
    echo.
    echo  Haz clic derecho y selecciona "Ejecutar como administrador".
    pause
    exit /b 1
)

set "AGENT_DIR=%~dp0"
set "AGENT_DIR=%AGENT_DIR:~0,-1%"
set "SERVICE_NAME=LogosPOS-PrintAgent"
set "NSSM_EXE=%AGENT_DIR%\nssm\nssm.exe"

:: Verificar que el servicio existe
sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo  El servicio "%SERVICE_NAME%" no esta instalado.
    echo.
    pause
    exit /b 0
)

echo  Deteniendo servicio...
"%NSSM_EXE%" stop "%SERVICE_NAME%" >nul 2>&1
timeout /t 3 /nobreak >nul

echo  Eliminando servicio...
"%NSSM_EXE%" remove "%SERVICE_NAME%" confirm
if %errorlevel% equ 0 (
    echo.
    echo  Servicio eliminado correctamente.
) else (
    echo.
    echo  [ERROR] No se pudo eliminar el servicio.
    echo  Intentando con sc.exe...
    sc delete "%SERVICE_NAME%"
)

echo.
echo  =====================================================
echo   Desinstalacion completada
echo  =====================================================
echo.
echo  El agente ya no se iniciara automaticamente.
echo  Los archivos de la carpeta print-agent no se eliminaron.
echo.
pause
