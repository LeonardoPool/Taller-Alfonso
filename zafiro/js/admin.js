// Panel de Trabajos para Mecánicos - Portal Mecánicos (Zafiro)
import { checkMechanicAuth } from './auth-guard.js';
import { 
    db, 
    collection, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    getDocs, 
    doc, 
    updateDoc, 
    serverTimestamp 
} from './firebase-config.js';
import { enqueueOfflineOperation } from './pwa-manager.js';

let currentMechanic = null;
let jobsCache = [];
let currentJobId = null;
let timers = {};
let unsubscribeJobs = null;
let modalParts = [];
let usedParts = [];
let selectedParts = [];
let partsSearchTimeout = null;
let selectedStatus = null;

const JOB_STATUS = {
    WORKING: 'trabajando',
    PAUSED_PARTS: 'detenido_refaccion',
    PAUSED_EXIT: 'detenido_salida',
    FINISHED: 'finalizado'
};

const fieldTranslations = {
    unit: 'Unidad',
    engineNumber: 'Número de motor',
    plates: 'Placas',
    brand: 'Marca',
    model: 'Modelo',
    year: 'Año',
    color: 'Color',
    vin: 'VIN',
    mileage: 'Kilometraje',
    driverName: 'Nombre del chofer',
    driverPhone: 'Teléfono del chofer',
    driverCompany: 'Empresa del chofer',
    diagnosis: 'Diagnóstico',
    service: 'Servicio',
    additionalNotes: 'Notas adicionales'
};

// Referencias a elementos DOM
const jobsContainer = document.getElementById('jobsContainer');
const loader = document.getElementById('loader');
const emptyState = document.getElementById('emptyState');
const statusFilter = document.getElementById('statusFilter');
const sortFilter = document.getElementById('sortFilter');
const searchInput = document.getElementById('searchInput');
const statusMessage = document.getElementById('statusMessage');

// Modales
const detailModal = document.getElementById('detailModal');
const detailBody = document.getElementById('detailBody');
const statusModal = document.getElementById('statusModal');
const statusModalTitle = document.getElementById('statusModalTitle');
const statusModalSubtitle = document.getElementById('statusModalSubtitle');
const cancelStatusUpdate = document.getElementById('cancelStatusUpdate');
const confirmStatusUpdate = document.getElementById('confirmStatusUpdate');
const statusOptions = document.querySelectorAll('.status-option');

const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const saveEditBtn = document.getElementById('saveEditBtn');

const partsModal = document.getElementById('partsModal');
const modalSearchInput = document.getElementById('modalSearchInput');
const partsListContainer = document.getElementById('partsListContainer');
const selectedPartsContainer = document.getElementById('selectedPartsContainer');
const confirmPartsSelection = document.getElementById('confirmPartsSelection');

const closeModalBtns = document.querySelectorAll('.close-modal');
const logoutBtn = document.getElementById('logoutBtn');

function onReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

onReady(async () => {
    currentMechanic = await checkMechanicAuth();
    if (!currentMechanic) return;

    // Actualizar bienvenida
    const welcomeTitle = document.getElementById('welcomeTitle');
    const welcomeSubtitle = document.getElementById('welcomeSubtitle');
    const userProfile = document.getElementById('userProfile');

    if (welcomeTitle) welcomeTitle.textContent = `Bienvenido, ${currentMechanic.fullName}`;
    if (welcomeSubtitle) welcomeSubtitle.textContent = "Administra tus trabajos asignados";
    if (userProfile) userProfile.textContent = (currentMechanic.fullName || 'M').charAt(0).toUpperCase();

    loadJobs();
    setupEventListeners();
});

// Cargar trabajos asignados al mecánico
function loadJobs() {
    if (!currentMechanic) return;
    if (loader) loader.style.display = 'block';
    if (jobsContainer) jobsContainer.innerHTML = '';
    if (emptyState) emptyState.style.display = 'none';

    // Limpiar timers
    for (let timerId in timers) {
        clearInterval(timers[timerId]);
    }
    timers = {};

    let q;
    if (currentMechanic.isAdmin) {
        q = collection(db, "Trabajos");
    } else {
        q = query(collection(db, "Trabajos"), where("mechanic", "==", currentMechanic.fullName));
    }

    unsubscribeJobs = onSnapshot(q, (snapshot) => {
        jobsCache = [];

        if (snapshot.empty) {
            if (emptyState) emptyState.style.display = 'block';
            if (loader) loader.style.display = 'none';
            renderJobs([]);
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            jobsCache.push({ id: docSnap.id, ...data });
        });

        // Ordenar en memoria
        jobsCache.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
        });

        if (loader) loader.style.display = 'none';
        renderJobs(jobsCache);
    }, (error) => {
        console.error("Error al escuchar Trabajos:", error);
        if (statusMessage) {
            statusMessage.textContent = `Error al cargar trabajos: ${error.message}`;
            statusMessage.className = 'status-message error';
            statusMessage.style.display = 'block';
        }
        if (loader) loader.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
    });
}

