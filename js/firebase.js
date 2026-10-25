// firebase.js - Firebase-Initialisierung (Auth, Firestore, Functions, Messaging, App Check) und Datei-Uploads zu Cloudinary.
// Teil der Spieler-Akte: wird von index.html als klassisches Script in fester
// Reihenfolge geladen; alle Dateien teilen sich denselben globalen Gueltigkeitsbereich.
"use strict";
/* ============================================================
   FIREBASE-KONFIGURATION
   Diese Werte bekommt ihr in der Firebase-Konsole unter
   Projekteinstellungen -> Meine Apps -> Web-App (Symbol </>).
   Einfach die Platzhalter unten ersetzen, Datei speichern, fertig.
   ============================================================ */
const firebaseConfig = {
    apiKey: "AIzaSyCLzy9rU4DYqwO-C6uXQqZxLbAQY_g5b3g",
    authDomain: "rsk-test-dev.firebaseapp.com",
    projectId: "rsk-test-dev",
    storageBucket: "rsk-test-dev.firebasestorage.app",
    messagingSenderId: "1096936057835",
    appId: "1:1096936057835:web:67f5459fbd83acfb0f87ae",
};
/* ============================================================
   PUSH-BENACHRICHTIGUNGEN (Web Push / Firebase Cloud Messaging)
   Diesen Schluessel bekommt ihr in der Firebase-Konsole unter
   Projekteinstellungen -> Cloud Messaging -> Tab "Web-Push-Zertifikate"
   -> "Schluesselpaar generieren". Das ist ein OEFFENTLICHER Schluessel,
   unbedenklich hier im Code. Ohne diesen Schluessel funktioniert der
   "Benachrichtigungen aktivieren"-Button nicht.
   ============================================================ */
const FCM_VAPID_KEY = "BC8pVHOBPgHYq5JeGwDuzK7MQeqesffIrnApdpVdcMgVrr8k8sImfvdfgVAWgEE1dynjyqKG7d6-K6Yr0fgeJx0";
/* ============================================================
   APP CHECK (zusaetzlicher Schutz gegen Bots/Skripte, siehe
   APPCHECK-SETUP.md fuer die Anleitung, wie man den Site-Key
   bekommt). Ohne Site-Key bleibt App Check einfach inaktiv -
   die App funktioniert dann genau wie vorher, kein Zwang.
   ============================================================ */
const APPCHECK_SITE_KEY = "";
firebase.initializeApp(firebaseConfig);
if (APPCHECK_SITE_KEY) {
    try {
        firebase.appCheck().activate(APPCHECK_SITE_KEY, true);
    }
    catch (e) { /* App Check optional - Fehler hier darf die App nicht blockieren */ }
}
const db = firebase.firestore();
const auth = firebase.auth();
// Region muss zur Region der Cloud Functions passen (siehe functions/index.js).
const functionsInstance = firebase.app().functions("europe-west1");
// Messaging ist nicht in jedem Browser/Kontext verfuegbar (z.B. Safari < 16.4,
// oder wenn die Seite nicht ueber https/localhost laeuft) - darum defensiv.
let messaging = null;
try {
    messaging = firebase.messaging ? firebase.messaging() : null;
}
catch (e) {
    messaging = null;
}
/* Zweite, unabhängige Firebase-App-Instanz. Wird nur benutzt, um neue
   Spieler/Eltern-Zugänge anzulegen, ohne dass dabei der gerade eingeloggte
   Trainer aus seiner eigenen Sitzung geworfen wird (das würde sonst passieren,
   weil "neuen Nutzer anlegen" in Firebase automatisch zu diesem Nutzer wechselt). */
const secondaryApp = firebase.initializeApp(firebaseConfig, "secondary");
const secondaryAuth = secondaryApp.auth();
/* ============================================================
   CLOUDINARY-KONFIGURATION (für PDF/Scan-Anhänge bei Notizen)
   Cloud Name: Cloudinary-Dashboard, oben links direkt sichtbar.
   Upload Preset: Settings -> Upload -> Upload presets -> euer
   "Unsigned"-Preset-Name.
   ============================================================ */
const CLOUDINARY_CLOUD_NAME = "kbapljot";
const CLOUDINARY_UPLOAD_PRESET = "f6m1nmrf";
async function uploadToCloudinarySingle(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
        method: "POST",
        body: formData,
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error("Cloudinary-Upload fehlgeschlagen: " + (errText || res.status));
    }
    const json = await res.json();
    return { url: json.secure_url, bytes: json.bytes };
}
/* Cloudinary lehnt einzelne Uploads über 100MB grundsätzlich ab (fester Server-Grenzwert,
   unabhängig vom Preset/Plan). Größere Dateien (z.B. längere Wurftechnik-Videos) werden
   daher in Stücken hochgeladen ("chunked upload") - siehe Cloudinary-Doku "Chunked upload". */
const CLOUDINARY_CHUNK_SIZE = 6 * 1024 * 1024;
const CLOUDINARY_CHUNK_THRESHOLD = 95 * 1024 * 1024;
async function uploadToCloudinaryChunked(file, onProgress) {
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const total = file.size;
    let start = 0;
    let lastJson = null;
    while (start < total) {
        const end = Math.min(start + CLOUDINARY_CHUNK_SIZE, total);
        const chunk = file.slice(start, end);
        const formData = new FormData();
        formData.append("file", chunk);
        formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
            method: "POST",
            headers: { "X-Unique-Upload-Id": uploadId, "Content-Range": `bytes ${start}-${end - 1}/${total}` },
            body: formData,
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error("Cloudinary-Upload (Teil-Stück) fehlgeschlagen: " + (errText || res.status));
        }
        lastJson = await res.json();
        start = end;
        if (onProgress)
            onProgress(Math.round((start / total) * 100));
    }
    return { url: lastJson.secure_url, bytes: lastJson.bytes };
}
async function uploadToCloudinary(file, onProgress) {
    if (file.size > CLOUDINARY_CHUNK_THRESHOLD)
        return uploadToCloudinaryChunked(file, onProgress);
    const result = await uploadToCloudinarySingle(file);
    if (onProgress)
        onProgress(100);
    return result;
}
