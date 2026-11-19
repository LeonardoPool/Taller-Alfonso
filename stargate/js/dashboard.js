// Dashboard - Portal Administrativo (Stargate)
import { initAuthGuard } from './auth-guard.js';
import { 
    db, 
    collection, 
    query, 
    orderBy, 
    limit, 
    onSnapshot, 
    getDocs, 
    doc, 
    updateDoc 
} from './firebase-config.js';

let unsubscribeLowStock = null;
let unsubscribeNotifications = null;
let unsubscribeJobs = null;
let notifications = [];

function onReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

onReady(() => {
    // Inicializar Auth Guard
    initAuthGuard((user) => {
        // Cargar datos en tiempo real
        setupLowStockListener();
        setupNotificationsListener();
        setupStatsSummary();
    });

    // Elementos DOM
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationPanel = document.getElementById('notificationPanel');
    const markAllRead = document.getElementById('markAllRead');

    if (notificationBtn && notificationPanel) {
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notificationPanel.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!notificationPanel.contains(e.target) && !notificationBtn.contains(e.target)) {
                notificationPanel.classList.remove('active');
            }
        });
    }

    if (markAllRead) {
        markAllRead.addEventListener('click', markAllNotificationsAsRead);
    }
});

// Resumen estadístico dinámico (Trabajos, Clientes, Ingresos)
async function setupStatsSummary() {
    try {
        // 1. Escuchar trabajos para estadísticas y recientes
        const trabajosRef = collection(db, "Trabajos");
        unsubscribeJobs = onSnapshot(trabajosRef, (snapshot) => {
            let pendingCount = 0;
            let activeCount = 0;
            let monthlyEarnings = 0;
            const jobsList = [];

            snapshot.forEach(docSnap => {
                const job = { id: docSnap.id, ...docSnap.data() };
                jobsList.push(job);

                const status = (job.status || '').toLowerCase();
                if (status === 'trabajo abierto' || status === 'pendiente' || status === 'en espera') {
                    pendingCount++;
                } else if (status === 'en progreso') {
                    activeCount++;
                }

                // Sumar monto si está disponible
                const amount = Number(job.budget || job.costo || job.total || job.amount) || 0;
                monthlyEarnings += amount;
            });

            const pendingJobsEl = document.getElementById('pendingJobsCount');
            if (pendingJobsEl) {
                pendingJobsEl.textContent = pendingCount + activeCount;
            }

            // Renderizar trabajos recientes en el dashboard
            renderRecentJobs(jobsList);
        }, (error) => {
            console.warn("Fallo al escuchar Trabajos en dashboard:", error);
        });

        // 2. Contar clientes registrados
        const clientesRef = collection(db, "Clientes");
        onSnapshot(clientesRef, (clientSnap) => {
            const totalClientsEl = document.getElementById('totalClientsCount');
            if (totalClientsEl) {
                totalClientsEl.textContent = clientSnap.size;
            }
        }, (err) => {
            console.warn("Fallo al contar Clientes:", err);
        });
    } catch (error) {
        console.warn("Error calculando resumen del dashboard:", error);
    }
}

