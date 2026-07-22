const CACHE = "plan-produccion-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./estilos.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Red primero: siempre intenta traer la version mas nueva del servidor.
// no-store evita que la cache HTTP normal del navegador (no la de este
// service worker) tape los cambios nuevos. Si no hay conexion, usa lo
// ultimo que quedo guardado en cache.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request.url, { cache: "no-store" })
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