// Renderizar lista de trabajos
function renderJobs(jobs) {
    if (!jobsContainer) return;
    let filtered = [...jobs];

    // Filtro por estado
    if (statusFilter && statusFilter.value !== 'all') {
        const val = statusFilter.value;
        filtered = filtered.filter(job => {
            if (val === 'trabajando') return job.status === JOB_STATUS.WORKING;
            if (val === 'detenido_refaccion') return job.status === JOB_STATUS.PAUSED_PARTS;
            if (val === 'detenido_salida') return job.status === JOB_STATUS.PAUSED_EXIT;
            if (val === 'finalizado') return job.status === JOB_STATUS.FINISHED;
            return true;
        });
    }

    // Ordenamiento
    if (sortFilter) {
        if (sortFilter.value === 'newest') {
            filtered.sort((a, b) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
                return timeB - timeA;
            });
        } else {
            filtered.sort((a, b) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
                return timeA - timeB;
            });
        }
    }

    // Filtro de búsqueda
    if (searchInput && searchInput.value.trim() !== '') {
        const term = searchInput.value.toLowerCase().trim();
        filtered = filtered.filter(job => {
            const unit = (job.vehicle?.unit || '').toLowerCase();
            const plates = (job.vehicle?.plates || '').toLowerCase();
            const client = (job.client?.name || job.clientName || '').toLowerCase();
            const id = (job.id || '').toLowerCase();
            return unit.includes(term) || plates.includes(term) || client.includes(term) || id.includes(term);
        });
    }

    jobsContainer.innerHTML = '';

    if (filtered.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const jobsGrid = document.createElement('div');
    jobsGrid.className = 'jobs-grid';
    jobsContainer.appendChild(jobsGrid);

    filtered.forEach((job) => {
        const card = createJobCard(job);
        jobsGrid.appendChild(card);

        if (job.status === JOB_STATUS.WORKING) {
            startTimer(job.id, job);
        }
    });
}

// Crear tarjeta de trabajo
function createJobCard(job) {
    const card = document.createElement('div');
    card.className = 'job-card';

    const date = job.createdAt?.toDate ? job.createdAt.toDate() : new Date(job.createdAt || Date.now());
    const formattedDate = isNaN(date) ? 'Fecha no disp.' : date.toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });

    let statusClass, statusText;
    switch (job.status) {
        case JOB_STATUS.WORKING:
            statusClass = 'status-in-progress';
            statusText = 'Trabajando';
            break;
        case JOB_STATUS.PAUSED_PARTS:
            statusClass = 'status-paused';
            statusText = 'Detenido (refacción)';
            break;
        case JOB_STATUS.PAUSED_EXIT:
            statusClass = 'status-stopped';
            statusText = 'Detenido (salida)';
            break;
        case JOB_STATUS.FINISHED:
            statusClass = 'status-completed';
            statusText = 'Finalizado';
            break;
        default:
            statusClass = 'status-open';
            statusText = job.status || 'Abierto';
    }

    let diagnosisText = job.workDetails?.diagnosis || 'Sin diagnóstico';
    if (typeof diagnosisText === 'object') {
        diagnosisText = diagnosisText.text || JSON.stringify(diagnosisText);
    }
    diagnosisText = diagnosisText.length > 40 ? diagnosisText.substring(0, 40) + '...' : diagnosisText;

    card.innerHTML = `
        <div class="job-status ${statusClass}">${escapeHtml(statusText)}</div>
        <div class="job-image">
            <div class="default-job-image"><i class="fas fa-car"></i></div>
        </div>
        <div class="job-info">
            <div class="job-title">
                ${escapeHtml(job.vehicle?.unit || 'Unidad')}
                <span class="job-id">ID: ${job.id.substring(0, 8)}</span>
            </div>
            <div class="job-details">
                <div class="detail-item">
                    <div class="detail-label">Motor</div>
                    <div class="detail-value"><i class="fas fa-cogs"></i> ${escapeHtml(job.vehicle?.engineNumber || 'N/A')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Placas</div>
                    <div class="detail-value"><i class="fas fa-id-card"></i> ${escapeHtml(job.vehicle?.plates || 'N/A')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Chofer</div>
                    <div class="detail-value"><i class="fas fa-user"></i> ${escapeHtml(job.workDetails?.driverName || 'N/A')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Diagnóstico</div>
                    <div class="detail-value"><i class="fas fa-stethoscope"></i> ${escapeHtml(diagnosisText)}</div>
                </div>
            </div>
            <div class="job-timer" id="timer-${job.id}">
                <i class="fas fa-stopwatch"></i>
                <span>${formatElapsedTime(job)}</span>
            </div>
        </div>
        <div class="job-footer">
            <div class="job-date"><i class="fas fa-calendar-alt"></i> ${formattedDate}</div>
            <div class="job-actions">
                <button class="job-btn detail-btn" data-id="${job.id}" title="Ver detalles"><i class="fas fa-eye"></i></button>
                <button class="job-btn status-btn" data-id="${job.id}" title="Cambiar estado"><i class="fas fa-exchange-alt"></i></button>
                <button class="job-btn edit-btn" data-id="${job.id}" title="Editar trabajo"><i class="fas fa-edit"></i></button>
            </div>
        </div>
    `;

    return card;
}

