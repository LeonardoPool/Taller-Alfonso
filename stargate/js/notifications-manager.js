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

// Inyección universal de estilos para dropdown, animaciones y botones en todos los módulos
function ensureUniversalStyles() {
    if (document.getElementById('notifications-global-styles')) return;

    const style = document.createElement('style');
    style.id = 'notifications-global-styles';
    style.textContent = `
        /* Dropdown universal de notificaciones */
        .notification-dropdown, .notification-panel {
            position: absolute;
            top: 55px;
            right: 0;
            width: 360px;
            max-width: 90vw;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 12px 35px rgba(0, 0, 0, 0.15);
            z-index: 9999;
            display: none;
            overflow: hidden;
            border: 1px solid rgba(0, 0, 0, 0.08);
            font-family: inherit;
        }

        .notification-dropdown.active, .notification-panel.active {
            display: block;
            animation: notifDropdownFade 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes notifDropdownFade {
            0% {
                opacity: 0;
                transform: translateY(-8px) scale(0.98);
            }
            100% {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        .notification-header {
            padding: 14px 16px;
            background: #ffffff;
            border-bottom: 1px solid #f1f2f6;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .notification-header h3 {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            color: #1e293b;
        }

        .clear-btn {
            background: none;
            border: none;
            color: #3b82f6;
            cursor: pointer;
            font-weight: 500;
            font-size: 12px;
            padding: 4px 8px;
            border-radius: 5px;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .clear-btn:hover {
            background: rgba(59, 130, 246, 0.1);
        }

        .clear-btn.danger {
            color: #ef4444;
        }

        .clear-btn.danger:hover {
            background: rgba(239, 68, 68, 0.12);
        }

        .notification-list {
            max-height: 380px;
            overflow-y: auto;
            margin: 0;
            padding: 0;
            list-style: none;
        }

        .notification-item {
            padding: 12px 16px;
            border-bottom: 1px solid #f1f5f9;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            transition: background 0.2s ease, transform 0.2s ease;
            cursor: pointer;
            position: relative;
            overflow: hidden;
            box-sizing: border-box;
        }

        .notification-item:hover {
            background: #f8fafc;
        }

        .notification-item.unread {
            background: #f0f7ff;
            border-left: 3px solid #3b82f6;
        }

        .notification-icon {
            width: 34px;
            height: 34px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 14px;
        }

        .notification-icon.stock-out {
            background: rgba(239, 68, 68, 0.12);
            color: #ef4444;
        }

        .notification-icon.job, .notification-icon.update {
            background: rgba(59, 130, 246, 0.12);
            color: #3b82f6;
        }

        .notification-icon.success, .notification-icon.restocked {
            background: rgba(16, 185, 129, 0.12);
            color: #10b981;
        }

        .notification-content {
            flex: 1;
            min-width: 0;
        }

        .notification-title {
            font-weight: 600;
            font-size: 13px;
            color: #1e293b;
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .notification-desc {
            font-size: 12px;
            color: #64748b;
            line-height: 1.4;
            margin-bottom: 4px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .notification-time {
            font-size: 11px;
            color: #94a3b8;
        }

        .btn-delete-single-notif {
            background: none;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            padding: 4px;
            font-size: 13px;
            border-radius: 4px;
            transition: all 0.2s ease;
            flex-shrink: 0;
        }

        .btn-delete-single-notif:hover {
            color: #ef4444;
            background: rgba(239, 68, 68, 0.1);
        }

        /* Animaciones inteligentes de salida y entrada */
        @keyframes notifCascadeSlideOut {
            0% {
                opacity: 1;
                transform: translateX(0) scale(1);
                max-height: 120px;
                padding-top: 12px;
                padding-bottom: 12px;
                margin-bottom: 0px;
            }
            30% {
                opacity: 0.85;
                transform: translateX(-6px) scale(0.99);
            }
            100% {
                opacity: 0;
                transform: translateX(115%) scale(0.92);
                max-height: 0px;
                padding-top: 0px;
                padding-bottom: 0px;
                margin: 0px;
                border-width: 0px;
            }
        }

        @keyframes notifSingleSlideOut {
            0% {
                opacity: 1;
                transform: translateX(0) scale(1);
                max-height: 120px;
                padding-top: 12px;
                padding-bottom: 12px;
            }
            100% {
                opacity: 0;
                transform: translateX(110%) scale(0.9);
                max-height: 0px;
                padding-top: 0px;
                padding-bottom: 0px;
                margin: 0px;
                border-width: 0px;
            }
        }

        @keyframes notifEmptyPopIn {
            0% {
                opacity: 0;
                transform: scale(0.85) translateY(12px);
            }
            60% {
                transform: scale(1.03) translateY(-2px);
            }
            100% {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        @keyframes notifCheckGlow {
            0% {
                transform: scale(0) rotate(-45deg);
                box-shadow: 0 0 0 rgba(16, 185, 129, 0);
            }
            60% {
                transform: scale(1.2) rotate(10deg);
                box-shadow: 0 0 20px rgba(16, 185, 129, 0.4);
            }
            100% {
                transform: scale(1) rotate(0deg);
                box-shadow: 0 0 10px rgba(16, 185, 129, 0.2);
            }
        }

        .notification-item.notif-clearing {
            pointer-events: none !important;
            animation: notifCascadeSlideOut 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        .notification-item.notif-removing {
            pointer-events: none !important;
            animation: notifSingleSlideOut 0.32s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        .notification-empty-state {
            padding: 32px 16px;
            text-align: center;
            color: #64748b;
            list-style: none;
            animation: notifEmptyPopIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .notification-empty-icon {
            width: 48px;
            height: 48px;
            margin: 0 auto 12px;
            border-radius: 50%;
            background: rgba(16, 185, 129, 0.12);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            color: #10b981;
            animation: notifCheckGlow 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
    `;
    document.head.appendChild(style);
}

