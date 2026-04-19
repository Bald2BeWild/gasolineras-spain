// Service Worker para Llenoporfavor
// Mejora rendimiento y permite funcionamiento offline básico

const CACHE_NAME = 'llenoporfavor-v1';
const CACHE_URLS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
];

// Instalar: cachear recursos críticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .catch(() => {}) // no fallar si algo no se puede cachear
  );
  self.skipWaiting();
});

// Activar: limpiar cachés antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: estrategia network-first con fallback a cache
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // No cachear: APIs, datos dinámicos, anuncios, analytics
  if (
    url.pathname.endsWith('.json') ||
    url.hostname.includes('googlesyndication') ||
    url.hostname.includes('google-analytics') ||
    url.hostname.includes('googletagmanager') ||
    url.hostname.includes('doubleclick') ||
    url.hostname.includes('corsproxy') ||
    url.hostname.includes('nominatim') ||
    url.hostname.includes('rss2json') ||
    url.hostname.includes('allorigins') ||
    url.hostname.includes('formspree') ||
    url.hostname.includes('news.google')
  ) {
    return; // let browser handle normally
  }
  
  // Solo GET
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cachear solo respuestas OK de nuestro dominio
        if (response.ok && url.origin === location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
