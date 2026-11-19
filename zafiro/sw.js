// Service Worker — DEFCON5 Empleados (Zafiro)
// Ámbito exclusivo: /empleados/
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `defcon5-empleados-${CACHE_VERSION}`;
const STATIC_CACHE = `defcon5-empleados-static-${CACHE_VERSION}`;

// Recursos esenciales del App Shell de empleados
const PRECACHE_ASSETS = [
  '/empleados/',
  '/empleados/index.html',
  '/empleados/admin.html',
  '/empleados/formulariotrabajos.html',
  '/empleados/manifest.json',
  '/empleados/icons/icon-192.png',
  '/empleados/icons/icon-512.png',
  '/empleados/icons/icon-maskable-512.png',
  '/empleados/icons/apple-touch-icon.png',
  '/empleados/icons/favicon.png',
  '/empleados/css/login.css',
  '/empleados/css/admin.css',
  '/empleados/css/formulariotrabajos.css',
  '/empleados/js/login.js',
  '/empleados/js/admin.js',
  '/empleados/js/formulariotrabajos.js',
  '/empleados/js/firebase-config.js',
  '/empleados/js/auth-guard.js',
  '/empleados/js/pwa-manager.js'
];

// Dominios que NUNCA deben almacenarse en cache por seguridad y privacidad
const SENSITIVE_DOMAINS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebasestorage.googleapis.com',
  'google-analytics.com',
  'analytics.google.com'
];

// Instalación: Precarga de recursos esenciales de empleados
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW Empleados] No se pudo precachear ${url}:`, err);
          })
        )
      );
    })
  );
});

// Activación: Limpieza exclusiva de cachés antiguas de DEFCON5 Empleados
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('defcon5-empleados-') && key !== CACHE_NAME && key !== STATIC_CACHE) {
            console.log(`[SW Empleados] Eliminando caché antigua: ${key}`);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de solicitudes de red
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Si no es método GET, permitir paso directo por red
  if (request.method !== 'GET') {
    return;
  }

  // 2. Si es para el portal administrativo (/admin/), ignorar completamente
  if (url.pathname.startsWith('/admin')) {
    return;
  }

  // 3. Excluir dominios sensibles (Firebase Auth, Firestore, Analytics)
  if (SENSITIVE_DOMAINS.some((domain) => url.hostname.includes(domain))) {
    return;
  }

  // 4. Estrategia Network-First para páginas HTML (navegación)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // Fallback a caché: coincidencia exacta o con extensión .html
          let cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;

          if (!url.pathname.endsWith('.html') && !url.pathname.endsWith('/')) {
            cachedResponse = await caches.match(request.url + '.html');
            if (cachedResponse) return cachedResponse;
          }

          // Si es ruta interna empleados, entregar index.html precacheado
          const fallback = await caches.match('/empleados/index.html');
          if (fallback) return fallback;

          return new Response(
            `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Sin Conexión - DEFCON5 Empleados</title><style>body{font-family:sans-serif;text-align:center;padding:50px;background:#0f172a;color:#fff;}h1{color:#e74c3c;}a{color:#4a6cf7;text-decoration:none;}</style></head><body><h1>Sin Conexión</h1><p>No tienes acceso a internet en este momento y esta vista aún no ha sido descargada.</p><p><a href="/empleados/">Volver al inicio de DEFCON5 Empleados</a></p></body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // 5. Estrategia Stale-While-Revalidate para recursos estáticos (CSS, JS, Fuentes, Imágenes, Iconos)
  const isStatic =
    url.pathname.includes('/css/') ||
    url.pathname.includes('/js/') ||
    url.pathname.includes('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com');

  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});

// Manejo de mensajes (actualización controlada)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Manejo de notificaciones Push (Firebase Cloud Messaging)
self.addEventListener('push', (event) => {
  let data = {
    title: 'DEFCON5 Empleados',
    body: 'Tienes una actualización en tus tareas de taller.',
    icon: '/empleados/icons/icon-192.png',
    badge: '/empleados/icons/favicon.png',
    data: { url: '/empleados/admin.html' }
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data.title = payload.title || payload.notification?.title || data.title;
      data.body = payload.body || payload.notification?.body || data.body;
      data.icon = payload.icon || payload.notification?.icon || data.icon;
      if (payload.data?.url) data.data.url = payload.data.url;
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      vibrate: [100, 50, 100],
      data: data.data,
      actions: [
        { action: 'open', title: 'Ver asignación' },
        { action: 'close', title: 'Cerrar' }
      ]
    })
  );
});

// Clic en notificación push
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/empleados/admin.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta en el portal empleados, enfocarla
      for (const client of clientList) {
        if (client.url.includes('/empleados/') && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Si no, abrir una nueva ventana
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