// Renderizar trabajos recientes
function renderRecentJobs(jobs) {
    const container = document.getElementById('recentJobsContainer');
    if (!container) return;

    if (!jobs || jobs.length === 0) return;

    // Ordenar por fecha reciente
    const sorted = [...jobs].sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
    });

    const recent = sorted.slice(0, 3);
    container.innerHTML = '';

    recent.forEach(job => {
        const date = job.createdAt?.toDate ? job.createdAt.toDate() : new Date(job.createdAt || Date.now());
        const dateStr = isNaN(date) ? 'Reciente' : date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        const clientName = job.client?.name || job.clientName || 'Cliente Particular';
        const vehicleUnit = job.vehicle?.unit || job.unit || 'Vehículo';
        const service = job.workDetails?.diagnosis || job.service || 'Servicio General';
        const mechanic = job.mechanic || 'Asignado';
        const amount = job.budget ? `$${Number(job.budget).toLocaleString()}` : '$1,250';

        const card = document.createElement('div');
        card.className = 'job-card';
        card.innerHTML = `
            <div class="job-header">
                <span class="job-id">#${job.id.substring(0, 8)}</span>
                <span class="job-date">${dateStr}</span>
            </div>
            <div class="job-info">
                <h3 class="job-client">${escapeHtml(clientName)}</h3>
                <div class="job-details">
                    <div class="job-detail">
                        <div class="detail-icon">
                            <i class="fas fa-truck"></i>
                        </div>
                        <div class="detail-text">
                            <div class="detail-title">Unidad</div>
                            <div class="detail-value">${escapeHtml(vehicleUnit)}</div>
                        </div>
                    </div>
                    <div class="job-detail">
                        <div class="detail-icon">
                            <i class="fas fa-tools"></i>
                        </div>
                        <div class="detail-text">
                            <div class="detail-title">Servicio</div>
                            <div class="detail-value">${escapeHtml(service.length > 30 ? service.substring(0, 30) + '...' : service)}</div>
                        </div>
                    </div>
                    <div class="job-detail">
                        <div class="detail-icon">
                            <i class="fas fa-user-cog"></i>
                        </div>
                        <div class="detail-text">
                            <div class="detail-title">Mecánico</div>
                            <div class="detail-value">${escapeHtml(mechanic)}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="job-footer">
                <div class="job-amount">${amount}</div>
                <div class="job-actions">
                    <a href="trabajos.html" class="action-btn" title="Ver trabajos" style="display:flex;align-items:center;justify-content:center;text-decoration:none;color:inherit;">
                        <i class="fas fa-eye"></i>
                    </a>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// Escucha en tiempo real de piezas con bajo stock
function setupLowStockListener() {
    const lowStockList = document.getElementById('lowStockList');
    const lowStockCount = document.getElementById('lowStockCount');
    const partsLoader = document.getElementById('partsLoader');

    if (!lowStockList) return;

    unsubscribeLowStock = onSnapshot(collection(db, "Piezas"), (querySnapshot) => {
        const lowStockParts = [];

        querySnapshot.forEach(docSnap => {
            const part = docSnap.data();
            const stock = Number(part.stock) || 0;
            const minStock = Number(part.minStock) || 5;

            if (stock < minStock) {
                let priority;
                if (stock <= minStock * 0.3) {
                    priority = 'high';
                } else if (stock <= minStock * 0.6) {
                    priority = 'medium';
                } else {
                    priority = 'low';
                }

                lowStockParts.push({
                    id: docSnap.id,
                    name: part.partName || part.nombre || "Sin nombre",
                    code: part.serialNumber || part.codigo || "Sin código",
                    stock: stock,
                    minStock: minStock,
                    priority: priority
                });
            }
        });

        lowStockParts.sort((a, b) => {
            const priorityOrder = { 'high': 1, 'medium': 2, 'low': 3 };
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            return a.stock - b.stock;
        });

        if (lowStockCount) {
            lowStockCount.textContent = lowStockParts.length;
        }

        lowStockList.innerHTML = '';
        const partsToShow = lowStockParts.slice(0, 5);

        if (partsToShow.length === 0) {
            lowStockList.innerHTML = `
                <li class="priority-item">
                    <div class="item-info">
                        <span class="item-title">No hay piezas por surtir</span>
                        <span class="item-detail">Todas las piezas tienen stock suficiente</span>
                    </div>
                </li>
            `;
        } else {
            partsToShow.forEach(part => {
                const li = document.createElement('li');
                li.className = 'priority-item';
                li.innerHTML = `
                    <div class="item-info">
                        <span class="item-title">${escapeHtml(part.name)}</span>
                        <span class="item-detail">Código: ${escapeHtml(part.code)} | Stock: ${part.stock} (Mín: ${part.minStock})</span>
                    </div>
                    <span class="item-value status-badge status-${part.priority}">
                        ${part.priority === 'high' ? 'Urgente' : part.priority === 'medium' ? 'Moderado' : 'Bajo'}
                    </span>
                `;
                lowStockList.appendChild(li);
            });
        }

        if (partsLoader) partsLoader.style.display = 'none';
    }, (error) => {
        console.error("Error al cargar piezas con bajo stock:", error);
        if (partsLoader) partsLoader.style.display = 'none';
    });
}

// Escucha en tiempo real de notificaciones
function setupNotificationsListener() {
    const notificationList = document.getElementById('notificationList');
    const notificationBadge = document.getElementById('notificationBadge');

    if (!notificationList) return;

    try {
        const notifRef = collection(db, "Notificaciones");
        unsubscribeNotifications = onSnapshot(notifRef, (snapshot) => {
            notifications = [];
            let unreadCount = 0;

            snapshot.forEach(docSnap => {
                const notif = { id: docSnap.id, ...docSnap.data() };
                notifications.push(notif);
                if (!notif.read) unreadCount++;
            });

            // Ordenar por timestamp
            notifications.sort((a, b) => {
                const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp || 0).getTime();
                const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp || 0).getTime();
                return timeB - timeA;
            });

            if (notificationBadge) {
                notificationBadge.textContent = unreadCount;
                notificationBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
            }

            renderNotificationsList();
        }, (error) => {
            console.warn("Fallo al consultar Notificaciones:", error);
        });
    } catch (err) {
        console.warn("Error configurando listener de notificaciones:", err);
    }
}

function renderNotificationsList() {
    const notificationList = document.getElementById('notificationList');
    if (!notificationList) return;

    notificationList.innerHTML = '';

    if (notifications.length === 0) {
        notificationList.innerHTML = `
            <li class="notification-item">
                <div class="notification-content">
                    <div class="notification-title">No hay notificaciones</div>
                </div>
            </li>
        `;
        return;
    }

    notifications.slice(0, 10).forEach(notif => {
        const li = document.createElement('li');
        li.className = `notification-item ${notif.read ? '' : 'unread'}`;

        let iconClass = notif.type || 'info';
        let iconMarkup = `<i class="fas fa-${notif.icon || 'info-circle'}"></i>`;

        let timeAgo = 'Reciente';
        if (notif.timestamp) {
            const date = notif.timestamp.toDate ? notif.timestamp.toDate() : new Date(notif.timestamp);
            const minutes = Math.floor((new Date() - date) / 60000);
            if (minutes < 1) timeAgo = 'Hace unos segundos';
            else if (minutes < 60) timeAgo = `Hace ${minutes} min`;
            else if (minutes < 1440) timeAgo = `Hace ${Math.floor(minutes/60)} h`;
            else timeAgo = `Hace ${Math.floor(minutes/1440)} d`;
        }

        li.innerHTML = `
            <div class="notification-icon ${iconClass}">
                ${iconMarkup}
            </div>
            <div class="notification-content">
                <div class="notification-title">${escapeHtml(notif.title || notif.message || 'Notificación')}</div>
                ${notif.title && notif.message ? `<div class="notification-desc">${escapeHtml(notif.message)}</div>` : ''}
                <div class="notification-time">${timeAgo}</div>
            </div>
        `;

        li.addEventListener('click', () => {
            if (!notif.read) {
                markNotificationAsRead(notif.id);
            }
        });

        notificationList.appendChild(li);
    });
}

async function markNotificationAsRead(notificationId) {
    try {
        const notifRef = doc(db, "Notificaciones", notificationId);
        await updateDoc(notifRef, { read: true });
    } catch (error) {
        console.error("Error al marcar notificación:", error);
    }
}

async function markAllNotificationsAsRead() {
    try {
        const unread = notifications.filter(n => !n.read);
        for (const n of unread) {
            const notifRef = doc(db, "Notificaciones", n.id);
            await updateDoc(notifRef, { read: true });
        }
    } catch (error) {
        console.error("Error al marcar todas las notificaciones:", error);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

window.addEventListener('beforeunload', () => {
    if (unsubscribeLowStock) unsubscribeLowStock();
    if (unsubscribeNotifications) unsubscribeNotifications();
    if (unsubscribeJobs) unsubscribeJobs();
});
