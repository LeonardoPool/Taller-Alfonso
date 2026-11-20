// Notifications Manager - Portal Administrativo (Stargate)
// Manejo centralizado de notificaciones con función de despejar bandeja
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

export function initNotificationsManager() {
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
        list.innerHTML = `
            <li class="notification-item" style="padding:15px;text-align:center;color:#888;list-style:none;">
                <div class="notification-content" style="width:100%;">
                    <div class="notification-title" style="font-size:13px;"><i class="fas fa-check-circle" style="color:#10b981;margin-right:6px;"></i>Bandeja despejada (sin notificaciones)</div>
                </div>
            </li>
        `;
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
            <button type="button" class="btn-delete-single-notif" title="Eliminar" style="background:none;border:none;color:#aaa;cursor:pointer;padding:4px;font-size:13px;" onclick="event.stopPropagation(); window._deleteNotification('${notif.id}')">
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
    if (!notifications || notifications.length === 0) {
        alert("La bandeja de notificaciones ya está vacía.");
        return;
    }

    if (!confirm(`¿Estás seguro de que deseas despejar toda la bandeja (${notifications.length} notificaciones)?`)) {
        return;
    }

    try {
        const toDelete = [...notifications];
        await Promise.all(toDelete.map(n => deleteDoc(doc(db, "Notificaciones", n.id))));
        notifications = [];
        renderNotifications();
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.textContent = '0';
            badge.style.display = 'none';
        }
    } catch (e) {
        console.error("[Notifications] Error despejando bandeja:", e);
        alert("Error al despejar la bandeja: " + e.message);
    }
}

window._deleteNotification = async function(id) {
    try {
        await deleteDoc(doc(db, "Notificaciones", id));
    } catch (e) {
        console.error("[Notifications] Error eliminando notificación:", e);
    }
};

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
