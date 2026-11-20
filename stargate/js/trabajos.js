// Gestión de Trabajos - Portal Administrativo (Stargate)
import { initAuthGuard } from './auth-guard.js';
import { initNotificationsManager } from './notifications-manager.js';
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
    initAuthGuard(() => {
        loadMechanics();
        loadJobs();
        initNotificationsManager();
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
            jobsCache = [];

            if (snapshot.empty) {
                if (emptyState) emptyState.style.display = 'block';
                if (loader) loader.style.display = 'none';
                renderJobs([]);
                return;
            }

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const job = {
                    id: docSnap.id,
                    ...data,
                    client: data.client || { name: data.clientName || 'Cliente General', company: data.company || 'Particular' },
                    vehicle: data.vehicle || { unit: data.unit || 'Unidad', engineNumber: data.engineNumber || 'N/A', plates: data.plates || 'N/A' },
                    workDetails: data.workDetails || { driverName: data.driverName || 'N/A', diagnosis: data.diagnosis || data.service || 'Servicio mecánico' },
                    status: data.status || 'Trabajo abierto'
                };
                jobsCache.push(job);
            });

            // Ordenar por fecha descendente en memoria (evita requerir índices compuestos en Firestore)
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

    } catch (error) {
        console.error("Error inicializando trabajos:", error);
        if (loader) loader.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
    }
}

// Renderizar trabajos agrupados por cliente
function renderJobs(jobs) {
    if (!jobsContainer) return;
    let filtered = [...jobs];

    // Filtro por estado
    if (statusFilter && statusFilter.value !== 'all') {
        const val = statusFilter.value;
        filtered = filtered.filter(job => {
            const st = (job.status || '').toLowerCase();
            if (val === 'open') return st === 'trabajo abierto';
            if (val === 'in-progress') return st === 'en progreso';
            if (val === 'completed') return st === 'completado';
            if (val === 'cancelled') return st === 'cancelado';
            return true;
        });
    }

    // Filtro por fecha (showFilter)
    if (showFilter && showFilter.value !== 'all') {
        const now = Date.now();
        const days = showFilter.value === 'last7' ? 7 : showFilter.value === 'last30' ? 30 : 0;
        if (days > 0) {
            const cutoff = now - (days * 24 * 60 * 60 * 1000);
            filtered = filtered.filter(job => {
                const jobTime = job.createdAt?.toMillis ? job.createdAt.toMillis() : new Date(job.createdAt || 0).getTime();
                return jobTime >= cutoff;
            });
        }
    }

    // Filtro de búsqueda
    if (searchInput && searchInput.value.trim() !== '') {
        const term = searchInput.value.toLowerCase().trim();
        filtered = filtered.filter(job => {
            const clientName = (job.client?.name || '').toLowerCase();
            const clientCompany = (job.client?.company || '').toLowerCase();
            const unit = (job.vehicle?.unit || '').toLowerCase();
            const plates = (job.vehicle?.plates || '').toLowerCase();
            const mechanic = (job.mechanic || '').toLowerCase();
            const driver = (job.workDetails?.driverName || '').toLowerCase();
            const diagnosis = (job.workDetails?.diagnosis || '').toLowerCase();
            const id = (job.id || '').toLowerCase();

            return clientName.includes(term) ||
                   clientCompany.includes(term) ||
                   unit.includes(term) ||
                   plates.includes(term) ||
                   mechanic.includes(term) ||
                   driver.includes(term) ||
                   diagnosis.includes(term) ||
                   id.includes(term);
        });
    }

    if (filtered.length === 0) {
        jobsContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    jobsContainer.innerHTML = '';

    // Agrupar trabajos por cliente (fiel a la arquitectura original)
    const clientsMap = {};
    filtered.forEach(job => {
        const clientName = job.client?.name || 'Cliente Particular';
        if (!clientsMap[clientName]) {
            clientsMap[clientName] = {
                client: job.client,
                jobs: []
            };
        }
        clientsMap[clientName].jobs.push(job);
    });

    Object.keys(clientsMap).forEach((clientName, index) => {
        const group = clientsMap[clientName];
        const groupEl = document.createElement('div');
        groupEl.className = 'client-group';

        groupEl.innerHTML = `
            <div class="client-header">
                <div class="client-info">
                    <h2>${escapeHtml(clientName)}</h2>
                    <p>${escapeHtml(group.client?.company || 'Particular')}</p>
                </div>
                <div class="client-stats">
                    <span>${group.jobs.length} ${group.jobs.length === 1 ? 'trabajo' : 'trabajos'}</span>
                </div>
            </div>
            <div class="jobs-grid" id="jobs-grid-${index}"></div>
        `;

        jobsContainer.appendChild(groupEl);

        const gridEl = document.getElementById(`jobs-grid-${index}`);
        group.jobs.forEach((job, jobIdx) => {
            const card = createJobCard(job);
            card.style.animationDelay = `${jobIdx * 0.05}s`;
            gridEl.appendChild(card);
        });
    });
}

// Crear tarjeta de trabajo con diseño original
function createJobCard(job) {
    const card = document.createElement('div');
    card.className = 'job-card';

    const date = job.createdAt?.toDate ? job.createdAt.toDate() : new Date(job.createdAt || Date.now());
    const formattedDate = isNaN(date) ? 'Fecha no disp.' : date.toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });

    let mainImage = '';
    if (job.photos && job.photos.interior && job.photos.interior.length > 0) {
        mainImage = job.photos.interior[0];
    } else if (job.photos && job.photos.exterior && job.photos.exterior.length > 0) {
        mainImage = job.photos.exterior[0];
    }

    let statusClass = 'status-open';
    const st = (job.status || '').toLowerCase();
    if (st === 'en progreso') statusClass = 'status-in-progress';
    else if (st === 'completado') statusClass = 'status-completed';
    else if (st === 'cancelado') statusClass = 'status-cancelled';

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

