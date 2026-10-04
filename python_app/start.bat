@echo off
cd /d "%~dp0"
echo Pruefe/installiere benoetigte Pakete (beim ersten Mal dauert das ein paar Minuten)...
py -m pip install -q -r requirements.txt
if errorlevel 1 (
    echo.
    echo Installation fehlgeschlagen - siehe Fehlermeldung oben.
    pause
    exit /b 1
)
echo.
echo Starte Spielzug-Analyse...
py app.py
pause
