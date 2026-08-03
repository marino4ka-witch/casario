// Casario service worker — установка на телефон + офлайн-фолбэк.
// HTML — network-first (всегда свежий онлайн), статика — cache-first.
const CACHE = 'casario-v3';
const SHELL = ['./', './index.html', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  // Внешние запросы (Supabase, Telegram, курс валют, картинки) — не трогаем.
  if (url.origin !== self.location.origin) return;
  // Видео заставки — всегда из сети (не кэшируем большой файл, чтобы не отдавать старую версию).
  if (url.pathname.endsWith('.mp4')) return;

  // HTML-документ → network-first (свежая версия онлайн, кэш офлайн).
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Статика (иконки/манифест) → cache-first.
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
    }))
  );
});
