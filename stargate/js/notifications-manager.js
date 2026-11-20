// Notifications Manager - Portal Administrativo (Stargate)
// Manejo centralizado, dinámico e inteligente de notificaciones globales con sincronización en Firestore
import { 
    db, 
    collection, 
    query, 
    limit, 
    onSnapshot, 
    getDocs,
    doc, 
    addDoc,
    updateDoc, 
    deleteDoc,
    serverTimestamp 
} from './firebase-config.js';

let notifications = [];
let unsubscribeNotifs = null;
let unsubscribeStockMonitor = null;
let isClearing = false;
let isInitialized = false;

// Inicializador global
export function initNotificationsManager() {
    if (isInitialized) return;
    isInitialized = true;

    ensureBackdrop();

    const notificationBtn = document.getElementById('notificationBtn');
    const panel = document.getElementById('notificationDropdown') || document.getElementById('notificationPanel');
    const markAllReadBtn = document.getElementById('markAllRead');
    const clearBtn = document.getElementById('clearAllNotifications') || document.getElementById('clearNotifications');
    const backdrop = document.getElementById('notificationsBackdrop');

    if (notificationBtn && panel) {
        notificationBtn.addEventListener('click', (e) => {
            // Si el clic provino desde dentro del panel, no alternar
            if (panel.contains(e.target)) return;
            e.stopPropagation();
            toggleNotificationPanel();
        });

        panel.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && !notificationBtn.contains(e.target)) {
                closeNotificationPanel();
            }
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', () => {
            closeNotificationPanel();
        });
    }

    const closeMobileBtn = document.getElementById('closeNotifMobile');
    if (closeMobileBtn) {
        closeMobileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeNotificationPanel();
        });
    }

    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', markAllNotificationsAsRead);
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllNotifications);
    }

    // 1. Depurar registros obsoletos de la base de datos (+3 días o registros legacy)
    autoPurgeStaleNotifications();

    // 2. Iniciar escucha reactiva en tiempo real
    listenToNotifications();

    // 3. Monitor dinámico de inventario para alertas inteligentes de stock crítico
    setupDynamicInventoryMonitor();
}

function ensureBackdrop() {
    let backdrop = document.getElementById('notificationsBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'notificationsBackdrop';
        backdrop.className = 'notifications-backdrop';
        document.body.appendChild(backdrop);
    }
    backdrop.onclick = (e) => {
        e.stopPropagation();
        closeNotificationPanel();
    };
}

function toggleNotificationPanel() {
    const panel = document.getElementById('notificationDropdown') || document.getElementById('notificationPanel');
    const backdrop = document.getElementById('notificationsBackdrop');
    if (!panel) return;

    const isActive = panel.classList.contains('active');
    if (isActive) {
        closeNotificationPanel();
    } else {
        panel.classList.add('active');
        if (backdrop && window.innerWidth <= 768) {
            backdrop.classList.add('active');
        }
    }
}

function closeNotificationPanel() {
    const panel = document.getElementById('notificationDropdown') || document.getElementById('notificationPanel');
    const backdrop = document.getElementById('notificationsBackdrop');
    if (panel) panel.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
}

// Depuración automática de notificaciones antiguas y saneamiento de Firestore
// Limpia de la base de datos documentos obsoletos de hace cientos de días para mantener la BD fresca y rápida
async function autoPurgeStaleNotifications() {
    try {
        const snap = await getDocs(collection(db, "Notificaciones"));
        const now = Date.now();
        const maxAgeMs = 3 * 24 * 60 * 60 * 1000; // 3 días de vigencia
        const isFirstGlobalPurge = !localStorage.getItem('defcon5_purged_all_legacy_v3');
        const staleDocs = [];

        snap.forEach(docSnap => {
            const data = docSnap.data();
            let timeMs = 0;
            if (data.timestamp?.toMillis) {
                timeMs = data.timestamp.toMillis();
            } else if (data.timestamp?.toDate) {
                timeMs = data.timestamp.toDate().getTime();
            } else if (data.timestamp) {
                timeMs = new Date(data.timestamp).getTime();
            }

            // Si es la purga inicial global para limpiar todo el registro obsoleto histórico,
            // o si no tiene fecha válida o supera los 3 días de antigüedad
            if (isFirstGlobalPurge || !timeMs || isNaN(timeMs) || (now - timeMs) > maxAgeMs) {
                staleDocs.push(docSnap.id);
            }
        });

        if (staleDocs.length > 0) {
            console.log(`[Notifications] Depurando ${staleDocs.length} notificaciones obsoletas de Firestore...`);
            await Promise.all(staleDocs.map(id => deleteDoc(doc(db, "Notificaciones", id))));
            console.log(`[Notifications] Depuración completada con éxito.`);
        }
        localStorage.setItem('defcon5_purged_all_legacy_v3', 'true');
    } catch (err) {
        console.warn("[Notifications] Error en depuración automática:", err);
    }
}

