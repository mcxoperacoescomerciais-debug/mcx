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
 * - Painel do gestor (/painel): rede primeiro; cada tela aberta é guardada
 *   (também as abertas por navegação interna, a pedido da página — no máximo a
 *   cada 10 min por tela). Sem sinal, mostra a última cópia com a data em que
 *   foi salva (modo consulta). As cópias são apagadas ao sair da conta ou
 *   trocar de agência, e a cada nova versão do sistema.
 */
const VERSION = "campo-v17";
const SHELL_CACHE = `shell-${VERSION}`;
const STATIC_CACHE = `static-${VERSION}`;
const MEDIA_CACHE = "media-v1";
const MEDIA_MAX = 400;
const PANEL_CACHE = `painel-${VERSION}`;
const PANEL_MAX = 80;
const PANEL_FRESH_MS = 10 * 60_000;

const OFFLINE_PANEL_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem internet · MCX Trade</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f5f5f2;color:#141a1c;display:grid;place-items:center;min-height:100vh;padding:16px}main{max-width:420px;background:#fff;border:1px solid #e5e5e0;border-radius:16px;padding:24px}h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#3c4548;line-height:1.5}a{color:#17535f;font-weight:600}</style></head>
<body><main><h1>Sem internet</h1><p>Esta tela ainda não foi aberta neste aparelho, então não há cópia guardada para consultar.</p><p>As telas que você abre com internet ficam disponíveis para consulta sem sinal.</p><p><a href="/painel">Voltar à visão geral</a></p></main></body></html>`;

/** Guarda a tela do painel com a hora em que foi salva. */
async function savePanel(url, res) {
  if (!res.ok || res.redirected || !(res.headers.get("content-type") || "").includes("text/html")) return;
  const headers = new Headers(res.headers);
  headers.set("x-saved-at", String(Date.now()));
  const body = await res.blob();
  const cache = await caches.open(PANEL_CACHE);
  await cache.put(url, new Response(body, { status: res.status, statusText: res.statusText, headers }));
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - PANEL_MAX))) await cache.delete(k);
}

/** Sem sinal: a cópia da tela (mesmos filtros; senão a mesma tela com outros filtros), marcada com a data. */
async function offlinePanel(url) {
  const cache = await caches.open(PANEL_CACHE);
  const hit = (await cache.match(url)) || (await cache.match(url, { ignoreSearch: true }));
  if (!hit) return new Response(OFFLINE_PANEL_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  const savedAt = hit.headers.get("x-saved-at") || "";
  const html = (await hit.text()).replace(/<head[^>]*>/, (m) => `${m}<meta name="mcx-offline-saved-at" content="${savedAt}">`);
  return new Response(html, { status: 200, headers: hit.headers });
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "painel-save" || typeof data.url !== "string") return;
  const url = new URL(data.url, self.location.origin);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/painel")) return;
  event.waitUntil(
    caches
      .open(PANEL_CACHE)
      .then((cache) => cache.match(url.href))
      .then((hit) => {
        if (hit && Date.now() - Number(hit.headers.get("x-saved-at") || 0) < PANEL_FRESH_MS) return;
        return fetch(url.href, { credentials: "same-origin" }).then((res) => savePanel(url.href, res));
      })
      .catch(() => {}),
  );
});

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
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, STATIC_CACHE, MEDIA_CACHE, PANEL_CACHE].includes(k)).map((k) => caches.delete(k))))
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

  if (request.mode === "navigate" && url.pathname.startsWith("/painel")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          event.waitUntil(savePanel(request.url, copy).catch(() => {}));
          return res;
        })
        .catch(() => offlinePanel(request.url)),
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
