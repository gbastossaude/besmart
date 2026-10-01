/* Erbe · Central — service worker
   Objetivo: abrir rápido e continuar abrindo com internet ruim. NÃO guarda dado
   de cliente: as chamadas ao Supabase (outro domínio) nunca passam por aqui.
   - Página e código do sistema: rede primeiro (sempre a versão publicada mais
     recente); sem rede, a última cópia guardada.
   - Fontes, ícones e bibliotecas: cópia guardada primeiro (não mudam).
   Trocar VERSAO descarta os caches antigos. */
const VERSAO = "erbe-v2.0.0";
const ESTATICO = /\/(vendor|assets\/fonts|assets\/icons)\//;

self.addEventListener("install", ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    // A lista de arquivos vem do próprio index.html: nada para manter à mão.
    const html = await (await fetch("index.html", { cache: "no-cache" })).text();
    const arquivos = [...html.matchAll(/(?:src|href)="((?:assets|vendor)\/[^"]+)"/g)].map(m => m[1]);
    await cache.addAll(["./", "index.html", "manifest.webmanifest", ...new Set(arquivos)]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSAO) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Supabase e afins: direto para a rede
  if (url.pathname.startsWith("/arsenal/")) return;
  if (url.pathname === "/config.js") { ev.respondWith(redePrimeiro(req)); return; }
  if (req.mode === "navigate") { ev.respondWith(redePrimeiro(req, "index.html")); return; }
  if (ESTATICO.test(url.pathname)) { ev.respondWith(cachePrimeiro(req)); return; }
  ev.respondWith(redePrimeiro(req));
});

async function redePrimeiro(req, reserva) {
  const cache = await caches.open(VERSAO);
  try {
    const resp = await fetch(req);
    if (resp.ok && resp.type === "basic") cache.put(reserva || req, resp.clone());
    return resp;
  } catch (e) {
    const guardada = await cache.match(reserva || req) || (reserva ? null : await cache.match(req, { ignoreSearch: true }));
    if (guardada) return guardada;
    throw e;
  }
}
async function cachePrimeiro(req) {
  const cache = await caches.open(VERSAO);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  const resp = await fetch(req);
  if (resp.ok) cache.put(req, resp.clone());
  return resp;
}
