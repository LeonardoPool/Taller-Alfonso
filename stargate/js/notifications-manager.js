// Notifications Manager - Portal Administrativo (Stargate)
// Manejo centralizado de notificaciones con función de despejar bandeja y animaciones inteligentes
import { 
    db, 
    collection, 
    query, 
    limit, 
    onSnapshot, 
    doc, 
    updateDoc, 
    deleteDoc 
} from './firebase-config.js';

let notifications = [];
let unsubscribe = null;
let isClearing = false;

// Inyección automática de estilos y keyframes para garantizar animación consistente en todo el portal
function ensureAnimationStyles() {
    if (document.getElementById('notifications-animations-style')) return;
    const style = document.createElement('style');
    style.id = 'notifications-animations-style';
    style.textContent = `
        @keyframes notifCascadeSlideOut {
            0% {
                opacity: 1;
                transform: translateX(0) scale(1);
                max-height: 120px;
                padding-top: 15px;
                padding-bottom: 15px;
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
                margin-top: 0px;
                margin-bottom: 0px;
                border-width: 0px;
            }
        }

        @keyframes notifSingleSlideOut {
            0% {
                opacity: 1;
                transform: translateX(0) scale(1);
                max-height: 120px;
                padding-top: 15px;
                padding-bottom: 15px;
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

        .notification-item {
            transition: background 0.2s ease, transform 0.2s ease, max-height 0.35s ease, opacity 0.35s ease;
            overflow: hidden;
            box-sizing: border-box;
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
            padding: 30px 16px;
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

export function initNotificationsManager() {
    ensureAnimationStyles();

    const notificationBtn = document.getElementById('notificationBtn');
    const panel = document.getElementById('notificationPanel') || document.getElementById('notificationDropdown');
    const markAllReadBtn = document.getElementById('markAllRead') || document.getElementById('markAllReadAlmacen');
    const clearBtn = document.getElementById('clearNotifications') || document.getElementById('clearAllNotifications');

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
}

function listenToNotifications() {
    try {
        const notifQuery = query(collection(db, "Notificaciones"), limit(15));
        unsubscribe = onSnapshot(notifQuery, (snapshot) => {
            if (isClearing) {
                // Durante la animación de despeje no interrumpimos visualmente el flujo
                return;
            }

            notifications = [];
            let unreadCount = 0;

            snapshot.forEach(docSnap => {
                const notif = { id: docSnap.id, ...docSnap.data() };
                notifications.push(notif);
                if (!notif.read) unreadCount++;
            });

            // Ordenar por fecha descendente
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
            console.warn("[Notifications] Error escuchando notificaciones:", error);
        });
    } catch (e) {
        console.warn("[Notifications] Error iniciando listener:", e);
    }
}

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
        item.style.cursor = 'pointer';

        let timeAgo = 'Reciente';
        if (notif.timestamp) {
            const date = notif.timestamp.toDate ? notif.timestamp.toDate() : new Date(notif.timestamp);
            const minutes = Math.floor((new Date() - date) / 60000);
            if (minutes < 1) timeAgo = 'Hace unos segundos';
            else if (minutes < 60) timeAgo = `Hace ${minutes} min`;
            else if (minutes < 1440) timeAgo = `Hace ${Math.floor(minutes/60)} h`;
            else timeAgo = `Hace ${Math.floor(minutes/1440)} d`;
        }

        const iconType = notif.type === 'stock-out' ? 'fa-exclamation-triangle' : 
                         notif.type === 'update' ? 'fa-sync-alt' : 
                         (notif.icon ? `fa-${notif.icon}` : 'fa-bell');

        item.innerHTML = `
            <div class="notification-icon" style="margin-right:10px;">
                <i class="fas ${iconType}" style="color:${notif.read ? '#6c757d' : '#3b82f6'};"></i>
            </div>
            <div class="notification-content" style="flex:1;">
                <div class="notification-title" style="font-weight:${notif.read ? 'normal' : '600'};font-size:13px;">
                    ${escapeHtml(notif.title || notif.message || 'Notificación')}
                </div>
                ${notif.title && notif.message ? `<div class="notification-desc" style="font-size:12px;color:#888;">${escapeHtml(notif.message)}</div>` : ''}
                <div class="notification-time" style="font-size:11px;color:#aaa;">${timeAgo}</div>
            </div>
            <button type="button" class="btn-delete-single-notif" title="Eliminar" style="background:none;border:none;color:#aaa;cursor:pointer;padding:4px;font-size:13px;" onclick="event.stopPropagation(); window._deleteNotification('${notif.id}', this)">
                <i class="fas fa-times"></i>
            </button>
        `;

        item.addEventListener('click', () => {
            if (!notif.read) {
                markNotificationAsRead(notif.id);
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

export async function markNotificationAsRead(id) {
    try {
        await updateDoc(doc(db, "Notificaciones", id), { read: true });
    } catch (e) {
        console.error("[Notifications] Error marcando leída:", e);
    }
}

export async function markAllNotificationsAsRead() {
    try {
        const unread = notifications.filter(n => !n.read);
        if (unread.length === 0) return;
        await Promise.all(unread.map(n => updateDoc(doc(db, "Notificaciones", n.id), { read: true })));
    } catch (e) {
        console.error("[Notifications] Error marcando todas leídas:", e);
    }
}

export async function clearAllNotifications() {
    if (isClearing) return;

    if (!notifications || notifications.length === 0) {
        alert("La bandeja de notificaciones ya está vacía.");
        return;
    }

    if (!confirm(`¿Estás seguro de que deseas despejar toda la bandeja (${notifications.length} notificaciones)?`)) {
        return;
    }

    const clearBtn = document.getElementById('clearNotifications') || document.getElementById('clearAllNotifications');
    const list = document.getElementById('notificationList');
    const badge = document.getElementById('notificationBadge');

    try {
        isClearing = true;
        if (clearBtn) {
            clearBtn.disabled = true;
            clearBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Despejando...';
        }

        // 1. Desencadenar animación inteligente en cascada en los elementos DOM
        const items = list ? list.querySelectorAll('.notification-item') : [];
        items.forEach((item, index) => {
            item.style.animationDelay = `${index * 0.045}s`;
            item.classList.add('notif-clearing');
        });

        // 2. Transición suave para ocultar el badge
        if (badge) {
            badge.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
            badge.style.transform = 'scale(0)';
            badge.style.opacity = '0';
        }

        // Tiempo total de salida escalonada (mínimo 380ms, máximo 750ms)
        const exitDuration = Math.max(380, Math.min(items.length * 45 + 380, 750));

        // 3. Proceso concurrente en Firestore para eliminar los documentos
        const toDelete = [...notifications];
        const deletePromises = toDelete.map(n => deleteDoc(doc(db, "Notificaciones", n.id)));

        // 4. Esperar en paralelo la finalización del borrado en Firestore y la animación visual
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
        console.error("[Notifications] Error al despejar la bandeja:", e);
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

// Eliminación individual inteligente con animación
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

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
