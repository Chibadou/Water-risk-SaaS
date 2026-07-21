// HydroVigie service worker — app-shell offline support.
//
// Scope of the offline mode (deliberately narrow, honest about limits):
//  - The app shell (pages, JS/CSS, icon) is cached so the UI — including the
//    "Mes sites" dashboard, whose data lives in localStorage — opens offline.
//  - API calls (/api/*) are NEVER cached: they need live upstream data and
//    real network. Offline, they fail and the UI shows its usual French
//    "indisponible" messages. We never serve stale risk data as if fresh.

const CACHE = "hydrovigie-shell-v1";
const SHELL = ["/", "/sites", "/methodologie", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {
        // A missing precache entry must not abort activation.
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin pass through
  if (url.pathname.startsWith("/api/")) return; // never cache live data

  // Navigations: network-first so the freshest page wins online; fall back to
  // the cached page (or the cached home shell) when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/"))),
    );
    return;
  }

  // Static assets (Next.js build output, icon): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
