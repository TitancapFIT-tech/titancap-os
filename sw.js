// =====================================================
// TitanCap.OS - Service Worker (v1)
// Estrategia: Cache First para estáticos,
// Network First para API de Supabase,
// instalación y activación con limpieza de cachés
// =====================================================

const CACHE_NAME = 'titancap-os-v1';
const API_PATH = '/rest/v1/';

// Archivos estáticos a pre-cachear en la instalación
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
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
  '/js/progression.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// =====================================================
// INSTALACIÓN: precachear archivos esenciales
// =====================================================
self.addEventListener('install', event => {
  console.log('[SW] Instalando TitanCap.OS...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Precacheando', STATIC_ASSETS.length, 'archivos');
        // Usar addAll con manejo de errores individuales
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => {
              console.warn('[SW] No se pudo cachear:', url, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Instalación completada');
        // Forzar activación inmediata sin esperar a que se cierren pestañas
        return self.skipWaiting();
      })
  );
});

// =====================================================
// ACTIVACIÓN: limpiar cachés antiguas y tomar control
// =====================================================
self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Eliminando caché antigua:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activación completada');
        // Tomar control de todos los clientes inmediatamente
        return self.clients.claim();
      })
  );
});

// =====================================================
// FETCH: estrategia según tipo de petición
// =====================================================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar peticiones que no sean GET
  if (request.method !== 'GET') return;

  // Ignorar peticiones a orígenes externos (CDN, fuentes, etc.)
  if (url.origin !== self.location.origin) return;

  // Estrategia para API de Supabase: Network First con fallback a caché
  if (url.pathname.startsWith(API_PATH)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Estrategia para estáticos: Cache First con fallback a red
  event.respondWith(cacheFirst(request));
});

// =====================================================
// ESTRATEGIA CACHE FIRST
// =====================================================
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // console.log('[SW] Cache hit:', request.url);
    return cachedResponse;
  }
  try {
    const networkResponse = await fetch(request);
    // Actualizar caché con la respuesta fresca
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn('[SW] Sin conexión y sin caché para:', request.url);
    // Para navegación, devolver el index.html (offline fallback)
    if (request.mode === 'navigate') {
      const cachedIndex = await caches.match('/index.html');
      if (cachedIndex) return cachedIndex;
    }
    return new Response('Sin conexión', { status: 503 });
  }
}

// =====================================================
// ESTRATEGIA NETWORK FIRST (para API)
// =====================================================
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    // Cachear respuesta fresca solo si es exitosa (200)
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn('[SW] API sin conexión, usando caché:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    return new Response(JSON.stringify({ error: 'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
