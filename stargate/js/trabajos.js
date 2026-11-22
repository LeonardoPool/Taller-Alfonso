// Gestión de Trabajos - Portal Administrativo (Stargate)
import { initAuthGuard } from './auth-guard.js';
import { initNotificationsManager } from './notifications-manager.js';
import { generateJobServiceReport } from './pdf-report-generator.js';
import { 
    db, 
    collection, 
    onSnapshot, 
    getDocs, 
    doc, 
    updateDoc, 
    serverTimestamp 
} from './firebase-config.js';

let jobsCache = [];
let currentJob = null;
let unsubscribeJobs = null;

// Elementos DOM
const jobsContainer = document.getElementById('jobsContainer');
const loader = document.getElementById('loader');
const emptyState = document.getElementById('emptyState');
const statusMessage = document.getElementById('statusMessage');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const showFilter = document.getElementById('showFilter');

// Modales
const detailModal = document.getElementById('detailModal');
const detailBody = document.getElementById('detailBody');
const updateModal = document.getElementById('updateModal');
const updateStatus = document.getElementById('updateStatus');
const updateMechanic = document.getElementById('updateMechanic');
const updateJobId = document.getElementById('updateJobId');
const saveJobUpdateBtn = document.getElementById('saveJobUpdateBtn');
const generatePdfBtn = document.getElementById('generatePdf');
const closeModalBtns = document.querySelectorAll('.close-modal');

function onReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

onReady(() => {
    initNotificationsManager();
    initAuthGuard(() => {
        loadMechanics();
        loadJobs();
        setupEventListeners();
    });
});

// Cargar lista de mecánicos para el selector del modal
async function loadMechanics() {
    try {
        const querySnapshot = await getDocs(collection(db, "colaboradores"));
        if (updateMechanic) {
            updateMechanic.innerHTML = '<option value="">-- Sin asignar --</option>';
            querySnapshot.forEach(docSnap => {
                const data = docSnap.data();
                const name = data.fullName || data.name;
                if (name) {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    updateMechanic.appendChild(opt);
                }
            });
        }
    } catch (err) {
        console.warn("Fallo cargando mecánicos para modal:", err);
    }
}

// Cargar y escuchar trabajos desde Firebase
function loadJobs() {
    try {
        if (loader) loader.style.display = 'block';
        if (jobsContainer) jobsContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'none';

        // Escucha en tiempo real sobre la colección Trabajos
        unsubscribeJobs = onSnapshot(collection(db, "Trabajos"), (snapshot) => {
            if (loader) loader.style.display = 'none';

            jobsCache = [];
            snapshot.forEach(docSnap => {
                jobsCache.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });

            // Ordenar por fecha de creación (más reciente primero)
            jobsCache.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                return dateB - dateA;
            });

            renderJobs(jobsCache);
        }, (error) => {
            console.error("Error al escuchar trabajos en tiempo real:", error);
            if (loader) loader.style.display = 'none';
            showStatus("Error al cargar trabajos: " + error.message, "error");
        });
    } catch (error) {
        console.error("Error en loadJobs:", error);
        if (loader) loader.style.display = 'none';
    }
}

