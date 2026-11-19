/*
 * Minimal service worker for SPECTRE's installable (PWA) app.
 *
 * It deliberately does NOT cache pages — SPECTRE is a live, authenticated
 * workspace and stale cached HTML would be worse than a network fetch. Its only
 * job is to exist with a fetch handler, which is what browsers require before
 * they offer "Install app". Requests pass straight through to the network.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Network passthrough. The handler's presence enables installability; it does
// not intercept or cache responses.
self.addEventListener("fetch", () => {});
