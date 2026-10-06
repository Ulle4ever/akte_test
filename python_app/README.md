# Spielzug-Analyse (neu aufgebaut)

Kompletter Neuaufbau des Basketball-Taktikdiagramm-Tools. Statt der alten handgestrickten
Browser-Lösung (coco-ssd + selbstgebauter Bildvergleichs-Tracker) läuft die Erkennung/Verfolgung
jetzt über **YOLO11** (Objekterkennung) + **ByteTrack** (professioneller Multi-Objekt-Tracker,
Industriestandard für genau diesen Anwendungsfall).

## Installation

**Windows:** Doppelklick auf `start.bat`. Installiert beim ersten Mal automatisch alles Nötige
und startet die App - öffnet den Browser automatisch.

**Mac:** Doppelklick auf `start.command` (bei der ersten Ausführung ggf. Rechtsklick → "Öffnen",
falls macOS wegen "unbekanntem Entwickler" warnt).

**Von Hand (alle Systeme):**
```bash
cd python_app
pip install -r requirements.txt
python app.py
```

Die App öffnet automatisch eine Browser-Seite unter `http://localhost:7860` (falls nicht:
manuell aufrufen). Das Terminal-/Konsolenfenster muss dabei offen bleiben, solange die App
läuft - zum Beenden `Strg+C` (Mac: `Cmd+C`).

## Wichtig: realistische Erwartung

Vor dem Neuaufbau wurde die neue Erkennung (mehrere YOLO-Modellgrößen + ByteTrack **und**
BoT-SORT) gezielt an einem echten Testvideo geprüft (siehe `spike_test.py`, `spike_test2.py`).
Ergebnis: Der Tracking-Algorithmus selbst ist **nicht** der Flaschenhals - alle getesteten
Algorithmen zeigen dasselbe Verhalten. Bei kleinen, schnellen, teils verdeckten Spielern aus
dieser Kameraperspektive schwankt die Erkennungssicherheit eines generischen, nicht auf das
eigene Video trainierten Modells frame-für-frame um die Schwelle, an der ein Spieler als
"derselbe" erkannt wird - das lässt JEDEN Tracker gelegentlich eine neue Spur-ID vergeben.

**Das heißt:** Die neue Version ist sauberer, schneller und einfacher zu bedienen, aber
"garantiert nie eine falsche Spur-ID" ist mit einem fertigen Modell nicht erreichbar. Deswegen
gibt es in Schritt 5 ein bewusst einfach gehaltenes "Spuren zusammenführen"-Werkzeug: zwei
Zahlen eintragen, fertig.

**Der zuverlässigste Weg zu echter Nahe-100%-Genauigkeit** bleibt ein auf die eigene
Kamera/Halle/Trikots trainiertes Modell (ca. 20-30 Minuten Label-Arbeit auf eigenen
Video-Standbildern, z.B. über Roboflow). Die Architektur ist bewusst so gebaut, dass das
jederzeit nachgerüstet werden kann, ohne sonst etwas zu ändern:

- In der Oberfläche im Dropdown "Modellgröße" den Pfad zur eigenen trainierten `.pt`-Datei
  eintragen (oder `pipeline.run_detection_and_tracking(..., model_path="dein_modell.pt")`
  direkt aufrufen) - der Rest der Pipeline (Tracking, Kalibrierung, Diagramm) bleibt unverändert.

## Aufbau

- `court.py` - Spielfeld-Geometrie und Kalibrierungs-Mathematik (Homographie), 1:1 aus der alten
  JS-Version übernommen und in Python nachgebaut (gleiche Formeln, gleiche Warnmeldungen bei
  schlechter Kalibrierungsabdeckung).
- `pipeline.py` - Kernverarbeitung: YOLO+ByteTrack über das ganze Video laufen lassen,
  Erkennungen auf Plausibilität fürs Spielfeld filtern (Position + erwartete Körpergröße an der
  jeweiligen Stelle), auf Feld-Koordinaten projizieren.
- `diagram.py` - zeichnet das Taktikdiagramm (Einzelbild oder ganzer Spielzug überlagert) als PNG.
- `app.py` - die Weboberfläche (Gradio): Video laden, Kalibrieren (Punkte anklicken), Verarbeiten,
  die 5 Offense-Spieler auswählen (anklicken), Spuren zusammenführen, Diagramm exportieren.

## Arbeitsablauf

Die Schritte erscheinen nacheinander, sobald der vorherige abgeschlossen ist (kein Scrollen durch
sechs Abschnitte gleichzeitig). Ein gemeinsamer Zeit-Regler oben gilt für Kalibrierung,
Spieler-Auswahl und Einzelbild-Diagramm - nicht mehr drei getrennte Regler wie in der ersten
Version.

1. **Video laden** - beliebiges Format, das OpenCV lesen kann (mp4, webm, mov, ...).
2. **Kalibrieren** - die vorgeschlagenen Feld-Punkte der Reihe nach anklicken (die Liste springt
   nach jedem Klick automatisch zum nächsten, die ersten 4 sind meist aus den meisten
   Kamerawinkeln sichtbar). **Über möglichst das ganze sichtbare Feld verteilt** klicken (nicht
   nur den Freiwurfraum) - sonst werden Positionen weit weg von den Punkten ungenau (wird als
   Warnung angezeigt).
3. **Verarbeiten** - läuft automatisch über das ganze Video (dauert je nach Länge/Modellgröße
   ca. 1-5 Minuten). Größeres Modell = genauer, aber langsamer.
4. **Offense-Spieler auswählen** - bis zu 5 erkannte Spieler anklicken. Jede erkannte Person ist
   klickbar, auch blass dargestellte (unsichere Feld-Position laut Kalibrierung, meist
   Zuschauer/Bank - aber nie komplett ausgeblendet, s.u.).
5. **Spuren zusammenführen** - falls eine Spur-Nummer während der Verfolgung gewechselt hat.
6. **Diagramm** - Einzelbild (aktueller Zeitpunkt) oder ganzer Spielzug überlagert, als PNG
   exportierbar.

## Wichtige Design-Entscheidung: nie "nichts zum Auswählen"

Eine frühere Version hat Erkennungen, die laut Kalibrierung nicht plausibel auf dem Feld lagen,
komplett verworfen - bei nur leicht ungenauer Kalibrierung konnte das **alle** echten Spieler
treffen, sodass Schritt 4 nichts zum Anklicken zeigte und das Diagramm leer/falsch war. Jetzt
wird jede erkannte Person immer angezeigt und bleibt klickbar; die Feld-Plausibilität ist nur
noch ein visueller Hinweis (blasser Punkt), kein Ausschlusskriterium. Eine ungenaue Kalibrierung
kostet dadurch höchstens Positions-Genauigkeit (sichtbar und durch Neukalibrieren behebbar),
nie einen kompletten Stillstand.
