/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.
    Licensed under the GNU General Public License version 2.

    Offline shell.

    A bench is often the worst-connected corner of a building, and the whole
    measurement runs on the device anyway — nothing here needs the network once
    it has loaded.

    Two strategies, because the files differ in kind:

    Assets under assets/ carry a content hash in their filename, so a given URL
    can never change meaning. Those are cached forever and served from cache
    without asking the network. That includes the 600 KB WebAssembly module,
    which is the thing worth not downloading twice.

    index.html has no hash, and it is what names the current asset filenames.
    It is fetched from the network first and only falls back to cache offline.
    Cache-first there would keep pointing at the previous build's assets, so
    every deploy would take two launches to appear — which during development
    reads as "my change did not ship".
*/

const CACHE = 'mac-timegrapher-v1';
const SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
  // Take over as soon as the new worker is ready rather than waiting for every
  // tab to close, which on a phone can be never.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isImmutable(url) {
  // Vite writes a content hash into every emitted asset filename.
  return url.pathname.includes('/assets/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only our own origin: this must never sit between the browser and something
  // it does not own.
  if (url.origin !== self.location.origin) return;

  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else — the document, the manifest, the worklet, the logos —
  // network first, cache as a fallback for when there is no network.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
  );
});