// Renderizar trabajos agrupados por cliente
function renderJobs(jobs) {
    if (!jobsContainer) return;

    jobsContainer.innerHTML = '';

    // Filtrar por estado
    const statusVal = statusFilter ? statusFilter.value : 'all';
    let filteredJobs = jobs.filter(job => {
        if (statusVal === 'all') return true;
        const s = (job.status || '').toLowerCase();
        if (statusVal === 'open') return s.includes('abierto');
        if (statusVal === 'in-progress') return s.includes('progreso');
        if (statusVal === 'completed') return s.includes('complet') || s.includes('finaliz');
        if (statusVal === 'cancelled') return s.includes('cancel');
        return true;
    });

    // Filtrar por término de búsqueda
    const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (term) {
        filteredJobs = filteredJobs.filter(job => {
            const unit = (job.vehicle?.unit || '').toLowerCase();
            const client = (job.client?.name || '').toLowerCase();
            const company = (job.client?.company || '').toLowerCase();
            const plates = (job.vehicle?.plates || '').toLowerCase();
            const mechanic = (job.mechanic || '').toLowerCase();
            const id = (job.id || '').toLowerCase();
            return unit.includes(term) || client.includes(term) || company.includes(term) || 
                   plates.includes(term) || mechanic.includes(term) || id.includes(term);
        });
    }

    if (filteredJobs.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Agrupar por cliente
    const showVal = showFilter ? showFilter.value : 'all';
    const grouped = {};

    filteredJobs.forEach(job => {
        const clientName = job.client?.name || 'Cliente Particular';
        if (!grouped[clientName]) {
            grouped[clientName] = {
                company: job.client?.company || 'Particular',
                jobs: []
            };
        }
        grouped[clientName].jobs.push(job);
    });

    // Crear elementos DOM de grupos de clientes
    Object.keys(grouped).forEach(clientName => {
        const group = grouped[clientName];

        const clientGroupEl = document.createElement('div');
        clientGroupEl.className = 'client-group';

        const clientHeader = document.createElement('div');
        clientHeader.className = 'client-header';
        clientHeader.innerHTML = `
            <div class="client-info">
                <div class="client-name">${escapeHtml(clientName)}</div>
                <div class="client-company">${escapeHtml(group.company)}</div>
            </div>
            <div class="client-stats">
                <div class="client-stat">
                    <span class="client-stat-value">${group.jobs.length}</span>
                    <span class="client-stat-label">Trabajos</span>
                </div>
            </div>
        `;
        clientGroupEl.appendChild(clientHeader);

        const jobsGrid = document.createElement('div');
        jobsGrid.className = 'jobs-grid';

        const jobsToShow = showVal === 'recent' ? group.jobs.slice(0, 3) : group.jobs;
        jobsToShow.forEach(job => {
            const jobCard = createJobCard(job);
            jobsGrid.appendChild(jobCard);
        });

        clientGroupEl.appendChild(jobsGrid);
        jobsContainer.appendChild(clientGroupEl);
    });
}

// Obtener la imagen más representativa del trabajo de cualquier categoría
function getMainJobImage(job) {
    if (!job || !job.photos) return '';

    if (Array.isArray(job.photos) && job.photos.length > 0) {
        const first = job.photos[0];
        return typeof first === 'string' ? first : (first?.url || '');
    }

    if (typeof job.photos === 'object') {
        const preferredKeys = ['front', 'exterior', 'right', 'left', 'rear', 'engine', 'interior', 'antes'];
        for (const key of preferredKeys) {
            const val = job.photos[key];
            if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') {
                return val[0];
            } else if (typeof val === 'string' && val.startsWith('http')) {
                return val;
            }
        }

        for (const key in job.photos) {
            const val = job.photos[key];
            if (Array.isArray(val) && val.length > 0) {
                const item = val[0];
                const url = typeof item === 'string' ? item : item?.url;
                if (url && url.startsWith('http')) return url;
            } else if (typeof val === 'string' && val.startsWith('http')) {
                return val;
            }
        }
    }

    return '';
}

// Crear tarjeta de trabajo con diseño original
function createJobCard(job) {
    const card = document.createElement('div');
    card.className = 'job-card';

    const date = job.createdAt?.toDate ? job.createdAt.toDate() : new Date(job.createdAt || Date.now());
    const formattedDate = isNaN(date) ? 'Fecha no disp.' : date.toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const mainImage = getMainJobImage(job);

    let statusClass = 'status-open';
    const st = (job.status || '').toLowerCase();
    if (st.includes('progreso')) statusClass = 'status-in-progress';
    else if (st.includes('complet')) statusClass = 'status-completed';
    else if (st.includes('cancel')) statusClass = 'status-cancelled';

    card.innerHTML = `
        <div class="job-status ${statusClass}">${escapeHtml(job.status || 'Trabajo abierto')}</div>
        <div class="job-image">
            ${mainImage ? 
                `<img src="${mainImage}" alt="${escapeHtml(job.vehicle?.unit || 'Unidad')}" loading="lazy" decoding="async" class="job-thumbnail" onerror="this.parentElement.innerHTML='<div class=\\'default-job-image\\'><i class=\\'fas fa-car\\'></i></div>'">` : 
                `<div class="default-job-image"><i class="fas fa-car"></i></div>`
            }
        </div>
        <div class="job-info">
            <div class="job-title">
                ${escapeHtml(job.vehicle?.unit || 'Unidad')}
                <span class="job-id">ID: ${job.id.substring(0, 8)}</span>
            </div>
            <div class="job-details">
                <div class="detail-item">
                    <div class="detail-label">Motor</div>
                    <div class="detail-value">
                        <i class="fas fa-cogs"></i> ${escapeHtml(job.vehicle?.engineNumber || 'N/A')}
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Placas</div>
                    <div class="detail-value">
                        <i class="fas fa-id-card"></i> ${escapeHtml(job.vehicle?.plates || 'N/A')}
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Mecánico</div>
                    <div class="detail-value">
                        <i class="fas fa-user-cog"></i> ${escapeHtml(job.mechanic || 'Sin asignar')}
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Chofer</div>
                    <div class="detail-value">
                        <i class="fas fa-user"></i> ${escapeHtml(job.workDetails?.driverName || 'N/A')}
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Diagnóstico</div>
                    <div class="detail-value">
                        <i class="fas fa-stethoscope"></i> ${escapeHtml((job.workDetails?.diagnosis || '').length > 40 ? (job.workDetails.diagnosis.substring(0, 40) + '...') : (job.workDetails?.diagnosis || 'N/A'))}
                    </div>
                </div>
            </div>
        </div>
        <div class="job-footer">
            <div class="job-date">
                <i class="fas fa-calendar-alt"></i> ${formattedDate}
            </div>
            <div class="job-actions">
                <button class="job-btn detail-btn" data-id="${job.id}" title="Ver detalles">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="job-btn edit-btn" data-id="${job.id}" title="Actualizar estado">
                    <i class="fas fa-edit"></i>
                </button>
            </div>
        </div>
    `;

    return card;
}

