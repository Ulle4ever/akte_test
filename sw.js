// Minimaler Service Worker - macht die App auf dem Handy "Zum Home-Bildschirm
// hinzufuegen"-faehig (volle Anzeige ohne Browserleiste) und laedt die Seite
// selbst (HTML/Icons) auch bei schwacher Verbindung sofort aus dem Cache.
// Die eigentlichen Daten (Firebase/Firestore) laufen weiterhin live uebers
// Netz - hier wird nur die App-Huelle zwischengespeichert, keine Spielerdaten.
const CACHE_NAME = "spieler-akte-shell-v1";
const CORE_ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

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
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});
