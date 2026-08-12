// Service worker mínimo. O app depende de conexão ao vivo (WebSocket) com
// o servidor Streamlit, então não faz sentido cachear nada pra uso offline
// — ele só existe porque o Android/Chrome exige um service worker com
// handler de "fetch" registrado como critério pra permitir instalar o
// site como app na tela inicial.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