// Inicializador global
export function initNotificationsManager() {
    ensureUniversalStyles();

    const notificationBtn = document.getElementById('notificationBtn');
    const panel = document.getElementById('notificationDropdown') || document.getElementById('notificationPanel');
    const markAllReadBtn = document.getElementById('markAllRead');
    const clearBtn = document.getElementById('clearAllNotifications') || document.getElementById('clearNotifications');

    if (notificationBtn && panel) {
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && !notificationBtn.contains(e.target)) {
                panel.classList.remove('active');
            }
        });
    }

    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', markAllNotificationsAsRead);
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllNotifications);
    }

    listenToNotifications();
    setupDynamicInventoryMonitor();
}

// Escucha en tiempo real de notificaciones en Firestore
function listenToNotifications() {
    try {
        if (unsubscribeNotifs) unsubscribeNotifs();

        const notifQuery = query(collection(db, "Notificaciones"), limit(25));
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

// Renderizado reactivo de la lista de notificaciones
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
            else if (minutes < 1440) timeAgo = `Hace ${Math.floor(minutes/60)} h`;
            else timeAgo = `Hace ${Math.floor(minutes/1440)} d`;
        }

        const iconType = notif.type === 'stock-out' ? 'stock-out' : 
                         notif.type === 'job' ? 'job' : 
                         notif.type === 'success' ? 'success' : 'update';

        const iconGlyph = notif.icon ? `fa-${notif.icon}` : 
                          (notif.type === 'stock-out' ? 'fa-exclamation-triangle' : 
                          (notif.type === 'job' ? 'fa-tools' : 'fa-bell'));

        item.innerHTML = `
            <div class="notification-icon ${iconType}">
                <i class="fas ${iconGlyph}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-title">
                    ${escapeHtml(notif.title || 'Notificación')}
                </div>
                ${notif.message ? `<div class="notification-desc">${escapeHtml(notif.message)}</div>` : ''}
                <div class="notification-time">${timeAgo}</div>
            </div>
            <button type="button" class="btn-delete-single-notif" title="Eliminar" onclick="event.stopPropagation(); window._deleteNotification('${notif.id}', this)">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Navegación inteligente y marcado como leída
        item.addEventListener('click', async () => {
            if (!notif.read) {
                await markNotificationAsRead(notif.id);
            }
            if (notif.targetUrl) {
                const currentPath = window.location.pathname;
                if (!currentPath.endsWith(notif.targetUrl)) {
                    window.location.href = notif.targetUrl;
                }
            } else if (notif.type === 'stock-out') {
                if (!window.location.pathname.endsWith('almacen.html')) {
                    window.location.href = 'almacen.html';
                }
            } else if (notif.type === 'job') {
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
            <div style="font-weight: 600; font-size: 14px; color: #1e293b; margin-bottom: 4px;">Bandeja Despejada</div>
            <div style="font-size: 12px; color: #64748b;">No tienes notificaciones pendientes</div>
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

// Marcar todas como leídas en Firestore
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

    if (!confirm(`¿Estás seguro de que deseas despejar toda la bandeja (${notifications.length} notificaciones)? Esta acción las eliminará de la base de datos.`)) {
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
            item.style.animationDelay = `${index * 0.04}s`;
            item.classList.add('notif-clearing');
        });

        // 2. Transición suave del badge a 0
        if (badge) {
            badge.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
            badge.style.transform = 'scale(0)';
            badge.style.opacity = '0';
        }

        const exitDuration = Math.max(380, Math.min(items.length * 40 + 380, 750));

        // 3. Eliminar físicamente todos los documentos en la colección Notificaciones de Firestore
        const notifsSnapshot = await getDocs(collection(db, "Notificaciones"));
        const deletePromises = notifsSnapshot.docs.map(docSnap => deleteDoc(doc(db, "Notificaciones", docSnap.id)));

        // Guardar marca de tiempo de despeje para evitar que el monitor re-genere alertas que el admin acaba de descartar
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

// Eliminación individual inteligente de Firestore
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
        }, 300);
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

            // Si el usuario despejó la bandeja hace menos de 5 minutos, respetamos su decisión
            if (now - lastCleared < 300000) return;

            const existingAlertTitles = new Set(notifications.map(n => n.relatedId || n.title));

            for (const docSnap of snapshot.docs) {
                const part = docSnap.data();
                const stock = Number(part.stock) || 0;
                const minStock = Number(part.minStock) || 5;

                // Si una pieza tiene stock crítico y no ha sido notificada activamente
                if (stock < minStock && !existingAlertTitles.has(docSnap.id)) {
                    const name = part.partName || part.nombre || "Pieza";
                    const loc = part.storageLocation || part.estante || "Almacén General";

                    // Crear notificación dinámica en Firestore
                    await createSystemNotification({
                        title: `Stock Crítico: ${name}`,
                        message: `Solo quedan ${stock} unidades (Mínimo: ${minStock}) en ${loc}.`,
                        type: 'stock-out',
                        icon: 'exclamation-triangle',
                        targetUrl: 'almacen.html',
                        relatedId: docSnap.id
                    });
                    break; // Una alerta a la vez para no saturar
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