// Configurar escuchas de eventos
function setupEventListeners() {
    if (statusFilter) statusFilter.addEventListener('change', () => renderJobs(jobsCache));
    if (showFilter) showFilter.addEventListener('change', () => renderJobs(jobsCache));
    if (searchInput) searchInput.addEventListener('input', () => renderJobs(jobsCache));

    // Delegación de eventos para botones de tarjetas
    document.addEventListener('click', (e) => {
        const detailBtn = e.target.closest('.detail-btn');
        if (detailBtn) {
            const jobId = detailBtn.dataset.id;
            openDetailModal(jobId);
            return;
        }

        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            const jobId = editBtn.dataset.id;
            openUpdateModal(jobId);
            return;
        }
    });

    // Guardar actualización de trabajo
    if (saveJobUpdateBtn) {
        saveJobUpdateBtn.addEventListener('click', handleSaveJobUpdate);
    }

    // Generar PDF
    if (generatePdfBtn) {
        generatePdfBtn.addEventListener('click', handleGeneratePdf);
    }

    // Cerrar modales
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (updateModal) updateModal.classList.remove('active');
            if (detailModal) detailModal.classList.remove('active');
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target === updateModal) updateModal.classList.remove('active');
        if (e.target === detailModal) detailModal.classList.remove('active');
    });
}

// Renderizar la galería de fotos exactamente como en el diseño original
function renderPhotoGallery(photos) {
    if (!photos) return '<p style="color:#7f8c8d;margin:10px 0;">No hay fotos disponibles para este trabajo</p>';

    let galleryHTML = '';
    const categories = {
        front: 'Frente Delantero',
        right: 'Lateral Derecho',
        engine: 'Motor',
        exterior: 'Exterior',
        rear: 'Frente Trasero',
        left: 'Lateral Izquierdo',
        interior: 'Interior',
        plate: 'Placas',
        mirror: 'Espejos',
        rearview: 'Retrovisores',
        damage: 'Inspección de Daños',
        antes: 'Antes',
        despues: 'Después'
    };

    if (Array.isArray(photos)) {
        if (photos.length === 0) return '<p style="color:#7f8c8d;margin:10px 0;">No hay fotos disponibles para este trabajo</p>';
        galleryHTML += '<div class="gallery-category">Fotos</div><div class="image-gallery">';
        photos.forEach(photo => {
            const url = typeof photo === 'string' ? photo : (photo?.url || '');
            if (url) {
                galleryHTML += `
                    <div class="gallery-item">
                        <img src="${url}" alt="Foto del trabajo" loading="lazy" decoding="async">
                    </div>
                `;
            }
        });
        galleryHTML += '</div>';
        return galleryHTML;
    }

    if (typeof photos === 'object') {
        const categoryOrder = ['front', 'right', 'engine', 'exterior', 'rear', 'left', 'interior', 'plate', 'mirror', 'rearview', 'damage', 'antes', 'despues'];
        const allKeys = Object.keys(photos);

        const sortedKeys = [
            ...categoryOrder.filter(k => allKeys.includes(k)),
            ...allKeys.filter(k => !categoryOrder.includes(k))
        ];

        for (const category of sortedKeys) {
            const list = photos[category];
            const urls = Array.isArray(list) ? list : (typeof list === 'string' && list.startsWith('http') ? [list] : []);

            if (urls.length > 0) {
                const title = categories[category.toLowerCase()] || (category.charAt(0).toUpperCase() + category.slice(1));
                galleryHTML += `<div class="gallery-category">${title}</div>`;
                galleryHTML += '<div class="image-gallery">';
                urls.forEach(photo => {
                    galleryHTML += `
                        <div class="gallery-item">
                            <img src="${photo}" alt="${title}" loading="lazy" decoding="async">
                        </div>
                    `;
                });
                galleryHTML += '</div>';
            }
        }
    }

    return galleryHTML || '<p style="color:#7f8c8d;margin:10px 0;">No hay fotos disponibles para este trabajo</p>';
}

