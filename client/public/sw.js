// Minimal service worker — enables install-to-home-screen (PWA).
// Network-first; no aggressive caching yet (offline support comes later).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* pass-through; real caching strategy added in a later phase */
});