// Formatear tiempo transcurrido
function formatElapsedTime(job) {
    if (!job.startTime) return '00:00:00';

    const start = job.startTime.toDate ? job.startTime.toDate() : new Date(job.startTime);
    const now = new Date();
    let elapsed = Math.floor((now - start) / 1000);

    const paused = job.totalPausedDuration || 0;
    elapsed = Math.max(0, elapsed - paused);

    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Iniciar timer en vivo
function startTimer(jobId, job) {
    if (timers[jobId]) clearInterval(timers[jobId]);

    timers[jobId] = setInterval(() => {
        const j = jobsCache.find(x => x.id === jobId);
        if (j && j.status === JOB_STATUS.WORKING) {
            const el = document.querySelector(`#timer-${jobId} span`);
            if (el) el.textContent = formatElapsedTime(j);
        } else {
            clearInterval(timers[jobId]);
        }
    }, 1000);
}

// Configurar escuchas de eventos
function setupEventListeners() {
    if (statusFilter) statusFilter.addEventListener('change', () => renderJobs(jobsCache));
    if (sortFilter) sortFilter.addEventListener('change', () => renderJobs(jobsCache));
    if (searchInput) searchInput.addEventListener('input', () => renderJobs(jobsCache));

    // Delegación de eventos en botones de tarjetas
    document.addEventListener('click', (e) => {
        const detailBtn = e.target.closest('.detail-btn');
        if (detailBtn) {
            const jobId = detailBtn.dataset.id;
            openDetailModal(jobId);
            return;
        }

        const statusBtn = e.target.closest('.status-btn');
        if (statusBtn) {
            const jobId = statusBtn.dataset.id;
            openStatusModal(jobId);
            return;
        }

        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            const jobId = editBtn.dataset.id;
            openEditModal(jobId);
            return;
        }
    });

    // Opciones de estado en statusModal
    statusOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            statusOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            selectedStatus = opt.dataset.status;
        });
    });

    // Confirmar cambio de estado
    if (confirmStatusUpdate) {
        confirmStatusUpdate.addEventListener('click', handleConfirmStatusUpdate);
    }
    if (cancelStatusUpdate) {
        cancelStatusUpdate.addEventListener('click', () => {
            if (statusModal) statusModal.classList.remove('active');
        });
    }

    // Modal de piezas
    if (modalSearchInput) {
        modalSearchInput.addEventListener('input', () => {
            clearTimeout(partsSearchTimeout);
            partsSearchTimeout = setTimeout(() => {
                fetchParts(modalSearchInput.value.trim()).then(parts => {
                    displayPartsInModal(parts);
                });
            }, 300);
        });
    }

    if (confirmPartsSelection) {
        confirmPartsSelection.addEventListener('click', () => {
            usedParts = [...selectedParts];
            renderUsedPartsForEdit();
            if (partsModal) partsModal.classList.remove('active');
        });
    }

    // Guardar edición
    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', handleSaveEdit);
    }

    // Cerrar modales
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (detailModal) detailModal.classList.remove('active');
            if (statusModal) statusModal.classList.remove('active');
            if (editModal) editModal.classList.remove('active');
            if (partsModal) partsModal.classList.remove('active');
        });
    });

    // Cerrar sesión
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = 'index.html';
        });
    }
}