// Abrir modal de detalles
function openDetailModal(jobId) {
    const job = jobsCache.find(j => j.id === jobId);
    if (!job || !detailModal || !detailBody) return;

    currentJob = job;

    const date = job.createdAt?.toDate ? job.createdAt.toDate() : new Date(job.createdAt || Date.now());
    const formattedDate = isNaN(date) ? 'No disponible' : date.toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const usedParts = Array.isArray(job.workDetails?.usedParts) ? job.workDetails.usedParts : [];

    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = `Detalles del Trabajo: ${job.vehicle?.unit || 'Unidad'}`;

    detailBody.innerHTML = `
        <div class="job-detail-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <div class="detail-section" style="background:#f8f9fa;padding:15px;border-radius:8px;">
                <h4 style="margin:0 0 10px;color:#2c3e50;"><i class="fas fa-user"></i> Cliente</h4>
                <p style="margin:5px 0;"><strong>Nombre:</strong> ${escapeHtml(job.client?.name || 'N/A')}</p>
                <p style="margin:5px 0;"><strong>Empresa:</strong> ${escapeHtml(job.client?.company || 'Particular')}</p>
            </div>
            <div class="detail-section" style="background:#f8f9fa;padding:15px;border-radius:8px;">
                <h4 style="margin:0 0 10px;color:#2c3e50;"><i class="fas fa-truck"></i> Vehículo</h4>
                <p style="margin:5px 0;"><strong>Unidad:</strong> ${escapeHtml(job.vehicle?.unit || 'N/A')}</p>
                <p style="margin:5px 0;"><strong>Motor:</strong> ${escapeHtml(job.vehicle?.engineNumber || 'N/A')}</p>
                <p style="margin:5px 0;"><strong>Placas:</strong> ${escapeHtml(job.vehicle?.plates || 'N/A')}</p>
            </div>
            <div class="detail-section" style="grid-column: span 2;background:#f8f9fa;padding:15px;border-radius:8px;">
                <h4 style="margin:0 0 10px;color:#2c3e50;"><i class="fas fa-clipboard-list"></i> Detalles del Servicio</h4>
                <p style="margin:5px 0;"><strong>Chofer:</strong> ${escapeHtml(job.workDetails?.driverName || 'N/A')}</p>
                <p style="margin:5px 0;"><strong>Mecánico Asignado:</strong> ${escapeHtml(job.mechanic || 'Sin asignar')}</p>
                <p style="margin:5px 0;"><strong>Estado:</strong> <span class="status-badge" style="padding:2px 8px;border-radius:12px;background:#3498db;color:#fff;">${escapeHtml(job.status || 'Trabajo abierto')}</span></p>
                <p style="margin:5px 0;"><strong>Diagnóstico:</strong> ${escapeHtml(job.workDetails?.diagnosis || 'Sin diagnóstico')}</p>
                <p style="margin:5px 0;"><strong>Fecha de Registro:</strong> ${formattedDate}</p>
            </div>
            ${usedParts.length > 0 ? `
                <div class="detail-section" style="grid-column: span 2;background:#f8f9fa;padding:15px;border-radius:8px;">
                    <h4 style="margin:0 0 10px;color:#2c3e50;"><i class="fas fa-boxes"></i> Piezas Utilizadas</h4>
                    <ul style="margin:0;padding-left:20px;">
                        ${usedParts.map(p => `<li>${escapeHtml(p.partName || p.name || 'Pieza')} - Cantidad: ${p.quantity || 1}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
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

// Generador de reporte PDF
async function handleGeneratePdf() {
    if (!currentJob) return;

    try {
        generatePdfBtn.disabled = true;
        generatePdfBtn.textContent = 'Generando...';

        const { jsPDF } = window.jspdf || {};
        if (!jsPDF) {
            alert("Biblioteca PDF no disponible");
            return;
        }

        const docPdf = new jsPDF();
        docPdf.setFontSize(18);
        docPdf.text("Reporte de Servicio - DEFCON5", 14, 20);

        docPdf.setFontSize(12);
        docPdf.text(`Folio ID: ${currentJob.id}`, 14, 30);
        docPdf.text(`Cliente: ${currentJob.client?.name || 'N/A'} (${currentJob.client?.company || 'Particular'})`, 14, 40);
        docPdf.text(`Unidad: ${currentJob.vehicle?.unit || 'N/A'} - Placas: ${currentJob.vehicle?.plates || 'N/A'}`, 14, 50);
        docPdf.text(`Motor: ${currentJob.vehicle?.engineNumber || 'N/A'}`, 14, 60);
        docPdf.text(`Mecánico: ${currentJob.mechanic || 'Sin asignar'}`, 14, 70);
        docPdf.text(`Estado: ${currentJob.status || 'N/A'}`, 14, 80);
        docPdf.text(`Diagnóstico: ${currentJob.workDetails?.diagnosis || 'N/A'}`, 14, 90);

        docPdf.save(`Reporte_Trabajo_${currentJob.vehicle?.unit || currentJob.id}.pdf`);
    } catch (err) {
        console.error("Error al generar PDF:", err);
        alert("Ocurrió un error al generar el PDF.");
    } finally {
        generatePdfBtn.disabled = false;
        generatePdfBtn.textContent = 'Generar Reporte PDF';
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