// Escucha en tiempo real de notificaciones globales en Firestore
function listenToNotifications() {
    try {
        if (unsubscribeNotifs) unsubscribeNotifs();

        const notifQuery = query(collection(db, "Notificaciones"), limit(35));
        unsubscribeNotifs = onSnapshot(notifQuery, (snapshot) => {
            if (isClearing) return; // Evitar que onSnapshot interrumpa la animación de salida

            notifications = [];
            let unreadCount = 0;

            snapshot.forEach(docSnap => {
                const notif = { id: docSnap.id, ...docSnap.data() };
                notifications.push(notif);
                if (!notif.read) unreadCount++;
            });

            // Ordenar por fecha más reciente
            notifications.sort((a, b) => {
                const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp || 0).getTime();
                const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp || 0).getTime();
                return timeB - timeA;
            });

            const badge = document.getElementById('notificationBadge');
            if (badge) {
                badge.textContent = unreadCount;
                badge.style.display = unreadCount > 0 ? 'flex' : 'none';
            }

            renderNotifications();
        }, (error) => {
            console.warn("[Notifications] Error al escuchar colección Notificaciones:", error);
        });
    } catch (e) {
        console.warn("[Notifications] Error iniciando listener:", e);
    }
}

// Renderizado reactivo y adaptativo de la lista continua de notificaciones
function renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    list.innerHTML = '';

    if (notifications.length === 0) {
        renderEmptyState(list);
        return;
    }

    notifications.forEach(notif => {
        const isListTag = list.tagName.toLowerCase() === 'ul' || list.tagName.toLowerCase() === 'ol';
        const item = document.createElement(isListTag ? 'li' : 'div');
        item.className = `notification-item ${notif.read ? '' : 'unread'}`;

        let timeAgo = 'Reciente';
        if (notif.timestamp) {
            const date = notif.timestamp.toDate ? notif.timestamp.toDate() : new Date(notif.timestamp);
            const minutes = Math.floor((new Date() - date) / 60000);
            if (minutes < 1) timeAgo = 'Hace unos segundos';
            else if (minutes < 60) timeAgo = `Hace ${minutes} min`;
            else if (minutes < 1440) timeAgo = `Hace ${Math.floor(minutes / 60)} h`;
            else timeAgo = `Hace ${Math.floor(minutes / 1440)} d`;
        }

        // Tipo e icono
        const rawType = (notif.type || '').toLowerCase();
        let iconType = 'info';
        let iconGlyph = 'fa-bell';

        if (rawType.includes('stock') || rawType === 'critical') {
            iconType = 'stock-out';
            iconGlyph = 'fa-exclamation-triangle';
        } else if (rawType.includes('job') || rawType.includes('trabajo') || rawType === 'update') {
            iconType = 'job';
            iconGlyph = 'fa-tools';
        } else if (rawType.includes('success') || rawType.includes('reabastecid')) {
            iconType = 'success';
            iconGlyph = 'fa-check-circle';
        }

        if (notif.icon) {
            iconGlyph = notif.icon.startsWith('fa-') ? notif.icon : `fa-${notif.icon}`;
        }

        const titleText = notif.title || notif.message || 'Notificación del Sistema';
        const descText = (notif.title && notif.message && notif.title !== notif.message) ? notif.message : '';

        item.innerHTML = `
            <div class="notification-icon ${iconType}">
                <i class="fas ${iconGlyph}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-title">${escapeHtml(titleText)}</div>
                ${descText ? `<div class="notification-desc">${escapeHtml(descText)}</div>` : ''}
                <div class="notification-time">${timeAgo}</div>
            </div>
            <button type="button" class="btn-delete-single-notif" title="Eliminar de la lista" onclick="event.stopPropagation(); window._deleteNotification('${notif.id}', this)">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Navegación inteligente al dar click
        item.addEventListener('click', async () => {
            if (!notif.read) {
                await markNotificationAsRead(notif.id);
            }
            closeNotificationPanel();

            if (notif.targetUrl) {
                const currentPath = window.location.pathname;
                if (!currentPath.endsWith(notif.targetUrl)) {
                    window.location.href = notif.targetUrl;
                }
            } else if (iconType === 'stock-out') {
                if (!window.location.pathname.endsWith('almacen.html')) {
                    window.location.href = 'almacen.html';
                }
            } else if (iconType === 'job') {
                if (!window.location.pathname.endsWith('trabajos.html')) {
                    window.location.href = 'trabajos.html';
                }
            }
        });

        list.appendChild(item);
    });
}

function renderEmptyState(list) {
    list.innerHTML = `
        <div class="notification-empty-state">
            <div class="notification-empty-icon">
                <i class="fas fa-check"></i>
            </div>
            <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 4px;">Bandeja Despejada</div>
            <div style="font-size: 12px; color: #64748b;">No hay notificaciones pendientes. Todo al día.</div>
        </div>
    `;
}

// Marcar una notificación como leída en Firestore
export async function markNotificationAsRead(id) {
    try {
        await updateDoc(doc(db, "Notificaciones", id), { read: true });
    } catch (e) {
        console.error("[Notifications] Error marcando leída:", e);
    }
}

// Marcar todas las notificaciones como leídas en Firestore
export async function markAllNotificationsAsRead() {
    try {
        const unread = notifications.filter(n => !n.read);
        if (unread.length === 0) return;
        await Promise.all(unread.map(n => updateDoc(doc(db, "Notificaciones", n.id), { read: true })));
    } catch (e) {
        console.error("[Notifications] Error marcando todas leídas:", e);
    }
}

// DESPEJAR BANDEJA: Elimina el 100% de las notificaciones en Firestore con animación inteligente
export async function clearAllNotifications() {
    if (isClearing) return;

    if (!notifications || notifications.length === 0) {
        alert("La bandeja de notificaciones ya está vacía.");
        return;
    }

    if (!confirm(`¿Deseas despejar la bandeja y eliminar todas las notificaciones (${notifications.length}) de la base de datos?`)) {
        return;
    }

    const clearBtn = document.getElementById('clearAllNotifications') || document.getElementById('clearNotifications');
    const list = document.getElementById('notificationList');
    const badge = document.getElementById('notificationBadge');

    try {
        isClearing = true;
        if (clearBtn) {
            clearBtn.disabled = true;
            clearBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Despejando...';
        }

        // 1. Animación visual escalonada en cascada
        const items = list ? list.querySelectorAll('.notification-item') : [];
        items.forEach((item, index) => {
            item.style.animationDelay = `${index * 0.03}s`;
            item.classList.add('notif-clearing');
        });

        // 2. Transición suave del badge a 0
        if (badge) {
            badge.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
            badge.style.transform = 'scale(0)';
            badge.style.opacity = '0';
        }

        const exitDuration = Math.max(350, Math.min(items.length * 30 + 350, 700));

        // 3. Eliminar físicamente todos los documentos en la colección Notificaciones de Firestore
        const notifsSnapshot = await getDocs(collection(db, "Notificaciones"));
        const deletePromises = notifsSnapshot.docs.map(docSnap => deleteDoc(doc(db, "Notificaciones", docSnap.id)));

        // Guardar marca de tiempo de despeje para evitar re-alertas inmediatas
        localStorage.setItem('defcon5_last_cleared_notifs_time', Date.now().toString());

        // 4. Sincronización concurrente de borrado y animación de salida
        await Promise.all([
            Promise.all(deletePromises),
            new Promise(resolve => setTimeout(resolve, exitDuration))
        ]);

        notifications = [];

        if (badge) {
            badge.textContent = '0';
            badge.style.display = 'none';
            badge.style.transform = '';
            badge.style.opacity = '';
        }

        if (list) {
            renderEmptyState(list);
        }

    } catch (e) {
        console.error("[Notifications] Error crítico al despejar bandeja:", e);
        alert("Ocurrió un error al despejar la bandeja: " + e.message);
        renderNotifications();
    } finally {
        isClearing = false;
        if (clearBtn) {
            clearBtn.disabled = false;
            clearBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Despejar';
        }
    }
}

// Eliminación individual de Firestore
window._deleteNotification = async function(id, btnElement) {
    try {
        const item = btnElement ? btnElement.closest('.notification-item') : null;
        if (item) {
            item.classList.add('notif-removing');
        }

        await deleteDoc(doc(db, "Notificaciones", id));
        notifications = notifications.filter(n => n.id !== id);

        setTimeout(() => {
            if (item) item.remove();
            const badge = document.getElementById('notificationBadge');
            const unread = notifications.filter(n => !n.read).length;
            if (badge) {
                badge.textContent = unread;
                badge.style.display = unread > 0 ? 'flex' : 'none';
            }
            const list = document.getElementById('notificationList');
            if (notifications.length === 0 && list) {
                renderEmptyState(list);
            }
        }, 280);
    } catch (e) {
        console.error("[Notifications] Error eliminando notificación:", e);
    }
};

// Monitor dinámico inteligente: Genera alertas en tiempo real basadas en inventario crítico
function setupDynamicInventoryMonitor() {
    try {
        if (unsubscribeStockMonitor) unsubscribeStockMonitor();

        unsubscribeStockMonitor = onSnapshot(collection(db, "Piezas"), async (snapshot) => {
            const lastCleared = parseInt(localStorage.getItem('defcon5_last_cleared_notifs_time') || '0', 10);
            const now = Date.now();

            // Si el usuario despejó la bandeja hace menos de 10 minutos, respetamos su decisión
            if (now - lastCleared < 600000) return;

            const existingAlertTitles = new Set(notifications.map(n => n.relatedId || n.title));

            for (const docSnap of snapshot.docs) {
                const part = docSnap.data();
                const stock = Number(part.stock) || 0;
                const minStock = Number(part.minStock) || 5;

                // Si una pieza tiene stock crítico y no ha sido notificada activamente
                if (stock < minStock && !existingAlertTitles.has(docSnap.id)) {
                    const name = part.partName || part.nombre || "Pieza";
                    const loc = part.storageLocation || part.estante || "Almacén General";

                    await createSystemNotification({
                        title: `Stock Crítico: ${name}`,
                        message: `Solo quedan ${stock} unidades (Mínimo: ${minStock}) en ${loc}.`,
                        type: 'stock-out',
                        icon: 'exclamation-triangle',
                        targetUrl: 'almacen.html',
                        relatedId: docSnap.id
                    });
                    break;
                }
            }
        }, (err) => {
            console.warn("[Notifications] Monitor de inventario pausado:", err);
        });
    } catch (e) {
        console.warn("[Notifications] Error en monitor de inventario:", e);
    }
}

// Función auxiliar exportada para generar notificaciones desde cualquier parte del sistema
export async function createSystemNotification({ title, message, type = 'info', icon = 'bell', targetUrl = '', relatedId = '' }) {
    try {
        await addDoc(collection(db, "Notificaciones"), {
            title,
            message,
            type,
            icon,
            targetUrl,
            relatedId,
            read: false,
            timestamp: serverTimestamp()
        });
    } catch (err) {
        console.warn("[Notifications] Error creando notificación en Firestore:", err);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