// Modal de detalles
function openDetailModal(jobId) {
    const job = jobsCache.find(j => j.id === jobId);
    if (!job || !detailModal || !detailBody) return;

    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = `Detalles del Trabajo: ${job.vehicle?.unit || 'Unidad'}`;

    const usedPartsList = Array.isArray(job.usedParts) ? job.usedParts : (job.workDetails?.usedParts || []);

    detailBody.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <div style="background:#f8f9fa;padding:15px;border-radius:8px;">
                <h4 style="margin:0 0 10px;color:#2c3e50;"><i class="fas fa-truck"></i> Vehículo</h4>
                <p><strong>Unidad:</strong> ${escapeHtml(job.vehicle?.unit || 'N/A')}</p>
                <p><strong>Motor:</strong> ${escapeHtml(job.vehicle?.engineNumber || 'N/A')}</p>
                <p><strong>Placas:</strong> ${escapeHtml(job.vehicle?.plates || 'N/A')}</p>
            </div>
            <div style="background:#f8f9fa;padding:15px;border-radius:8px;">
                <h4 style="margin:0 0 10px;color:#2c3e50;"><i class="fas fa-user"></i> Chofer</h4>
                <p><strong>Nombre:</strong> ${escapeHtml(job.workDetails?.driverName || 'N/A')}</p>
                <p><strong>Empresa:</strong> ${escapeHtml(job.workDetails?.driverCompany || job.client?.company || 'N/A')}</p>
                <p><strong>Teléfono:</strong> ${escapeHtml(job.workDetails?.driverPhone || 'N/A')}</p>
            </div>
            <div style="grid-column:span 2;background:#f8f9fa;padding:15px;border-radius:8px;">
                <h4 style="margin:0 0 10px;color:#2c3e50;"><i class="fas fa-tools"></i> Servicio y Diagnóstico</h4>
                <p><strong>Estado:</strong> ${escapeHtml(job.status || 'N/A')}</p>
                <p><strong>Diagnóstico:</strong> ${escapeHtml(job.workDetails?.diagnosis || 'N/A')}</p>
                <p><strong>Tiempo trabajado:</strong> ${formatElapsedTime(job)}</p>
            </div>
            ${usedPartsList.length > 0 ? `
                <div style="grid-column:span 2;background:#f8f9fa;padding:15px;border-radius:8px;">
                    <h4 style="margin:0 0 10px;color:#2c3e50;"><i class="fas fa-boxes"></i> Piezas Utilizadas</h4>
                    <ul>
                        ${usedPartsList.map(p => `<li>${escapeHtml(typeof p === 'object' ? (p.name || p.partName || 'Pieza') : p)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;

    detailModal.classList.add('active');
}

// Modal de cambio de estado
function openStatusModal(jobId) {
    const job = jobsCache.find(j => j.id === jobId);
    if (!job || !statusModal) return;

    currentJobId = jobId;
    selectedStatus = job.status || 'trabajando';

    if (statusModalTitle) statusModalTitle.textContent = `Actualizar Estado: ${job.vehicle?.unit || 'Unidad'}`;
    if (statusModalSubtitle) statusModalSubtitle.textContent = `Estado actual: ${job.status || 'Abierto'}`;

    statusOptions.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.status === selectedStatus);
    });

    statusModal.classList.add('active');
}

async function handleConfirmStatusUpdate() {
    if (!currentJobId || !selectedStatus) return;

    const job = jobsCache.find(j => j.id === currentJobId);
    if (!job) return;

    // Modo offline
    if (!navigator.onLine) {
        try {
            await enqueueOfflineOperation('UPDATE_JOB_STATUS', {
                jobId: currentJobId,
                status: selectedStatus
            });
            job.status = selectedStatus;
            renderJobs(jobsCache);
            statusModal.classList.remove('active');
            showStatus('Estado guardado localmente (Offline). Se sincronizará al conectar a internet.', 'info');
        } catch (e) {
            alert("Error guardando estado offline: " + e.message);
        }
        return;
    }

    try {
        confirmStatusUpdate.disabled = true;
        confirmStatusUpdate.textContent = 'Actualizando...';

        const updateData = {
            status: selectedStatus,
            lastStatusChange: serverTimestamp()
        };

        if (selectedStatus === JOB_STATUS.WORKING && !job.startTime) {
            updateData.startTime = serverTimestamp();
        }

        if (selectedStatus === JOB_STATUS.FINISHED) {
            updateData.endTime = serverTimestamp();
        }

        const jobRef = doc(db, "Trabajos", currentJobId);
        await updateDoc(jobRef, updateData);

        statusModal.classList.remove('active');
        showStatus('Estado actualizado correctamente', 'success');
    } catch (err) {
        console.error("Error al actualizar estado:", err);
        alert(`Error al actualizar estado: ${err.message}`);
    } finally {
        confirmStatusUpdate.disabled = false;
        confirmStatusUpdate.textContent = 'Actualizar';
    }
}

