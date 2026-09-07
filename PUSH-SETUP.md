# Push-Benachrichtigungen einrichten

Einmalige Einrichtung, danach läuft alles automatisch. Etwa 15-20 Minuten.

## 1. Firebase-Projekt auf Blaze umstellen

Cloud Functions (Schritt 4) laufen nicht im kostenlosen Spark-Tarif. In der
[Firebase-Konsole](https://console.firebase.google.com/) → euer Projekt →
unten links "Blaze-Tarif upgraden" → Zahlungsmethode hinterlegen.

**Kosten:** Bei eurer Nutzungsgröße bleibt ihr praktisch immer bei 0 €
(2 Mio. Funktionsaufrufe/Monat sind im Blaze-Tarif weiterhin kostenlos).
Das eigentliche Verschicken der Push-Nachrichten (Cloud Messaging) ist
davon unabhängig ohnehin komplett kostenlos.

## 2. VAPID-Schlüssel generieren

Firebase-Konsole → Projekteinstellungen (Zahnrad oben links) → Tab
**Cloud Messaging** → Abschnitt "Web-Push-Zertifikate" → **Schlüsselpaar
generieren**.

Den angezeigten Schlüssel (lange Zeichenkette) kopieren und in
`index.html` einsetzen:

```js
const FCM_VAPID_KEY = "HIER_DEN_SCHLÜSSEL_EINFÜGEN";
```

(Dieser Schlüssel ist öffentlich - unbedenklich im Code.)

## 3. Firestore-Regel ergänzen

Jeder Account muss sein eigenes Geräte-Token speichern dürfen. Schick mir
deine aktuellen Firestore-Regeln (Firebase-Konsole → Firestore Database →
Regeln, Text kopieren), dann bekommst du die passende Ergänzung für
`match /accounts/{uid}` zurück (nur das `notificationTokens`-Feld darf vom
eigenen Account beschrieben werden).

## 4. Cloud Functions deployen

Voraussetzung: [Node.js](https://nodejs.org/) ist installiert.

```bash
npm install -g firebase-tools
firebase login
cd functions
npm install
cd ..
firebase deploy --only functions
```

Das war's - ab jetzt bekommen Spieler automatisch eine Push-Benachrichtigung,
wenn ein neuer Termin angelegt wird, und täglich um 18 Uhr eine Erinnerung,
falls sie ihr Monitoring diese Woche noch nicht ausgefüllt haben.

## 5. In der App aktivieren

Jeder Spieler/Trainer muss auf seinem eigenen Gerät einmal in der App oben
auf **"Push aktivieren"** tippen und die Berechtigung erlauben - das kann
niemand für einen anderen mit-erledigen, jedes Gerät meldet sich einzeln an.

## Weitere Erinnerungen ergänzen

Die Cloud-Function-Datei (`functions/index.js`) ist bewusst einfach
gehalten, damit sich später leicht weitere Auslöser ergänzen lassen, z.B.
"Termin in 2 Stunden" oder "Notiz vom Trainer erhalten" - einfach sagen,
welche zusätzlichen Benachrichtigungen gewünscht sind.
