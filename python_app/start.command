#!/bin/bash
cd "$(dirname "$0")"
if command -v python3 &>/dev/null; then
    PY=python3
elif command -v python &>/dev/null; then
    PY=python
else
    echo "Python wurde nicht gefunden. Bitte von https://www.python.org/downloads/ installieren."
    read -p "Enter zum Beenden..."
    exit 1
fi
echo "Pruefe/installiere benoetigte Pakete (beim ersten Mal dauert das ein paar Minuten)..."
$PY -m pip install -q -r requirements.txt || { echo "Installation fehlgeschlagen."; read -p "Enter zum Beenden..."; exit 1; }
echo ""
echo "Starte Spielzug-Analyse..."
$PY app.py
read -p "Enter zum Beenden..."