// Formateo inteligente de tiempos en Años, Meses, Semanas, Días, Horas, Minutos, Segundos
function formatSmartDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds < 0) totalSeconds = 0;
    const SECONDS_IN_MINUTE = 60;
    const SECONDS_IN_HOUR = 3600;
    const SECONDS_IN_DAY = 86400;
    const SECONDS_IN_WEEK = 604800;
    const SECONDS_IN_MONTH = 2592000;
    const SECONDS_IN_YEAR = 31536000;

    let rem = Math.floor(totalSeconds);
    const years = Math.floor(rem / SECONDS_IN_YEAR); rem %= SECONDS_IN_YEAR;
    const months = Math.floor(rem / SECONDS_IN_MONTH); rem %= SECONDS_IN_MONTH;
    const weeks = Math.floor(rem / SECONDS_IN_WEEK); rem %= SECONDS_IN_WEEK;
    const days = Math.floor(rem / SECONDS_IN_DAY); rem %= SECONDS_IN_DAY;
    const hours = Math.floor(rem / SECONDS_IN_HOUR); rem %= SECONDS_IN_HOUR;
    const minutes = Math.floor(rem / SECONDS_IN_MINUTE);
    const seconds = rem % SECONDS_IN_MINUTE;

    const parts = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
    if (weeks > 0) parts.push(`${weeks} ${weeks === 1 ? 'sem' : 'sem'}`);
    if (days > 0) parts.push(`${days} ${days === 1 ? 'día' : 'días'}`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 && years === 0 && months === 0) parts.push(`${minutes}m`);

    if (parts.length === 0) return `${seconds}s`;
    return parts.slice(0, 3).join(' ');
}

function getJobTimeBreakdown(job) {
    if (!job) return { activeSeconds: 0, pausedPartsSeconds: 0, pausedExitSeconds: 0, totalTurnaroundSeconds: 0 };
    let active = Number(job.activeTimeSeconds || job.totalTimeSeconds || 0);
    let pausedParts = Number(job.pausedPartsSeconds || 0);
    let pausedExit = Number(job.pausedExitSeconds || 0);

    const s = String(job.status || '').toLowerCase();
    const isWorking = s === 'trabajando' || s.includes('progreso');
    const isPausedParts = s.includes('refacc');
    const isPausedExit = s.includes('salida');
    const isFinished = s.includes('complet') || s.includes('finaliz');

    if (job.startTime && !isFinished) {
        const lastRef = job.lastStatusChange || job.startTime;
        const lastDate = lastRef?.toDate ? lastRef.toDate() : new Date(lastRef);
        const delta = Math.max(0, Math.floor((Date.now() - lastDate.getTime()) / 1000));
        if (isWorking) active += delta;
        else if (isPausedParts) pausedParts += delta;
        else if (isPausedExit) pausedExit += delta;
    }

    let totalTurnaround = 0;
    if (job.startTime) {
        const start = job.startTime?.toDate ? job.startTime.toDate() : new Date(job.startTime);
        const end = isFinished && job.endTime ? (job.endTime?.toDate ? job.endTime.toDate() : new Date(job.endTime)) : new Date();
        totalTurnaround = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    }

    return { activeSeconds: active, pausedPartsSeconds: pausedParts, pausedExitSeconds: pausedExit, totalTurnaroundSeconds: totalTurnaround };
}

