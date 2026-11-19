// PWA Manager — DEFCON5 Empleados (Zafiro)
// Gestión integral de PWA: Service Worker, Instalación, Modo Offline, Cola IndexedDB y Push
import { db, collection, addDoc, doc, setDoc, updateDoc, serverTimestamp } from './firebase-config.js';

const APP_NAME = 'DEFCON5 Empleados';
const APP_SCOPE = '/empleados/';
const SW_PATH = '/empleados/sw.js';
const STORAGE_PREFIX = 'defcon5_empleados_';

let deferredInstallPrompt = null;

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
    const swUrl = window.location.pathname.startsWith('/empleados') ? SW_PATH : 'sw.js';
    const scopeUrl = window.location.pathname.startsWith('/empleados') ? APP_SCOPE : './';

    navigator.serviceWorker.register(swUrl, { scope: scopeUrl })
      .then((registration) => {
        console.log(`[PWA Empleados] Service Worker registrado con alcance: ${registration.scope}`);

        if (registration.waiting) {
          showUpdateNotification(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateNotification(newWorker);
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[PWA Empleados] Error al registrar Service Worker:', err);
      });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

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
    background: #0f172a;
    color: #fff;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.45);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    border-left: 5px solid #4a6cf7;
    font-family: 'Poppins', sans-serif;
  `;

  banner.innerHTML = `
    <div style="font-size: 13px;">
      <strong style="display:block;margin-bottom:2px;font-size:14px;color:#4a6cf7;">Actualización disponible</strong>
      Nueva versión de ${APP_NAME}.
    </div>
    <div style="display: flex; gap: 8px;">
      <button id="pwa-update-accept" style="background:#4a6cf7;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">Actualizar</button>
      <button id="pwa-update-close" style="background:transparent;color:#94a3b8;border:1px solid #475569;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:12px;">✕</button>
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

// 3. Flujo de instalación (Desktop y Android)
function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;

    const dismissedUntil = localStorage.getItem(`${STORAGE_PREFIX}install_dismissed`);
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) {
      return;
    }

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      return;
    }

    renderInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    console.log(`[PWA Empleados] ${APP_NAME} ha sido instalada exitosamente.`);
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
    background: #1e293b;
    color: #f8fafc;
    padding: 16px 20px;
    border-radius: 14px;
    box-shadow: 0 12px 35px rgba(0,0,0,0.3);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border: 1px solid #334155;
    font-family: 'Poppins', sans-serif;
  `;

  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="icons/icon-192.png" alt="Icono" style="width:42px;height:42px;border-radius:8px;object-fit:cover;">
      <div style="flex:1;">
        <h4 style="margin:0;font-size:14px;font-weight:700;color:#f8fafc;">Instalar ${APP_NAME}</h4>
        <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">Acceso directo rápido a tus órdenes y herramientas de taller.</p>
      </div>
      <button id="pwa-install-dismiss" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;">✕</button>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;">
      <button id="pwa-install-later" style="background:none;border:none;color:#94a3b8;font-size:12px;cursor:pointer;padding:6px 12px;">Ahora no</button>
      <button id="pwa-install-btn" style="background:#4a6cf7;color:#fff;border:none;font-size:12px;font-weight:600;padding:8px 16px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;">
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
    console.log(`[PWA Empleados] Respuesta de instalación: ${outcome}`);
    deferredInstallPrompt = null;
  });

  const dismiss = () => {
    banner.remove();
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

    setTimeout(() => {
      if (document.getElementById('pwa-ios-banner')) return;

      const iosBanner = document.createElement('div');
      iosBanner.id = 'pwa-ios-banner';
      iosBanner.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        background: #1e293b;
        color: #f8fafc;
        padding: 16px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.35);
        z-index: 9999;
        font-family: 'Poppins', sans-serif;
        font-size: 13px;
        border: 1px solid #334155;
      `;

      iosBanner.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="color:#f8fafc;"><i class="fas fa-wrench"></i> Instalar ${APP_NAME} en iOS</strong>
          <button id="pwa-ios-close" style="border:none;background:none;font-size:16px;color:#94a3b8;cursor:pointer;">✕</button>
        </div>
        <p style="margin:0 0 6px;color:#cbd5e1;">Para instalar esta aplicación en tu iPhone o iPad:</p>
        <ol style="margin:0;padding-left:20px;color:#e2e8f0;font-size:12px;">
          <li>Toca el botón <strong>Compartir</strong> <i class="fas fa-share-square"></i> en Safari.</li>
          <li>Desplázate y selecciona <strong>"Añadir a pantalla de inicio"</strong>.</li>
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