// Modal de edición
function openEditModal(jobId) {
    const job = jobsCache.find(j => j.id === jobId);
    if (!job || !editModal || !editForm) return;

    currentJobId = jobId;
    usedParts = [...(job.usedParts || job.workDetails?.usedParts || [])];

    let formHtml = `<div class="job-detail-grid" style="display:grid;gap:15px;">`;

    // Campos de vehículo
    formHtml += `<div class="detail-section" style="background:#f8f9fa;padding:15px;border-radius:8px;">
        <h4 style="margin:0 0 10px;"><i class="fas fa-car"></i> Vehículo</h4>`;
    if (job.vehicle) {
        for (const [key, val] of Object.entries(job.vehicle)) {
            const label = fieldTranslations[key] || key;
            formHtml += `<div style="margin-bottom:10px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#666;">${label}</label>
                <input type="text" class="form-input" name="vehicle.${key}" value="${escapeHtml(val || '')}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
            </div>`;
        }
    }
    formHtml += `</div>`;

    // Diagnóstico y piezas
    formHtml += `<div class="detail-section" style="background:#f8f9fa;padding:15px;border-radius:8px;">
        <h4 style="margin:0 0 10px;"><i class="fas fa-stethoscope"></i> Diagnóstico</h4>
        <textarea name="diagnosis" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;height:80px;">${escapeHtml(job.workDetails?.diagnosis || '')}</textarea>
        
        <h4 style="margin:15px 0 10px;"><i class="fas fa-boxes"></i> Piezas Utilizadas</h4>
        <div id="usedPartsListContainer">${renderUsedPartsForEdit()}</div>
        <button type="button" class="btn btn-primary" id="openPartsModalBtn" style="margin-top:10px;padding:6px 12px;border:none;border-radius:4px;cursor:pointer;">
            <i class="fas fa-plus"></i> Agregar Piezas del Almacén
        </button>
    </div>`;

    formHtml += `</div>`;
    editForm.innerHTML = formHtml;

    editModal.classList.add('active');

    // Botón para abrir modal de piezas
    const openPartsBtn = document.getElementById('openPartsModalBtn');
    if (openPartsBtn) {
        openPartsBtn.addEventListener('click', openPartsModal);
    }
}

function renderUsedPartsForEdit() {
    if (usedParts.length === 0) {
        return '<p style="color:#888;">No se han agregado piezas</p>';
    }

    let html = '<ul style="list-style:none;padding:0;margin:0;">';
    usedParts.forEach((part, index) => {
        const name = typeof part === 'object' ? (part.name || part.partName || 'Pieza') : part;
        html += `
            <li style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #eee;">
                <span>${escapeHtml(name)}</span>
                <button type="button" class="remove-part-btn" data-index="${index}" style="background:#e74c3c;color:#fff;border:none;border-radius:3px;padding:2px 8px;cursor:pointer;">
                    <i class="fas fa-trash"></i>
                </button>
            </li>
        `;
    });
    html += '</ul>';
    return html;
}

// Delegar click en remove-part-btn
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-part-btn');
    if (btn) {
        const idx = parseInt(btn.dataset.index);
        usedParts.splice(idx, 1);
        const container = document.getElementById('usedPartsListContainer');
        if (container) container.innerHTML = renderUsedPartsForEdit();
    }
});

// Modal de piezas
function openPartsModal() {
    if (!partsModal) return;
    partsModal.classList.add('active');

    if (modalSearchInput) modalSearchInput.value = '';
    selectedParts = [...usedParts];
    updateSelectedPartsList();

    fetchParts().then(parts => {
        modalParts = parts;
        displayPartsInModal(parts);
    });
}