// Abrir modal de detalles con el diseño exacto original y las fotos
function openDetailModal(jobId) {
    const job = jobsCache.find(j => j.id === jobId);
    if (!job || !detailModal || !detailBody) return;

    currentJob = job;

    const date = job.createdAt?.toDate ? job.createdAt.toDate() : new Date(job.createdAt || Date.now());
    const formattedDate = isNaN(date) ? 'No disponible' : date.toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    let statusClass = 'status-open';
    const st = (job.status || '').toLowerCase();
    if (st.includes('progreso')) statusClass = 'status-in-progress';
    else if (st.includes('complet')) statusClass = 'status-completed';
    else if (st.includes('cancel')) statusClass = 'status-cancelled';

    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = `Detalles del Trabajo: ${job.vehicle?.unit || 'Unidad'}`;

    const usedParts = Array.isArray(job.workDetails?.usedParts) ? job.workDetails.usedParts : 
                     (Array.isArray(job.usedParts) ? job.usedParts : []);

    detailBody.innerHTML = `
        <div class="job-detail-grid">
            <div class="detail-section">
                <h3 class="detail-section-title"><i class="fas fa-user"></i> Información del Cliente</h3>
                <div class="detail-item">
                    <span class="detail-label">NOMBRE:</span>
                    <span class="detail-value">${escapeHtml(job.client?.name || 'N/A')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">EMPRESA:</span>
                    <span class="detail-value">${escapeHtml(job.client?.company || 'Particular')}</span>
                </div>
            </div>

            <div class="detail-section">
                <h3 class="detail-section-title"><i class="fas fa-car"></i> Información del Vehículo</h3>
                <div class="detail-item">
                    <span class="detail-label">UNIDAD:</span>
                    <span class="detail-value">${escapeHtml(job.vehicle?.unit || 'N/A')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">MOTOR:</span>
                    <span class="detail-value">${escapeHtml(job.vehicle?.engineNumber || 'Na')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">PLACAS:</span>
                    <span class="detail-value">${escapeHtml(job.vehicle?.plates || 'N/A')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">NIVEL DIESEL:</span>
                    <span class="detail-value">${escapeHtml(job.vehicle?.dieselLevel || '1/2')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">ESTADO LLANTAS:</span>
                    <span class="detail-value">${escapeHtml(job.vehicle?.tireCondition || 'Normal')}</span>
                </div>
            </div>

            <div class="detail-section">
                <h3 class="detail-section-title"><i class="fas fa-tools"></i> Detalles del Trabajo</h3>
                <div class="detail-item">
                    <span class="detail-label">ESTADO:</span>
                    <span class="detail-value"><span class="job-status ${statusClass}">${escapeHtml(job.status || 'Trabajo abierto')}</span></span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">FECHA DE CREACIÓN:</span>
                    <span class="detail-value">${formattedDate}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">CHOFER:</span>
                    <span class="detail-value">${escapeHtml(job.workDetails?.driverName || 'Na')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">REFACCIÓN:</span>
                    <span class="detail-value">${job.workDetails?.hasSpare === 'si' ? 'Sí' : 'No'}</span>
                </div>
            </div>

            ${(() => {
                const tb = getJobTimeBreakdown(job);
                return `
                    <div class="detail-section" style="grid-column: span 2;">
                        <h3 class="detail-section-title"><i class="fas fa-stopwatch"></i> Control y Justificación de Tiempos</h3>
                        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-top:10px;">
                            <div style="background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #cbd5e1;">
                                <div style="font-size:0.68rem;color:#64748b;font-weight:700;text-transform:uppercase;">Tiempo Total en Taller</div>
                                <div style="font-size:1.05rem;font-weight:800;color:#0f172a;margin-top:2px;">${formatSmartDuration(tb.totalTurnaroundSeconds)}</div>
                                <div style="font-size:0.65rem;color:#94a3b8;">Lead time hasta salida</div>
                            </div>
                            <div style="background:#f0f9ff;padding:10px;border-radius:8px;border:1px solid #38bdf8;">
                                <div style="font-size:0.68rem;color:#0284c7;font-weight:700;text-transform:uppercase;">Mano de Obra Activa</div>
                                <div style="font-size:1.05rem;font-weight:800;color:#0284c7;margin-top:2px;">${formatSmartDuration(tb.activeSeconds)}</div>
                                <div style="font-size:0.65rem;color:#0369a1;">Tiempo efectivo trabajado</div>
                            </div>
                            <div style="background:#fffbeb;padding:10px;border-radius:8px;border:1px solid #f59e0b;">
                                <div style="font-size:0.68rem;color:#d97706;font-weight:700;text-transform:uppercase;">Pausa por Refacción</div>
                                <div style="font-size:1.05rem;font-weight:800;color:#d97706;margin-top:2px;">${formatSmartDuration(tb.pausedPartsSeconds)}</div>
                                <div style="font-size:0.65rem;color:#b45309;">Justificación de espera de piezas</div>
                            </div>
                            <div style="background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #94a3b8;">
                                <div style="font-size:0.68rem;color:#475569;font-weight:700;text-transform:uppercase;">Pausa por Salida</div>
                                <div style="font-size:1.05rem;font-weight:800;color:#475569;margin-top:2px;">${formatSmartDuration(tb.pausedExitSeconds)}</div>
                                <div style="font-size:0.65rem;color:#64748b;">Fuera de horario laboral</div>
                            </div>
                        </div>
                    </div>
                `;
            })()}

            <div class="detail-section">
                <h3 class="detail-section-title"><i class="fas fa-stethoscope"></i> Diagnóstico</h3>
                <div class="detail-item" style="flex-direction:column;align-items:flex-start;">
                    <span class="detail-value" style="line-height:1.6;">${escapeHtml(job.workDetails?.diagnosis || 'No registrado')}</span>
                </div>
            </div>

            <div class="detail-section">
                <h3 class="detail-section-title"><i class="fas fa-clipboard-list"></i> Piezas Utilizadas</h3>
                ${usedParts.length > 0 ? `
                    <table style="width:100%; border-collapse: collapse; margin-top:10px;">
                        <thead>
                            <tr>
                                <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">Pieza</th>
                                <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">Serial</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usedParts.map(part => `
                                <tr>
                                    <td style="padding:8px; border-bottom:1px solid #eee;font-weight:500;">${escapeHtml(part?.name || part?.partName || 'Pieza')}</td>
                                    <td style="padding:8px; border-bottom:1px solid #eee;">${escapeHtml(part?.serial || part?.serialNumber || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : `
                    <div class="detail-item">No se utilizaron piezas del almacén</div>
                `}
            </div>

            <div class="detail-section">
                <h3 class="detail-section-title"><i class="fas fa-box-open"></i> Piezas Externas</h3>
                <div class="detail-item" style="flex-direction:column;align-items:flex-start;">
                    <span class="detail-value">${escapeHtml(job.workDetails?.outsideParts || 'No se registraron piezas externas')}</span>
                </div>
            </div>
        </div>

        <h3 class="detail-section-title"><i class="fas fa-camera"></i> Fotos del Trabajo</h3>
        ${renderPhotoGallery(job.photos)}
    `;

    detailModal.classList.add('active');
}

// Abrir modal de actualización
function openUpdateModal(jobId) {
    const job = jobsCache.find(j => j.id === jobId);
    if (!job || !updateModal) return;

    if (updateJobId) updateJobId.value = jobId;
    if (updateStatus) updateStatus.value = job.status || 'Trabajo abierto';
    if (updateMechanic) updateMechanic.value = job.mechanic || '';

    updateModal.classList.add('active');
}

// Guardar cambios del modal de actualización
async function handleSaveJobUpdate() {
    const jobId = updateJobId ? updateJobId.value : null;
    if (!jobId) return;

    const newStatus = updateStatus ? updateStatus.value : 'Trabajo abierto';
    const newMechanic = updateMechanic ? updateMechanic.value : '';

    try {
        saveJobUpdateBtn.disabled = true;
        saveJobUpdateBtn.textContent = 'Guardando...';

        const jobRef = doc(db, "Trabajos", jobId);
        await updateDoc(jobRef, {
            status: newStatus,
            mechanic: newMechanic,
            updatedAt: serverTimestamp()
        });

        updateModal.classList.remove('active');
        showStatus('Trabajo actualizado exitosamente', 'success');
    } catch (error) {
        console.error("Error actualizando trabajo:", error);
        alert(`Error al guardar cambios: ${error.message}`);
    } finally {
        saveJobUpdateBtn.disabled = false;
        saveJobUpdateBtn.textContent = 'Guardar Cambios';
    }
}

// Generador de reporte PDF oficial con logo y datos originales
async function handleGeneratePdf() {
    if (!currentJob) return;

    try {
        generatePdfBtn.disabled = true;
        generatePdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';

        await generateJobServiceReport(currentJob);
    } catch (err) {
        console.error("Error al generar PDF:", err);
        alert("Ocurrió un error al generar el PDF: " + err.message);
    } finally {
        generatePdfBtn.disabled = false;
        generatePdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Generar Reporte PDF';
    }
}

function showStatus(message, type) {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 4000);
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
    if (unsubscribeJobs) unsubscribeJobs();
});
