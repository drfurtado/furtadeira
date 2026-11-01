// Service worker mínimo: permite instalar o site como app.
// Não guarda dados da família em cache (tudo vem do Firebase, com login).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
