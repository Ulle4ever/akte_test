# Firebase App Check einrichten (Bot-/Skript-Schutz)

App Check sorgt dafür, dass nur echte Aufrufe aus eurer echten App bei
Firestore ankommen - automatisierte Skripte/Bots, die versuchen direkt auf
die Datenbank zuzugreifen (z. B. um Codes durchzuprobieren), werden
blockiert, bevor sie überhaupt bei den Firestore-Regeln ankommen.

Kostenlos, ca. 10 Minuten, kein npm/Terminal nötig - alles in der
Firebase-Konsole.

## 1. App Check aktivieren und Site-Key holen

1. [Firebase-Konsole](https://console.firebase.google.com/) → euer Projekt
   (`rsk-test-dev`) öffnen.
2. Im linken Menü ganz unten unter **Build** (oder direkt sichtbar) auf
   **App Check** klicken.
3. Dort eure Web-App auswählen (Symbol `</>`) und auf **Registrieren**
   klicken.
4. Als Anbieter **reCAPTCHA v3** wählen. Firebase registriert das
   automatisch für euch und zeigt danach einen **Site-Key** an (eine lange
   Zeichenkette).
5. Diesen Site-Key kopieren und mir schicken - ich trage ihn in
   `index.html` ein:
   ```js
   const APPCHECK_SITE_KEY = "HIER_DEN_SITE-KEY_EINFÜGEN";
   ```
   (Das ist ein öffentlicher Schlüssel, unbedenklich im Code - genau wie
   der VAPID-Schlüssel für Push.)

## 2. Erstmal nur "beobachten", noch nicht erzwingen

Wichtig: **Noch nichts auf "Erzwingen" stellen!** Sobald der Site-Key im
Code ist und die App einmal neu geladen wurde, schickt sie automatisch
einen Nachweis ("das ist wirklich die echte App") mit jeder Anfrage mit -
aber Firestore verlangt diesen Nachweis noch nicht. So merkt ihr, falls
etwas nicht passt, ohne dass die App für irgendjemanden kaputtgeht.

In der Firebase-Konsole unter **App Check → Zusammenfassung/APIs** seht
ihr nach ein paar Stunden Nutzung eine Grafik mit "Verified requests" vs.
"Unverified" für Cloud Firestore. Wenn dort deutlich die meisten Anfragen
als "verified" markiert sind (typischerweise nach 24 Stunden normaler
Nutzung durch euch), ist der nächste Schritt sicher.

## 3. Erzwingen aktivieren

Erst wenn Schritt 2 zeigt, dass es zuverlässig funktioniert:

1. Firebase-Konsole → **App Check** → Tab **APIs**.
2. Bei **Cloud Firestore** auf **Erzwingen** klicken.

Ab da lehnt Firestore jede Anfrage ohne gültigen App-Check-Nachweis ab -
also z. B. Skripte, die versuchen, direkt (ohne die echte Website zu
laden) auf die Datenbank zuzugreifen.

## Falls etwas schiefgeht

Sollte nach dem Erzwingen doch mal etwas nicht laden (z. B. weil ein
Gerät/Browser reCAPTCHA blockiert), einfach in der Konsole unter
**App Check → APIs** bei Cloud Firestore wieder auf "Nicht erzwingen"
zurückstellen - das schaltet die Zusatz-Prüfung sofort wieder ab, ohne
dass am Code etwas geändert werden muss.
