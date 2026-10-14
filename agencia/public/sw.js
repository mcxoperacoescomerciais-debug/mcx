/*
 * Service Worker do app do promotor.
 *
 * - Página /app: rede primeiro; sem sinal, usa a última cópia guardada. Assim
 *   o app abre dentro do supermercado mesmo sem internet.
 * - Arquivos estáticos do Next (/_next/static, com hash no nome): cache
 *   primeiro — nunca mudam de conteúdo.
 * - Fotos já enviadas (/api/photos/:id) e logo da agência (/api/logo/:id):
 *   conteúdo nunca muda para a mesma URL — cache primeiro, para aparecerem
 *   sem sinal. Limite de itens para não lotar o celular.
 * - Demais APIs: sempre pela rede. Quem trata a falta de sinal é o próprio app
 *   (fila de sincronização no IndexedDB).
 */
const VERSION = "campo-v4";
const SHELL_CACHE = `shell-${VERSION}`;
const STATIC_CACHE = `static-${VERSION}`;
const MEDIA_CACHE = "media-v1";
const MEDIA_MAX = 400;

async function trimMedia() {
  const cache = await caches.open(MEDIA_CACHE);
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MEDIA_MAX))) await cache.delete(k);
}
const PRECACHE = ["/app", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, STATIC_CACHE, MEDIA_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            // clone() precisa ser síncrono: depois que a página lê o corpo, não dá mais para copiar.
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate" && url.pathname.startsWith("/app")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Só guarda respostas reais do app (não redirecionamentos para o login).
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put("/app", copy));
          }
          return res;
        })
        .catch(() => caches.match("/app").then((hit) => hit || Response.error())),
    );
    return;
  }

  if (/^\/api\/(photos|logo)\//.test(url.pathname)) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res.clone()).then(trimMedia).catch(() => {});
              return res;
            }),
        ),
      ),
    );
    return;
  }

  if (/\.(png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
  }
});
