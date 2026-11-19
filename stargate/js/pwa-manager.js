// PWA Manager — DEFCON5 Admin (Stargate)
// Gestión integral de PWA: Service Worker, Instalación, Modo Offline, Cola IndexedDB y Push
import { db, collection, addDoc, doc, setDoc, serverTimestamp } from './firebase-config.js';

const APP_NAME = 'DEFCON5 Admin';
const APP_SCOPE = '/admin/';
const SW_PATH = '/admin/sw.js';
const STORAGE_PREFIX = 'defcon5_admin_';

let deferredInstallPrompt = null;
let newWorkerWaiting = false;

// 1. Registro del Service Worker con alcance exclusivo
export function initPWA() {
  // Inyectar estilos de animación para banners PWA
  if (!document.getElementById('pwa-keyframes-style')) {
    const kfStyle = document.createElement('style');
    kfStyle.id = 'pwa-keyframes-style';
    kfStyle.textContent = `@keyframes pwaSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`;
    document.head.appendChild(kfStyle);
  }

  if ('serviceWorker' in navigator) {
    // Si estamos en entorno local con pathname /stargate/, ajustar ruta relativa
    const swUrl = window.location.pathname.startsWith('/admin') ? SW_PATH : 'sw.js';
    const scopeUrl = window.location.pathname.startsWith('/admin') ? APP_SCOPE : './';

    navigator.serviceWorker.register(swUrl, { scope: scopeUrl })
      .then((registration) => {
        console.log(`[PWA Admin] Service Worker registrado con alcance: ${registration.scope}`);

        // Detectar si hay un nuevo Service Worker esperando ser activado
        if (registration.waiting) {
          showUpdateNotification(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Hay una nueva versión lista
              showUpdateNotification(newWorker);
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[PWA Admin] Error al registrar Service Worker:', err);
      });

    // Recargar página una vez que el nuevo SW tome el control tras skipWaiting
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  // Inicializar componentes PWA en UI
  setupNetworkMonitor();
  setupInstallPrompt();
  checkIOSInstallation();
  initOfflineQueueSync();
}

// 2. Notificación de actualización controlada
function showUpdateNotification(worker) {
  if (document.getElementById('pwa-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-update-banner';
  banner.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    right: 20px;
    max-width: 420px;
    background: #2c3e50;
    color: #fff;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    border-left: 5px solid #3498db;
    font-family: 'Poppins', sans-serif;
    animation: pwaSlideUp 0.3s ease;
  `;

  banner.innerHTML = `
    <div style="font-size: 13px;">
      <strong style="display:block;margin-bottom:2px;font-size:14px;color:#3498db;">Actualización disponible</strong>
      Nueva versión de ${APP_NAME}.
    </div>
    <div style="display: flex; gap: 8px;">
      <button id="pwa-update-accept" style="background:#3498db;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">Actualizar</button>
      <button id="pwa-update-close" style="background:transparent;color:#bdc3c7;border:1px solid #7f8c8d;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:12px;">✕</button>
    </div>
  `;

  document.body.appendChild(banner);

  document.getElementById('pwa-update-accept')?.addEventListener('click', () => {
    banner.remove();
    worker.postMessage({ type: 'SKIP_WAITING' });
  });

  document.getElementById('pwa-update-close')?.addEventListener('click', () => {
    banner.remove();
  });
}

// 3. Flujo de instalación (Desktop Chrome/Edge & Android Chrome)
function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;

    // Verificar si el usuario lo pospuso recientemente
    const dismissedUntil = localStorage.getItem(`${STORAGE_PREFIX}install_dismissed`);
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) {
      return;
    }

    // Si ya está instalada en modo standalone, no mostrar
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      return;
    }

    renderInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    console.log(`[PWA Admin] ${APP_NAME} ha sido instalada exitosamente.`);
    deferredInstallPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();
    localStorage.setItem(`${STORAGE_PREFIX}installed`, 'true');
    showToast(`¡${APP_NAME} instalada con éxito!`, 'success');
  });
}

function renderInstallBanner() {
  if (document.getElementById('pwa-install-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    max-width: 380px;
    background: #ffffff;
    color: #2c3e50;
    padding: 16px 20px;
    border-radius: 14px;
    box-shadow: 0 12px 35px rgba(0,0,0,0.18);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border: 1px solid #e1e8ed;
    font-family: 'Poppins', sans-serif;
    animation: pwaSlideUp 0.3s ease;
  `;

  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="icons/icon-192.png" alt="Icono" style="width:42px;height:42px;border-radius:8px;object-fit:cover;">
      <div style="flex:1;">
        <h4 style="margin:0;font-size:14px;font-weight:700;color:#2c3e50;">Instalar ${APP_NAME}</h4>
        <p style="margin:2px 0 0;font-size:12px;color:#7f8c8d;">Acceso rápido desde tu escritorio o pantalla de inicio.</p>
      </div>
      <button id="pwa-install-dismiss" style="background:none;border:none;color:#95a5a6;cursor:pointer;font-size:16px;">✕</button>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;">
      <button id="pwa-install-later" style="background:none;border:none;color:#7f8c8d;font-size:12px;cursor:pointer;padding:6px 12px;">Ahora no</button>
      <button id="pwa-install-btn" style="background:#2c3e50;color:#fff;border:none;font-size:12px;font-weight:600;padding:8px 16px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;">
        <i class="fas fa-download"></i> Instalar
      </button>
    </div>
  `;

  document.body.appendChild(banner);

  document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    banner.remove();
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log(`[PWA Admin] Respuesta de instalación: ${outcome}`);
    deferredInstallPrompt = null;
  });

  const dismiss = () => {
    banner.remove();
    // Posponer por 24 horas
    localStorage.setItem(`${STORAGE_PREFIX}install_dismissed`, (Date.now() + 24 * 60 * 60 * 1000).toString());
  };

  document.getElementById('pwa-install-later')?.addEventListener('click', dismiss);
  document.getElementById('pwa-install-dismiss')?.addEventListener('click', dismiss);
}

// 4. Instrucciones para iOS Safari
function checkIOSInstallation() {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

  if (isIOS && !isStandalone) {
    const dismissedUntil = localStorage.getItem(`${STORAGE_PREFIX}ios_prompt_dismissed`);
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) return;

    // Mostrar prompt suave tras 4 segundos
    setTimeout(() => {
      if (document.getElementById('pwa-ios-banner')) return;

      const iosBanner = document.createElement('div');
      iosBanner.id = 'pwa-ios-banner';
      iosBanner.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        background: #ffffff;
        color: #2c3e50;
        padding: 16px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        z-index: 9999;
        font-family: 'Poppins', sans-serif;
        font-size: 13px;
        border: 1px solid #dcdde1;
      `;

      iosBanner.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="color:#2c3e50;"><i class="fas fa-mobile-alt"></i> Instalar ${APP_NAME} en iOS</strong>
          <button id="pwa-ios-close" style="border:none;background:none;font-size:16px;color:#7f8c8d;cursor:pointer;">✕</button>
        </div>
        <p style="margin:0 0 6px;color:#555;">Para instalar esta aplicación en tu iPhone o iPad:</p>
        <ol style="margin:0;padding-left:20px;color:#333;font-size:12px;">
          <li>Toca el botón <strong>Compartir</strong> <i class="fas fa-share-square"></i> en Safari.</li>
          <li>Desplázate hacia abajo y elige <strong>"Añadir a pantalla de inicio"</strong>.</li>
        </ol>
      `;

      document.body.appendChild(iosBanner);

      document.getElementById('pwa-ios-close')?.addEventListener('click', () => {
        iosBanner.remove();
        localStorage.setItem(`${STORAGE_PREFIX}ios_prompt_dismissed`, (Date.now() + 48 * 60 * 60 * 1000).toString());
      });
    }, 4000);
  }
}

// 5. Monitor de conectividad de red (Online / Offline)
function setupNetworkMonitor() {
  const updateStatus = () => {
    const isOnline = navigator.onLine;
    let toast = document.getElementById('pwa-network-toast');

    if (!isOnline) {
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'pwa-network-toast';
        document.body.appendChild(toast);
      }
      toast.style.cssText = `
        position: fixed;
        top: 15px;
        left: 50%;
        transform: translateX(-50%);
        background: #e74c3c;
        color: #ffffff;
        padding: 8px 18px;
        border-radius: 30px;
        font-size: 13px;
        font-weight: 500;
        z-index: 10001;
        box-shadow: 0 4px 15px rgba(231,76,60,0.3);
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: 'Poppins', sans-serif;
      `;
      toast.innerHTML = `<i class="fas fa-wifi-slash"></i> Sin conexión — Modo offline activado`;
    } else {
      if (toast) {
        toast.style.background = '#27ae60';
        toast.innerHTML = `<i class="fas fa-wifi"></i> Conexión reestablecida — Sincronizando...`;
        setTimeout(() => {
          if (toast) toast.remove();
        }, 3000);
      }
      // Sincronizar cola de operaciones offline
      syncPendingOperations();
    }
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);

  if (!navigator.onLine) {
    updateStatus();
  }
}

// 6. Cola persistente en IndexedDB para operaciones offline seguras
const DB_NAME = 'defcon5_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'admin_operations';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const dbInstance = e.target.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!dbInstance.objectStoreNames.contains('empleados_operations')) {
        dbInstance.createObjectStore('empleados_operations', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Encolar operación de forma segura (sin credenciales sensibles)
export async function enqueueOfflineOperation(action, payload) {
  try {
    const dbInstance = await openDatabase();
    const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const operation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      action,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0
    };

    store.put(operation);

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });

    console.log(`[Offline Sync] Operación guardada en cola: ${action}`);
    showToast('Operación guardada localmente. Se sincronizará al recuperar internet.', 'info');
    return operation.id;
  } catch (err) {
    console.error('[Offline Sync] Error al encolar operación:', err);
    throw err;
  }
}

// Sincronizar operaciones pendientes cuando hay conexión
export async function syncPendingOperations() {
  if (!navigator.onLine) return;

  try {
    const dbInstance = await openDatabase();
    const tx = dbInstance.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = async () => {
      const operations = getAllRequest.result || [];
      if (operations.length === 0) return;

      console.log(`[Offline Sync] Sincronizando ${operations.length} operaciones pendientes...`);

      for (const op of operations) {
        try {
          if (op.action === 'CREATE_CLIENT') {
            await addDoc(collection(db, 'Clientes'), {
              ...op.payload,
              offlineCreated: true,
              syncedAt: serverTimestamp()
            });
          } else if (op.action === 'CREATE_EMPLOYEE') {
            await addDoc(collection(db, 'colaboradores'), {
              ...op.payload,
              offlineCreated: true,
              syncedAt: serverTimestamp()
            });
          }

          // Eliminar de la cola una vez completado
          const delTx = dbInstance.transaction(STORE_NAME, 'readwrite');
          delTx.objectStore(STORE_NAME).delete(op.id);
        } catch (syncError) {
          console.warn(`[Offline Sync] Error al procesar operación ${op.id}:`, syncError);
        }
      }

      showToast('Sincronización completada exitosamente.', 'success');
    };
  } catch (err) {
    console.warn('[Offline Sync] Fallo al sincronizar cola:', err);
  }
}

function initOfflineQueueSync() {
  if (navigator.onLine) {
    syncPendingOperations();
  }
}

// 7. Notificaciones Push (Firebase Cloud Messaging)
export async function initPushNotifications(userEmail = null) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.log('[Push] Notificaciones push no soportadas en este navegador.');
    return false;
  }

  if (Notification.permission === 'granted') {
    return registerPushToken(userEmail);
  } else if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      showToast('Notificaciones activadas para DEFCON5 Admin.', 'success');
      return registerPushToken(userEmail);
    }
  }
  return false;
}

async function registerPushToken(userEmail) {
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    // Guardar token en Firestore sin exponer credenciales
    if (subscription) {
      const tokenDoc = doc(collection(db, 'fcmTokens'));
      await setDoc(tokenDoc, {
        portal: 'admin',
        userEmail: userEmail || localStorage.getItem('username') || 'admin',
        endpoint: subscription.endpoint,
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp()
      }, { merge: true });
      return true;
    }
  } catch (err) {
    console.warn('[Push] Error registrando suscripción push:', err);
  }
  return false;
}

// Utilidad de Toast de interfaz
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const bg = type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#2980b9';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: ${bg};
    color: #fff;
    padding: 10px 22px;
    border-radius: 25px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 6px 20px rgba(0,0,0,0.2);
    z-index: 10002;
    font-family: 'Poppins', sans-serif;
    animation: pwaSlideUp 0.25s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Iniciar automáticamente PWA Manager al cargar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPWA);
} else {
  initPWA();
}
