// Minimaler Service Worker - macht die App auf dem Handy "Zum Home-Bildschirm
// hinzufuegen"-faehig (volle Anzeige ohne Browserleiste) und laedt die Seite
// selbst (HTML/Icons) auch bei schwacher Verbindung sofort aus dem Cache.
// Die eigentlichen Daten (Firebase/Firestore) laufen weiterhin live uebers
// Netz - hier wird nur die App-Huelle zwischengespeichert, keine Spielerdaten.
//
// Zusaetzlich: Empfang von Push-Benachrichtigungen (Firebase Cloud Messaging)
// im Hintergrund, wenn die App gerade nicht offen ist.
const CACHE_NAME = "spieler-akte-shell-v3";
const CORE_ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");
// Gleiche (oeffentliche) Konfiguration wie in index.html - kein Geheimnis.
firebase.initializeApp({
    apiKey: "AIzaSyCLzy9rU4DYqwO-C6uXQqZxLbAQY_g5b3g",
    authDomain: "rsk-test-dev.firebaseapp.com",
    projectId: "rsk-test-dev",
    storageBucket: "rsk-test-dev.firebasestorage.app",
    messagingSenderId: "1096936057835",
    appId: "1:1096936057835:web:67f5459fbd83acfb0f87ae",
});
try {
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
        const title = payload.notification?.title || "Spieler-Akte";
        const body = payload.notification?.body || "";
        self.registration.showNotification(title, { body, icon: "icon-192.png", badge: "icon-192.png", data: payload.data || {} });
    });
}
catch (e) { /* Messaging im Service-Worker-Kontext nicht verfuegbar - ignorieren */ }

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = event.notification.data?.url || "./index.html";
    event.waitUntil(
        clients.matchAll({ type: "window" }).then((all) => {
            const existing = all.find((c) => c.url.includes(self.location.origin));
            if (existing)
                return existing.focus();
            return clients.openWindow(url);
        })
    );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return; // Firebase/Cloudinary/CDN-Anfragen unangetastet lassen
  }
  // "no-store" erzwingt einen echten Netzwerk-Request statt einer (evtl.
  // veralteten) Antwort aus dem normalen HTTP-Cache des Browsers - sonst
  // liefert Firebase Hosting nach einem Deploy teils noch die alte Version
  // aus, obwohl dieser Service Worker eigentlich "network-first" arbeitet.
  event.respondWith(
    fetch(req, { cache: "no-store" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});