let partsMemoryCache = null;
let partsMemoryCacheTime = 0;

async function fetchParts(term = '') {
    try {
        const now = Date.now();
        // Si ya cargamos las piezas hace menos de 5 minutos, filtrar en memoria (0 lecturas a Firestore)
        if (!partsMemoryCache || (now - partsMemoryCacheTime) > 300000) {
            const snapshot = await getDocs(collection(db, "Piezas"));
            partsMemoryCache = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                partsMemoryCache.push({
                    id: docSnap.id,
                    name: data.partName || data.nombre || 'Pieza',
                    serial: data.serialNumber || data.codigo || ''
                });
            });
            partsMemoryCacheTime = now;
        }

        const lowerTerm = term.toLowerCase();
        return partsMemoryCache.filter(p => 
            !lowerTerm || 
            p.name.toLowerCase().includes(lowerTerm) || 
            p.serial.toLowerCase().includes(lowerTerm)
        );
    } catch (err) {
        console.error("Error consultando piezas:", err);
        return [];
    }
}

function displayPartsInModal(parts) {
    if (!partsListContainer) return;
    if (parts.length === 0) {
        partsListContainer.innerHTML = '<p style="text-align:center;padding:15px;color:#888;">No se encontraron piezas</p>';
        return;
    }

    partsListContainer.innerHTML = '';
    parts.forEach(part => {
        const div = document.createElement('div');
        div.className = 'part-item';
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee;cursor:pointer;';
        div.innerHTML = `
            <div>
                <strong>${escapeHtml(part.name)}</strong>
                <span style="display:block;font-size:12px;color:#888;">${escapeHtml(part.serial)}</span>
            </div>
            <button type="button" class="btn btn-sm btn-primary add-part-to-sel" data-id="${part.id}" style="padding:4px 8px;border:none;border-radius:4px;cursor:pointer;">
                <i class="fas fa-plus"></i>
            </button>
        `;

        div.querySelector('.add-part-to-sel').addEventListener('click', () => {
            if (!selectedParts.some(p => p.id === part.id)) {
                selectedParts.push(part);
                updateSelectedPartsList();
            }
        });

        partsListContainer.appendChild(div);
    });
}

function updateSelectedPartsList() {
    if (!selectedPartsContainer) return;
    if (selectedParts.length === 0) {
        selectedPartsContainer.innerHTML = '<p style="color:#888;">No hay piezas seleccionadas</p>';
        return;
    }

    let html = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">';
    selectedParts.forEach((part, index) => {
        const name = typeof part === 'object' ? (part.name || part.partName || 'Pieza') : part;
        html += `
            <span style="background:#e8f4fd;color:#2980b9;padding:4px 8px;border-radius:12px;font-size:12px;display:flex;align-items:center;gap:6px;">
                ${escapeHtml(name)}
                <i class="fas fa-times remove-sel-part" data-index="${index}" style="cursor:pointer;"></i>
            </span>
        `;
    });
    html += '</div>';
    selectedPartsContainer.innerHTML = html;

    selectedPartsContainer.querySelectorAll('.remove-sel-part').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            selectedParts.splice(idx, 1);
            updateSelectedPartsList();
        });
    });
}

async function handleSaveEdit() {
    if (!currentJobId) return;

    try {
        saveEditBtn.disabled = true;
        saveEditBtn.textContent = 'Guardando...';

        const inputs = editForm.querySelectorAll('input, textarea');
        const updateData = {
            usedParts: usedParts,
            updatedAt: serverTimestamp()
        };

        inputs.forEach(input => {
            const name = input.name;
            if (!name) return;

            if (name.startsWith('vehicle.')) {
                const key = name.replace('vehicle.', '');
                if (!updateData['vehicle']) updateData['vehicle'] = {};
                updateData[`vehicle.${key}`] = input.value;
            } else if (name === 'diagnosis') {
                updateData['workDetails.diagnosis'] = input.value;
            }
        });

        const jobRef = doc(db, "Trabajos", currentJobId);
        await updateDoc(jobRef, updateData);

        editModal.classList.remove('active');
        showStatus('Trabajo editado correctamente', 'success');
    } catch (err) {
        console.error("Error al guardar cambios de trabajo:", err);
        alert(`Error al guardar: ${err.message}`);
    } finally {
        saveEditBtn.disabled = false;
        saveEditBtn.textContent = 'Guardar Cambios';
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
    for (let t in timers) clearInterval(timers[t]);
});
