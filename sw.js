// =====================================================
// TitanCap.OS – Service Worker (v2 – Ajustado)
// Estrategias:
//   • Recursos locales → Cache First + actualización en caché
//   • API de Supabase → Solo red (sin caché)
//   • Offline → Index.html como fallback de navegación
// =====================================================

const CACHE_NAME = 'titancap-os-v1';
const STATIC_URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/js/config.js',
  '/js/supabase-client.js',
  '/js/auth.js',
  '/js/nav.js',
  '/js/profile.js',
  '/js/dashboard.js',
  '/js/generator.js',
  '/js/workout.js',
  '/js/survey.js',
  '/js/erm.js',
  '/js/progression.js'
];

// ------------------------------------------------------
// INSTALACIÓN – Poblar caché atómica
// ------------------------------------------------------
self.addEventListener('install', event => {
  console.log('[SW] Instalando TitanCap.OS…');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log(`[SW] Pre‑cacheando ${STATIC_URLS_TO_CACHE.length} archivos`);
      return Promise.allSettled(
        STATIC_URLS_TO_CACHE.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] No se pudo cachear ${url}:`, err.message)
          )
        )
      );
    })
    .then(() => {
      console.log('[SW] Instalación completada – forzando activación');
      return self.skipWaiting();
    })
  );
});

// ------------------------------------------------------
// ACTIVACIÓN – Limpiar versiones obsoletas y reclamar clientes
// ------------------------------------------------------
self.addEventListener('activate', event => {
  console.log('[SW] Activando…');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Eliminando caché obsoleta:', name);
            return caches.delete(name);
          })
      );
    })
    .then(() => {
      console.log('[SW] Activación completada – reclamando clientes');
      return self.clients.claim();
    })
  );
});

// ------------------------------------------------------
// FETCH – Decidir estrategia según el tipo de petición
// ------------------------------------------------------
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejamos GET
  if (request.method !== 'GET') return;

  // Dejar pasar las peticiones al dominio de Supabase (datos siempre frescos)
  if (url.hostname === 'htfslnteeqxryssauxmy.supabase.co') return;

  // Para todos los recursos de nuestro origen: Cache First con actualización en caché
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // Recursos externos (fonts, CDN de Supabase JS): dejar pasar sin cachear
  // No se responde manualmente, el navegador los obtiene normalmente.
});

// ------------------------------------------------------
// Cache First + actualización en caché con la respuesta de red
// ------------------------------------------------------
async function cacheFirstStrategy(request) {
  // 1. Consultar caché
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // 2. Actualizar caché en segundo plano (stale-while-revalidate adaptado)
    fetch(request).then(response => {
      if (response && response.status === 200 && response.type === 'basic') {
        caches.open(CACHE_NAME).then(cache => cache.put(request, response));
      }
    }).catch(() => { /* Red sin conexión, ignorar */ });
    return cachedResponse;
  }

  // 3. No está en caché → red
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // 4. Red falla y no hay caché → devolver index.html si es navegación
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    return new Response('Sin conexión', { status: 503, statusText: 'Service Unavailable' });
  }
}