// 5. Monitor de conectividad de red
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
        background: #e11d48;
        color: #ffffff;
        padding: 8px 18px;
        border-radius: 30px;
        font-size: 13px;
        font-weight: 500;
        z-index: 10001;
        box-shadow: 0 4px 15px rgba(225,29,72,0.4);
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: 'Poppins', sans-serif;
      `;
      toast.innerHTML = `<i class="fas fa-wifi-slash"></i> Sin conexión — Operando offline`;
    } else {
      if (toast) {
        toast.style.background = '#10b981';
        toast.innerHTML = `<i class="fas fa-wifi"></i> Conexión restablecida — Sincronizando tareas...`;
        setTimeout(() => {
          if (toast) toast.remove();
        }, 3000);
      }
      syncPendingOperations();
    }
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);

  if (!navigator.onLine) {
    updateStatus();
  }
}

// 6. Cola persistente en IndexedDB para operaciones offline de empleados
const DB_NAME = 'defcon5_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'empleados_operations';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const dbInstance = e.target.result;
      if (!dbInstance.objectStoreNames.contains('admin_operations')) {
        dbInstance.createObjectStore('admin_operations', { keyPath: 'id' });
      }
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Encolar orden de trabajo o cambio de estado offline
export async function enqueueOfflineOperation(action, payload) {
  try {
    const dbInstance = await openDatabase();
    const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const operation = {
      id: `emp_op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
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

    console.log(`[Offline Sync Empleados] Operación encolada: ${action}`);
    showToast('Guardado localmente. Se enviará en cuanto haya conexión a internet.', 'info');
    return operation.id;
  } catch (err) {
    console.error('[Offline Sync Empleados] Error al encolar:', err);
    throw err;
  }
}

// Sincronizar cola al recuperar conexión
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

      console.log(`[Offline Sync Empleados] Sincronizando ${operations.length} operaciones...`);

      for (const op of operations) {
        try {
          if (op.action === 'CREATE_JOB') {
            await addDoc(collection(db, 'Trabajos'), {
              ...op.payload,
              offlineCreated: true,
              syncedAt: serverTimestamp()
            });
          } else if (op.action === 'UPDATE_JOB_STATUS' && op.payload.jobId) {
            const jobRef = doc(db, 'Trabajos', op.payload.jobId);
            await updateDoc(jobRef, {
              status: op.payload.status,
              lastStatusChange: serverTimestamp(),
              offlineUpdated: true
            });
          }

          const delTx = dbInstance.transaction(STORE_NAME, 'readwrite');
          delTx.objectStore(STORE_NAME).delete(op.id);
        } catch (syncError) {
          console.warn(`[Offline Sync Empleados] Error al procesar ${op.id}:`, syncError);
        }
      }

      showToast('Todas las tareas pendientes fueron sincronizadas.', 'success');
    };
  } catch (err) {
    console.warn('[Offline Sync Empleados] Fallo en sincronización:', err);
  }
}

function initOfflineQueueSync() {
  if (navigator.onLine) {
    syncPendingOperations();
  }
}

// 7. Notificaciones Push (Firebase Cloud Messaging)
export async function initPushNotifications(mechanicName = null) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return registerPushToken(mechanicName);
  } else if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      showToast('Notificaciones activadas para DEFCON5 Empleados.', 'success');
      return registerPushToken(mechanicName);
    }
  }
  return false;
}

async function registerPushToken(mechanicName) {
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const tokenDoc = doc(collection(db, 'fcmTokens'));
      await setDoc(tokenDoc, {
        portal: 'empleados',
        mechanicName: mechanicName || localStorage.getItem('loggedInUserName') || 'mecanico',
        endpoint: subscription.endpoint,
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp()
      }, { merge: true });
      return true;
    }
  } catch (err) {
    console.warn('[Push Empleados] Error registrando suscripción push:', err);
  }
  return false;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const bg = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
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
    box-shadow: 0 6px 20px rgba(0,0,0,0.3);
    z-index: 10002;
    font-family: 'Poppins', sans-serif;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPWA);
} else {
  initPWA();
}
