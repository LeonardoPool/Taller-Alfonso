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
        /* Dropdown universal de notificaciones - Contenedor Desktop */
        .notification-dropdown, .notification-panel {
            position: absolute !important;
            top: 52px !important;
            right: 0 !important;
            width: 380px !important;
            max-width: 92vw !important;
            background: #ffffff !important;
            border-radius: 14px !important;
            box-shadow: 0 16px 40px -10px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.08) !important;
            z-index: 99999 !important;
            display: none;
            overflow: hidden !important;
            border: none !important;
            font-family: inherit !important;
        }

        .notification-dropdown.active, .notification-panel.active {
            display: block !important;
            animation: notifDropdownFade 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
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

        /* Encabezado fijo */
        .notification-header {
            padding: 14px 18px !important;
            background: #ffffff !important;
            border-bottom: 1px solid #f1f5f9 !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            position: sticky !important;
            top: 0 !important;
            z-index: 5 !important;
        }

        .notification-header h3 {
            margin: 0 !important;
            font-size: 15px !important;
            font-weight: 700 !important;
            color: #0f172a !important;
        }

        .clear-btn {
            background: transparent !important;
            border: none !important;
            color: #3b82f6 !important;
            cursor: pointer !important;
            font-weight: 600 !important;
            font-size: 12px !important;
            padding: 5px 10px !important;
            border-radius: 6px !important;
            transition: all 0.2s ease !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 5px !important;
        }

        .clear-btn:hover {
            background: rgba(59, 130, 246, 0.1) !important;
        }

        .clear-btn.danger {
            color: #ef4444 !important;
        }

        .clear-btn.danger:hover {
            background: rgba(239, 68, 68, 0.12) !important;
        }

        /* Lista unificada */
        .notification-list {
            max-height: 390px !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            margin: 0 !important;
            padding: 0 !important;
            list-style: none !important;
            background: #ffffff !important;
        }

        /* Fila de notificación - DISEÑO UNIFICADO CONTINUO (NUNCA TARJETAS FLOTANTES AISLADAS) */
        .notification-item {
            padding: 12px 16px !important;
            border-bottom: 1px solid #f1f5f9 !important;
            border-top: none !important;
            border-right: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            display: flex !important;
            align-items: flex-start !important;
            gap: 12px !important;
            transition: background 0.18s ease, transform 0.18s ease !important;
            cursor: pointer !important;
            position: relative !important;
            box-sizing: border-box !important;
            border-left: 3px solid transparent !important;
        }

        .notification-item:hover, .notification-item:active {
            background: #f8fafc !important;
        }

        .notification-item.unread {
            background: #f0f7ff !important;
            border-left: 3px solid #3b82f6 !important;
        }

        .notification-icon {
            width: 34px !important;
            height: 34px !important;
            border-radius: 50% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
            font-size: 14px !important;
        }

        .notification-icon.stock-out {
            background: rgba(239, 68, 68, 0.12) !important;
            color: #ef4444 !important;
        }

        .notification-icon.job, .notification-icon.update {
            background: rgba(59, 130, 246, 0.12) !important;
            color: #3b82f6 !important;
        }

        .notification-icon.success, .notification-icon.restocked {
            background: rgba(16, 185, 129, 0.12) !important;
            color: #10b981 !important;
        }

        .notification-content {
            flex: 1 !important;
            min-width: 0 !important;
        }

        .notification-title {
            font-weight: 600 !important;
            font-size: 13px !important;
            color: #1e293b !important;
            margin-bottom: 2px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
        }

        .notification-desc {
            font-size: 12px !important;
            color: #64748b !important;
            line-height: 1.4 !important;
            margin-bottom: 4px !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
        }

        .notification-time {
            font-size: 11px !important;
            color: #94a3b8 !important;
        }

        .btn-delete-single-notif {
            background: none !important;
            border: none !important;
            color: #94a3b8 !important;
            cursor: pointer !important;
            padding: 4px !important;
            font-size: 13px !important;
            border-radius: 4px !important;
            transition: all 0.2s ease !important;
            flex-shrink: 0 !important;
        }

        .btn-delete-single-notif:hover {
            color: #ef4444 !important;
            background: rgba(239, 68, 68, 0.1) !important;
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
            animation: notifCascadeSlideOut 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
        }

        .notification-item.notif-removing {
            pointer-events: none !important;
            animation: notifSingleSlideOut 0.32s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
        }

        .notification-empty-state {
            padding: 32px 16px !important;
            text-align: center !important;
            color: #64748b !important;
            list-style: none !important;
            animation: notifEmptyPopIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        }

        .notification-empty-icon {
            width: 48px !important;
            height: 48px !important;
            margin: 0 auto 12px !important;
            border-radius: 50% !important;
            background: rgba(16, 185, 129, 0.12) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 22px !important;
            color: #10b981 !important;
            animation: notifCheckGlow 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
        }

        /* RESPONSIVIDAD PARA DISPOSITIVOS MÓVILES (ANDROID & IOS SAFARI) */
        @media screen and (max-width: 768px) {
            .notification-dropdown, .notification-panel {
                position: fixed !important;
                top: 64px !important;
                left: 14px !important;
                right: 14px !important;
                width: auto !important;
                max-width: 480px !important;
                margin: 0 auto !important;
                max-height: calc(100vh - 84px) !important;
                border-radius: 16px !important;
                border: 1px solid rgba(226, 232, 240, 0.9) !important;
                box-shadow: 0 25px 60px -10px rgba(0, 0, 0, 0.45), 0 0 0 100vmax rgba(15, 23, 42, 0.5) !important;
                z-index: 999999 !important;
            }

            .notification-list {
                max-height: calc(100vh - 165px) !important;
                -webkit-overflow-scrolling: touch !important;
            }
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
            // Si el clic provino desde dentro del panel (dropdown), no hacemos toggle
            if (panel.contains(e.target)) return;
            e.stopPropagation();
            panel.classList.toggle('active');
        });

        panel.addEventListener('click', (e) => {
            e.stopPropagation();
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
