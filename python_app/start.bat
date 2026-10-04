@echo off
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
    set PYCMD=python
) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
        set PYCMD=py
    ) else (
        echo Python wurde nicht gefunden.
        echo Bitte von https://www.python.org/downloads/ installieren - beim Installieren
        echo unbedingt den Haken bei "Add python.exe to PATH" setzen - und dieses
        echo Fenster danach schliessen und start.bat neu starten.
        pause
        exit /b 1
    )
)

echo Verwende: %PYCMD%
echo Pruefe/installiere benoetigte Pakete (beim ersten Mal dauert das ein paar Minuten)...
%PYCMD% -m pip install -q -r requirements.txt
if errorlevel 1 (
    echo.
    echo Installation fehlgeschlagen - siehe Fehlermeldung oben.
    pause
    exit /b 1
)
echo.
echo Starte Spielzug-Analyse...
%PYCMD% app.py
pause
