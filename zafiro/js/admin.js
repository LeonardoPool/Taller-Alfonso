// Panel de Trabajos para Mecánicos - Portal Mecánicos (Zafiro)
import { checkMechanicAuth, clearMechanicSession } from './auth-guard.js';
import { generateJobServiceReport, generateEntryExitReport } from './pdf-report-generator.js';
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
    serverTimestamp,
    storage,
    storageRef,
    uploadBytesResumable,
    getDownloadURL
} from './firebase-config.js';
import { enqueueOfflineOperation } from './pwa-manager.js';

let currentMechanic = null;
let jobsCache = [];
let currentJobId = null;
let currentActiveJob = null;
let pendingExitJob = null;
let exitIneFrontFile = null;
let exitIneBackFile = null;
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

// Elementos de Modal de Salida / Entrega de Unidad
const exitModal = document.getElementById('exitModal');
const exitDateInput = document.getElementById('exitDate');
const exitPlatesInput = document.getElementById('exitPlates');
const exitModelInput = document.getElementById('exitModel');
const exitCompanyInput = document.getElementById('exitCompany');
const sameDriverCheck = document.getElementById('sameDriverCheck');
const sameDriverInfoBox = document.getElementById('sameDriverInfoBox');
const sameDriverSummary = document.getElementById('sameDriverSummary');
const entryInePreviews = document.getElementById('entryInePreviews');
const differentDriverFields = document.getElementById('differentDriverFields');
const exitDriverNameInput = document.getElementById('exitDriverName');
const exitIneFrontInput = document.getElementById('exitIneFrontInput');
const exitIneFrontArea = document.getElementById('exitIneFrontArea');
const exitIneFrontPlaceholder = document.getElementById('exitIneFrontPlaceholder');
const exitIneFrontPreview = document.getElementById('exitIneFrontPreview');
const exitIneFrontImg = document.getElementById('exitIneFrontImg');
const removeExitIneFrontBtn = document.getElementById('removeExitIneFront');
const exitIneBackInput = document.getElementById('exitIneBackInput');
const exitIneBackArea = document.getElementById('exitIneBackArea');
const exitIneBackPlaceholder = document.getElementById('exitIneBackPlaceholder');
const exitIneBackPreview = document.getElementById('exitIneBackPreview');
const exitIneBackImg = document.getElementById('exitIneBackImg');
const removeExitIneBackBtn = document.getElementById('removeExitIneBack');
const exitReportByInput = document.getElementById('exitReportBy');
const confirmExitAndFinishBtn = document.getElementById('confirmExitAndFinishBtn');
const cancelExitModalBtn = document.getElementById('cancelExitModalBtn');
const generateEntryExitPdfBtn = document.getElementById('generateEntryExitPdf');

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

// Validaciones de estado del cronómetro
function isJobRunning(job) {
    if (!job || !job.status) return false;
    const s = String(job.status).toLowerCase();
    return s === JOB_STATUS.WORKING || s.includes('trabajando') || s.includes('en progreso') || s.includes('en_progreso');
}

function isJobPaused(job) {
    if (!job || !job.status) return false;
    const s = String(job.status).toLowerCase();
    return s === JOB_STATUS.PAUSED_PARTS || s === JOB_STATUS.PAUSED_EXIT || s.includes('detenido') || s.includes('paus');
}

function isJobFinished(job) {
    if (!job || !job.status) return false;
    const s = String(job.status).toLowerCase();
    return s === JOB_STATUS.FINISHED || s.includes('finaliz') || s.includes('complet');
}

// Desglose completo y auditado de tiempos (Mano de obra, Refacciones, Salida y Lead Time Total)
function getJobTimeBreakdown(job) {
    if (!job) {
        return {
            activeSeconds: 0,
            pausedPartsSeconds: 0,
            pausedExitSeconds: 0,
            totalTurnaroundSeconds: 0,
            hasStarted: false
        };
    }

    let active = Number(job.activeTimeSeconds || job.totalTimeSeconds || 0);
    let pausedParts = Number(job.pausedPartsSeconds || 0);
    let pausedExit = Number(job.pausedExitSeconds || 0);

    const hasStarted = Boolean(job.startTime);

    // Si ha iniciado y no está finalizado, calcular el tiempo transcurrido en el estado actual
    if (hasStarted && !isJobFinished(job)) {
        const lastChangeRef = job.lastStatusChange || job.timerStartedAt || job.startTime;
        if (lastChangeRef) {
            const lastChangeDate = lastChangeRef.toDate ? lastChangeRef.toDate() : new Date(lastChangeRef);
            const deltaCurrent = Math.max(0, Math.floor((Date.now() - lastChangeDate.getTime()) / 1000));

            if (isJobRunning(job)) {
                active += deltaCurrent;
            } else if (job.status === JOB_STATUS.PAUSED_PARTS || String(job.status).toLowerCase().includes('refacc')) {
                pausedParts += deltaCurrent;
            } else if (job.status === JOB_STATUS.PAUSED_EXIT || String(job.status).toLowerCase().includes('salida')) {
                pausedExit += deltaCurrent;
            }
        }
    }

    // Tiempo total de estancia en taller (Lead Time / Salida)
    let totalTurnaround = 0;
    if (job.startTime) {
        const start = job.startTime.toDate ? job.startTime.toDate() : new Date(job.startTime);
        const end = isJobFinished(job) && job.endTime
            ? (job.endTime.toDate ? job.endTime.toDate() : new Date(job.endTime))
            : new Date();
        totalTurnaround = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    }

    return {
        activeSeconds: active,
        pausedPartsSeconds: pausedParts,
        pausedExitSeconds: pausedExit,
        totalTurnaroundSeconds: totalTurnaround,
        hasStarted
    };
}

// Formateo inteligente en Años, Meses, Semanas, Días, Horas, Minutos, Segundos
function formatSmartDuration(totalSeconds, isLiveTicking = false) {
    if (!totalSeconds || totalSeconds < 0) totalSeconds = 0;

    const SECONDS_IN_MINUTE = 60;
    const SECONDS_IN_HOUR = 3600;
    const SECONDS_IN_DAY = 86400;
    const SECONDS_IN_WEEK = 604800; // 7 días
    const SECONDS_IN_MONTH = 2592000; // 30 días aprox.
    const SECONDS_IN_YEAR = 31536000; // 365 días

    let rem = Math.floor(totalSeconds);

    const years = Math.floor(rem / SECONDS_IN_YEAR);
    rem %= SECONDS_IN_YEAR;

    const months = Math.floor(rem / SECONDS_IN_MONTH);
    rem %= SECONDS_IN_MONTH;

    const weeks = Math.floor(rem / SECONDS_IN_WEEK);
    rem %= SECONDS_IN_WEEK;

    const days = Math.floor(rem / SECONDS_IN_DAY);
    rem %= SECONDS_IN_DAY;

    const hours = Math.floor(rem / SECONDS_IN_HOUR);
    rem %= SECONDS_IN_HOUR;

    const minutes = Math.floor(rem / SECONDS_IN_MINUTE);
    const seconds = rem % SECONDS_IN_MINUTE;

    if (isLiveTicking) {
        const timePart = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        const prefixParts = [];
        if (years > 0) prefixParts.push(`${years}a`);
        if (months > 0) prefixParts.push(`${months}m`);
        if (weeks > 0) prefixParts.push(`${weeks}sem`);
        if (days > 0) prefixParts.push(`${days}d`);

        if (prefixParts.length > 0) {
            return `${prefixParts.join(' ')} ${timePart}`;
        }
        return timePart; // Menos de 1 día: HH:MM:SS
    }

    // Modo descriptivo legible
    const parts = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
    if (weeks > 0) parts.push(`${weeks} ${weeks === 1 ? 'sem' : 'sem'}`);
    if (days > 0) parts.push(`${days} ${days === 1 ? 'día' : 'días'}`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 && years === 0 && months === 0) parts.push(`${minutes}m`);

    if (parts.length === 0) {
        return `${seconds}s`;
    }

    return parts.slice(0, 3).join(' ');
}

// Obtiene el tiempo principal a desplegar según el estado del trabajo
function formatElapsedTime(job) {
    const b = getJobTimeBreakdown(job);
    if (!b.hasStarted) return '00:00:00';

    if (isJobRunning(job)) {
        return formatSmartDuration(b.activeSeconds, true);
    }
    if (job.status === JOB_STATUS.PAUSED_PARTS || String(job.status).toLowerCase().includes('refacc')) {
        return formatSmartDuration(b.pausedPartsSeconds, true);
    }
    if (job.status === JOB_STATUS.PAUSED_EXIT || String(job.status).toLowerCase().includes('salida')) {
        return formatSmartDuration(b.pausedExitSeconds, true);
    }
    if (isJobFinished(job)) {
        return formatSmartDuration(b.activeSeconds, false);
    }
    return formatSmartDuration(b.activeSeconds, false);
}

// Iniciar timer en vivo para un trabajo
function startTimer(jobId) {
    if (timers[jobId]) clearInterval(timers[jobId]);

    timers[jobId] = setInterval(() => {
        const j = jobsCache.find(x => x.id === jobId);
        if (j && (isJobRunning(j) || isJobPaused(j))) {
            const el = document.querySelector(`#timer-${jobId} .timer-digits`);
            if (el) el.textContent = formatElapsedTime(j);

            // Actualizar en el modal de detalle si está abierto para este trabajo
            if (currentJobId === jobId) {
                const b = getJobTimeBreakdown(j);
                const turnEl = document.getElementById('modal-turnaround-time');
                const actEl = document.getElementById('modal-active-time');
                const partEl = document.getElementById('modal-parts-time');
                const exitEl = document.getElementById('modal-exit-time');
                if (turnEl) turnEl.textContent = formatSmartDuration(b.totalTurnaroundSeconds, false);
                if (actEl) actEl.textContent = formatSmartDuration(b.activeSeconds, isJobRunning(j));
                if (partEl) partEl.textContent = formatSmartDuration(b.pausedPartsSeconds, j.status === JOB_STATUS.PAUSED_PARTS);
                if (exitEl) exitEl.textContent = formatSmartDuration(b.pausedExitSeconds, j.status === JOB_STATUS.PAUSED_EXIT);
            }
        } else {
            clearInterval(timers[jobId]);
            delete timers[jobId];
        }
    }, 1000);
}

// Iniciar trabajo con 1 tap
async function startJobTimer(jobId) {
    const job = jobsCache.find(j => j.id === jobId);
    if (!job) return;

    const now = serverTimestamp();
    const updateData = {
        status: JOB_STATUS.WORKING,
        lastStatusChange: now,
        activeTimeSeconds: 0,
        pausedPartsSeconds: 0,
        pausedExitSeconds: 0,
        totalTimeSeconds: 0
    };
    if (!job.startTime) {
        updateData.startTime = now;
    }

    // Actualización visual inmediata
    job.status = JOB_STATUS.WORKING;
    job.lastStatusChange = new Date();
    if (!job.startTime) job.startTime = new Date();
    job.activeTimeSeconds = 0;
    job.pausedPartsSeconds = 0;
    job.pausedExitSeconds = 0;
    job.totalTimeSeconds = 0;
    renderJobs(jobsCache);

    if (!navigator.onLine) {
        try {
            await enqueueOfflineOperation('UPDATE_JOB_STATUS', {
                jobId: jobId,
                status: JOB_STATUS.WORKING,
                activeTimeSeconds: 0,
                pausedPartsSeconds: 0,
                pausedExitSeconds: 0,
                totalTimeSeconds: 0
            });
            showStatus('Trabajo iniciado localmente (Offline).', 'info');
        } catch (e) {
            alert('Error offline: ' + e.message);
        }
        return;
    }

    try {
        const jobRef = doc(db, "Trabajos", jobId);
        await updateDoc(jobRef, updateData);
        showStatus('Trabajo iniciado. Cronómetro en marcha.', 'success');
    } catch (err) {
        console.error('Error al iniciar trabajo:', err);
        alert('Error al iniciar trabajo: ' + err.message);
    }
}

// Reanudar trabajo con 1 tap
async function resumeJobTimer(jobId) {
    const job = jobsCache.find(j => j.id === jobId);
    if (!job) return;

    const now = serverTimestamp();
    const b = getJobTimeBreakdown(job);
    const updateData = {
        status: JOB_STATUS.WORKING,
        lastStatusChange: now,
        activeTimeSeconds: b.activeSeconds,
        pausedPartsSeconds: b.pausedPartsSeconds,
        pausedExitSeconds: b.pausedExitSeconds,
        totalTimeSeconds: b.activeSeconds
    };

    // Actualización visual inmediata
    job.status = JOB_STATUS.WORKING;
    job.lastStatusChange = new Date();
    job.activeTimeSeconds = b.activeSeconds;
    job.pausedPartsSeconds = b.pausedPartsSeconds;
    job.pausedExitSeconds = b.pausedExitSeconds;
    job.totalTimeSeconds = b.activeSeconds;
    renderJobs(jobsCache);

    if (!navigator.onLine) {
        try {
            await enqueueOfflineOperation('UPDATE_JOB_STATUS', {
                jobId: jobId,
                status: JOB_STATUS.WORKING,
                activeTimeSeconds: b.activeSeconds,
                pausedPartsSeconds: b.pausedPartsSeconds,
                pausedExitSeconds: b.pausedExitSeconds,
                totalTimeSeconds: b.activeSeconds
            });
            showStatus('Trabajo reanudado localmente (Offline).', 'info');
        } catch (e) {
            alert('Error offline: ' + e.message);
        }
        return;
    }

    try {
        const jobRef = doc(db, "Trabajos", jobId);
        await updateDoc(jobRef, updateData);
        showStatus('Trabajo reanudado. Cronómetro en marcha.', 'success');
    } catch (err) {
        console.error('Error al reanudar trabajo:', err);
        alert('Error al reanudar trabajo: ' + err.message);
    }
}

// Renderizar lista de trabajos
function renderJobs(jobs) {
    if (!jobsContainer) return;
    let filtered = [...jobs];

    // Filtro por estado
    if (statusFilter && statusFilter.value !== 'all') {
        const val = statusFilter.value;
        filtered = filtered.filter(job => {
            if (val === 'trabajando') return isJobRunning(job);
            if (val === 'detenido_refaccion') return job.status === JOB_STATUS.PAUSED_PARTS || String(job.status).toLowerCase().includes('refacc');
            if (val === 'detenido_salida') return job.status === JOB_STATUS.PAUSED_EXIT || String(job.status).toLowerCase().includes('salida');
            if (val === 'finalizado') return isJobFinished(job);
            if (val === 'abierto') return !isJobRunning(job) && !isJobPaused(job) && !isJobFinished(job);
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

    // Limpiar timers activos existentes antes de re-renderizar
    for (let timerId in timers) {
        clearInterval(timers[timerId]);
    }
    timers = {};

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

        if (isJobRunning(job) || isJobPaused(job)) {
            startTimer(job.id);
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

    let statusClass = 'status-open';
    let statusText = job.status || 'Trabajo abierto';
    if (isJobRunning(job)) {
        statusClass = 'status-in-progress';
        statusText = 'Trabajando';
    } else if (job.status === JOB_STATUS.PAUSED_PARTS || String(job.status).toLowerCase().includes('refacc')) {
        statusClass = 'status-paused';
        statusText = 'Detenido (refacción)';
    } else if (job.status === JOB_STATUS.PAUSED_EXIT || String(job.status).toLowerCase().includes('salida')) {
        statusClass = 'status-stopped';
        statusText = 'Detenido (salida)';
    } else if (isJobFinished(job)) {
        statusClass = 'status-completed';
        statusText = 'Finalizado';
    }

    let diagnosisText = job.workDetails?.diagnosis || 'Sin diagnóstico';
    if (typeof diagnosisText === 'object') {
        diagnosisText = diagnosisText.text || JSON.stringify(diagnosisText);
    }
    diagnosisText = diagnosisText.length > 40 ? diagnosisText.substring(0, 40) + '...' : diagnosisText;

    const b = getJobTimeBreakdown(job);

    // Configuración visual inteligente del cronómetro
    let timerStateClass = 'timer-idle';
    let timerIcon = 'fa-clock';
    let timerBadgeText = 'Sin iniciar';
    let timerSubtext = 'Listo para arrancar';
    let refaccionPillHtml = '';
    let timerActionHtml = `<button class="timer-btn btn-start-quick" data-id="${job.id}" title="Iniciar trabajo"><i class="fas fa-play"></i> Iniciar</button>`;

    if (isJobRunning(job)) {
        timerStateClass = 'timer-running';
        timerIcon = 'fa-stopwatch';
        timerBadgeText = 'Trabajando';
        timerSubtext = 'Mano de obra activa';
        if (b.pausedPartsSeconds > 0) {
            refaccionPillHtml = `<span class="timer-refaccion-pill" title="Tiempo justificado en espera de refacciones"><i class="fas fa-tools"></i> Refacciones: ${formatSmartDuration(b.pausedPartsSeconds, false)}</span>`;
        }
        timerActionHtml = `<button class="timer-btn btn-pause-quick" data-id="${job.id}" title="Pausar trabajo"><i class="fas fa-pause"></i> Pausar</button>`;
    } else if (isJobPaused(job)) {
        timerStateClass = 'timer-paused';
        timerIcon = 'fa-pause-circle';
        const isRefacc = (job.status === JOB_STATUS.PAUSED_PARTS || String(job.status).toLowerCase().includes('refacc'));
        timerBadgeText = isRefacc ? 'Detenido por Refacción' : 'Detenido por Salida';
        timerSubtext = isRefacc ? 'En espera de piezas' : 'Fuera de jornada';
        if (b.activeSeconds > 0) {
            refaccionPillHtml = `<span class="timer-work-pill" title="Mano de obra acumulada"><i class="fas fa-wrench"></i> Trabajado: ${formatSmartDuration(b.activeSeconds, false)}</span>`;
        }
        timerActionHtml = `<button class="timer-btn btn-resume-quick" data-id="${job.id}" title="Reanudar trabajo"><i class="fas fa-play"></i> Reanudar</button>`;
    } else if (isJobFinished(job)) {
        timerStateClass = 'timer-finished';
        timerIcon = 'fa-check-circle';
        timerBadgeText = 'Finalizado';
        timerSubtext = `Mano de obra: ${formatSmartDuration(b.activeSeconds, false)}`;
        if (b.totalTurnaroundSeconds > 0) {
            refaccionPillHtml = `<span class="timer-total-pill" title="Tiempo total de estancia en taller"><i class="fas fa-truck-ramp-box"></i> Salida: ${formatSmartDuration(b.totalTurnaroundSeconds, false)}</span>`;
        }
        timerActionHtml = '';
    }

    // Obtener imagen principal para carga optimizada
    let mainImage = null;
    if (job.photos) {
        if (job.photos.interior && job.photos.interior.length > 0) mainImage = job.photos.interior[0];
        else if (job.photos.exterior && job.photos.exterior.length > 0) mainImage = job.photos.exterior[0];
        else if (Array.isArray(job.photos) && job.photos.length > 0) mainImage = job.photos[0];
        else if (typeof job.photos === 'object') {
            for (let cat in job.photos) {
                if (Array.isArray(job.photos[cat]) && job.photos[cat].length > 0) {
                    mainImage = job.photos[cat][0];
                    break;
                }
            }
        }
    }

    card.innerHTML = `
        <div class="job-status ${statusClass}">${escapeHtml(statusText)}</div>
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
                    <div class="detail-value"><i class="fas fa-cog"></i> ${escapeHtml(job.vehicle?.engineNumber || 'N/A')}</div>
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
            <div class="job-timer ${timerStateClass}" id="timer-${job.id}" data-id="${job.id}">
                <div class="timer-main">
                    <div class="timer-top-row">
                        <i class="fas ${timerIcon}"></i>
                        <span class="timer-digits">${formatElapsedTime(job)}</span>
                        <span class="timer-badge">${timerBadgeText}</span>
                    </div>
                    <div class="timer-sub-row">
                        <span class="timer-subtext">${timerSubtext}</span>
                        ${refaccionPillHtml}
                    </div>
                </div>
                <div class="timer-action">
                    ${timerActionHtml}
                </div>
            </div>
        </div>
        <div class="job-footer">
            <div class="job-date"><i class="fas fa-calendar-alt"></i> ${formattedDate}</div>
            <div class="job-actions">
                <button class="job-btn detail-btn" data-id="${job.id}" title="Ver detalles"><i class="fas fa-eye"></i></button>
                <button class="job-btn status-btn" data-id="${job.id}" title="Cambiar estado"><i class="fas fa-exchange-alt"></i></button>
                <button class="job-btn edit-btn" data-id="${job.id}" title="Editar trabajo"><i class="fas fa-edit"></i></button>
                ${(isJobFinished(job) || job.exitDriver || job.entryDriver) ? `<button class="job-btn entry-exit-btn" data-id="${job.id}" title="Reporte Entrada y Salida (PDF)" style="color:#8B1E1E;"><i class="fas fa-file-contract"></i></button>` : ''}
            </div>
        </div>
    `;

    return card;
}

// Configurar escuchas de eventos
function setupEventListeners() {
    if (statusFilter) statusFilter.addEventListener('change', () => renderJobs(jobsCache));
    if (sortFilter) sortFilter.addEventListener('change', () => renderJobs(jobsCache));
    if (searchInput) searchInput.addEventListener('input', () => renderJobs(jobsCache));

    // Delegación de eventos en botones de tarjetas
    document.addEventListener('click', (e) => {
        // Botones rápidos del cronómetro
        const startBtn = e.target.closest('.btn-start-quick');
        if (startBtn) {
            e.stopPropagation();
            const jobId = startBtn.dataset.id;
            startJobTimer(jobId);
            return;
        }

        const resumeBtn = e.target.closest('.btn-resume-quick');
        if (resumeBtn) {
            e.stopPropagation();
            const jobId = resumeBtn.dataset.id;
            resumeJobTimer(jobId);
            return;
        }

        const pauseBtn = e.target.closest('.btn-pause-quick');
        if (pauseBtn) {
            e.stopPropagation();
            const jobId = pauseBtn.dataset.id;
            openStatusModal(jobId);
            return;
        }

        // Clic en la barra del temporizador
        const timerBar = e.target.closest('.job-timer');
        if (timerBar && !e.target.closest('.timer-btn')) {
            const jobId = timerBar.dataset.id;
            const j = jobsCache.find(x => x.id === jobId);
            if (j) {
                if (isJobRunning(j)) {
                    openStatusModal(jobId);
                } else if (isJobPaused(j)) {
                    resumeJobTimer(jobId);
                } else if (!isJobFinished(j)) {
                    startJobTimer(jobId);
                }
            }
            return;
        }

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

        const entryExitBtn = e.target.closest('.entry-exit-btn');
        if (entryExitBtn) {
            const jobId = entryExitBtn.dataset.id;
            const j = jobsCache.find(x => x.id === jobId);
            if (j) {
                generateEntryExitReport(j);
            }
            return;
        }
    });

    // Opciones de estado en statusModal
    statusOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            statusOptions.forEach(o => {
                o.classList.remove('active');
                o.classList.remove('selected');
            });
            opt.classList.add('active');
            opt.classList.add('selected');
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
            if (exitModal) exitModal.classList.remove('active');
        });
    });

    if (cancelExitModalBtn) {
        cancelExitModalBtn.addEventListener('click', () => {
            if (exitModal) exitModal.classList.remove('active');
        });
    }

    // Generar PDF de Orden de Servicio
    const generatePdfBtn = document.getElementById('generatePdf');
    if (generatePdfBtn) {
        generatePdfBtn.addEventListener('click', async () => {
            if (!currentActiveJob) return;
            try {
                generatePdfBtn.disabled = true;
                generatePdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
                await generateJobServiceReport(currentActiveJob);
            } catch (err) {
                console.error("Error al generar PDF:", err);
                alert("Ocurrió un error al generar el PDF: " + err.message);
            } finally {
                generatePdfBtn.disabled = false;
                generatePdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Generar Reporte PDF';
            }
        });
    }

    // Generar PDF de Entrada y Salida de Unidades
    if (generateEntryExitPdfBtn) {
        generateEntryExitPdfBtn.addEventListener('click', async () => {
            if (!currentActiveJob) return;
            try {
                generateEntryExitPdfBtn.disabled = true;
                generateEntryExitPdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
                await generateEntryExitReport(currentActiveJob);
            } catch (err) {
                console.error("Error al generar Reporte de Entrada y Salida:", err);
                alert("Ocurrió un error al generar el Reporte de Entrada y Salida: " + err.message);
            } finally {
                generateEntryExitPdfBtn.disabled = false;
                generateEntryExitPdfBtn.innerHTML = '<i class="fas fa-file-contract"></i> Reporte Entrada y Salida (PDF)';
            }
        });
    }

    // Configurar manejadores del formulario de salida / entrega
    setupExitModalHandlers();

    // Cerrar sesión
    if (logoutBtn && !logoutBtn.dataset.listenerAttached) {
        logoutBtn.dataset.listenerAttached = 'true';
        logoutBtn.addEventListener('click', () => {
            if (confirm('¿Deseas cerrar sesión?')) {
                clearMechanicSession();
                window.location.href = 'index.html';
            }
        });
    }
}

// Modal de detalles
function openDetailModal(jobId) {
    const job = jobsCache.find(j => j.id === jobId);
    if (!job || !detailModal || !detailBody) return;

    currentActiveJob = job;

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
                <p><strong>Nombre:</strong> ${escapeHtml(job.entryDriver?.driverName || job.workDetails?.driverName || 'N/A')}</p>
                <p><strong>Empresa:</strong> ${escapeHtml(job.entryDriver?.company || job.workDetails?.driverCompany || job.client?.company || 'N/A')}</p>
                <p><strong>Teléfono:</strong> ${escapeHtml(job.workDetails?.driverPhone || 'N/A')}</p>
            </div>
            ${(job.entryDriver || job.exitDriver) ? `
                <div style="grid-column:span 2;background:#fef2f2;padding:14px 16px;border-radius:10px;border:1px solid #fecaca;">
                    <h4 style="margin:0 0 10px;color:#8B1E1E;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-id-card"></i> Control de Custodia: Choferes de Entrada y Salida
                    </h4>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:14px;">
                        <div style="background:#ffffff;padding:12px;border-radius:8px;border:1px solid #fee2e2;">
                            <strong style="color:#7f1d1d;font-size:13px;display:flex;align-items:center;gap:6px;">
                                <i class="fas fa-sign-in-alt"></i> Entrada a Taller
                            </strong>
                            <p style="margin:6px 0 2px;font-size:12.5px;"><strong>Chofer:</strong> ${escapeHtml(job.entryDriver?.driverName || job.workDetails?.driverName || 'No registrado')}</p>
                            <p style="margin:2px 0;font-size:12.5px;"><strong>Empresa:</strong> ${escapeHtml(job.entryDriver?.company || job.workDetails?.driverCompany || job.client?.company || 'N/A')}</p>
                            <div style="display:flex;gap:8px;margin-top:8px;">
                                ${job.entryDriver?.ineFrontUrl ? `<a href="${job.entryDriver.ineFrontUrl}" target="_blank" rel="noopener" style="font-size:11px;padding:4px 8px;background:#8B1E1E;color:white;border-radius:4px;text-decoration:none;"><i class="fas fa-id-card"></i> INE Frente</a>` : ''}
                                ${job.entryDriver?.ineBackUrl ? `<a href="${job.entryDriver.ineBackUrl}" target="_blank" rel="noopener" style="font-size:11px;padding:4px 8px;background:#8B1E1E;color:white;border-radius:4px;text-decoration:none;"><i class="fas fa-id-card"></i> INE Reverso</a>` : ''}
                            </div>
                        </div>
                        <div style="background:#ffffff;padding:12px;border-radius:8px;border:1px solid #fee2e2;">
                            <strong style="color:#7f1d1d;font-size:13px;display:flex;align-items:center;gap:6px;">
                                <i class="fas fa-sign-out-alt"></i> Entrega y Salida
                            </strong>
                            ${job.exitDriver ? `
                                <p style="margin:6px 0 2px;font-size:12.5px;"><strong>Fecha Entrega:</strong> ${escapeHtml(job.exitDriver.exitDate || 'N/A')}</p>
                                <p style="margin:2px 0;font-size:12.5px;"><strong>Chofer:</strong> ${escapeHtml(job.exitDriver.driverName || 'Mismo chofer')}</p>
                                <p style="margin:2px 0;font-size:12.5px;"><strong>Reportó:</strong> ${escapeHtml(job.exitDriver.reportedBy || 'Taller Alfonso')}</p>
                                <div style="display:flex;gap:8px;margin-top:8px;">
                                    ${job.exitDriver.ineFrontUrl ? `<a href="${job.exitDriver.ineFrontUrl}" target="_blank" rel="noopener" style="font-size:11px;padding:4px 8px;background:#8B1E1E;color:white;border-radius:4px;text-decoration:none;"><i class="fas fa-id-card"></i> INE Frente</a>` : ''}
                                    ${job.exitDriver.ineBackUrl ? `<a href="${job.exitDriver.ineBackUrl}" target="_blank" rel="noopener" style="font-size:11px;padding:4px 8px;background:#8B1E1E;color:white;border-radius:4px;text-decoration:none;"><i class="fas fa-id-card"></i> INE Reverso</a>` : ''}
                                </div>
                            ` : `<p style="color:#64748b;font-size:12px;margin-top:6px;font-style:italic;">Pendiente de entrega</p>`}
                        </div>
                    </div>
                </div>
            ` : ''}
            <div style="grid-column:span 2;background:#f8f9fa;padding:16px;border-radius:10px;border:1px solid #e2e8f0;">
                <h4 style="margin:0 0 12px;color:#0f172a;display:flex;align-items:center;justify-content:space-between;">
                    <span><i class="fas fa-stopwatch" style="color:var(--primary);"></i> Control y Justificación de Tiempos</span>
                    <span style="font-size:0.75rem;padding:3px 8px;border-radius:4px;background:#e2e8f0;color:#334155;font-weight:700;">${escapeHtml(job.status || 'N/A')}</span>
                </h4>
                <p style="margin:0 0 12px;font-size:0.85rem;color:#475569;"><strong>Diagnóstico:</strong> ${escapeHtml(job.workDetails?.diagnosis || 'N/A')}</p>
                ${(() => {
                    const b = getJobTimeBreakdown(job);
                    const formatDt = (ts) => {
                        if (!ts) return 'No registrado';
                        const d = ts.toDate ? ts.toDate() : new Date(ts);
                        return isNaN(d) ? 'No registrado' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    };
                    return `
                        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;">
                            <div style="background:#fff;padding:10px;border-radius:8px;border:1px solid #cbd5e1;">
                                <div style="font-size:0.68rem;color:#64748b;font-weight:700;text-transform:uppercase;">Tiempo Total en Taller</div>
                                <div style="font-size:1.05rem;font-weight:800;color:#0f172a;font-family:var(--font-mono);margin-top:3px;" id="modal-turnaround-time">
                                    ${formatSmartDuration(b.totalTurnaroundSeconds, false)}
                                </div>
                                <div style="font-size:0.65rem;color:#94a3b8;margin-top:2px;">Lead time desde ingreso/inicio</div>
                            </div>
                            <div style="background:#f0f9ff;padding:10px;border-radius:8px;border:1px solid #38bdf8;">
                                <div style="font-size:0.68rem;color:#0284c7;font-weight:700;text-transform:uppercase;">Mano de Obra Activa</div>
                                <div style="font-size:1.05rem;font-weight:800;color:#0284c7;font-family:var(--font-mono);margin-top:3px;" id="modal-active-time">
                                    ${formatSmartDuration(b.activeSeconds, isJobRunning(job))}
                                </div>
                                <div style="font-size:0.65rem;color:#0369a1;margin-top:2px;">Tiempo efectivo de trabajo</div>
                            </div>
                            <div style="background:#fffbeb;padding:10px;border-radius:8px;border:1px solid #f59e0b;">
                                <div style="font-size:0.68rem;color:#d97706;font-weight:700;text-transform:uppercase;">Pausa por Refacción</div>
                                <div style="font-size:1.05rem;font-weight:800;color:#d97706;font-family:var(--font-mono);margin-top:3px;" id="modal-parts-time">
                                    ${formatSmartDuration(b.pausedPartsSeconds, job.status === JOB_STATUS.PAUSED_PARTS)}
                                </div>
                                <div style="font-size:0.65rem;color:#b45309;margin-top:2px;">Justificación de espera de piezas</div>
                            </div>
                            <div style="background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #94a3b8;">
                                <div style="font-size:0.68rem;color:#475569;font-weight:700;text-transform:uppercase;">Pausa por Salida</div>
                                <div style="font-size:1.05rem;font-weight:800;color:#475569;font-family:var(--font-mono);margin-top:3px;" id="modal-exit-time">
                                    ${formatSmartDuration(b.pausedExitSeconds, job.status === JOB_STATUS.PAUSED_EXIT)}
                                </div>
                                <div style="font-size:0.65rem;color:#64748b;margin-top:2px;">Fuera de horario laboral</div>
                            </div>
                        </div>
                        ${job.startTime ? `
                            <div style="margin-top:10px;font-size:0.75rem;color:#64748b;display:flex;flex-wrap:wrap;gap:15px;border-top:1px dashed #cbd5e1;padding-top:8px;">
                                <span><i class="fas fa-calendar-check" style="color:var(--primary);"></i> <strong>Iniciado:</strong> ${formatDt(job.startTime)}</span>
                                ${job.endTime ? `<span><i class="fas fa-flag-checkered" style="color:#10b981;"></i> <strong>Salida/Fin:</strong> ${formatDt(job.endTime)}</span>` : ''}
                            </div>
                        ` : ''}
                    `;
                })()}
            </div>
            ${usedPartsList.length > 0 ? `
                <div style="grid-column:span 2;background:#f8f9fa;padding:15px;border-radius:8px;">
                    <h4 style="margin:0 0 10px;color:#2c3e50;"><i class="fas fa-boxes"></i> Piezas Utilizadas</h4>
                    <ul>
                        ${usedPartsList.map(p => `<li>${escapeHtml(typeof p === 'object' ? (p.name || p.partName || 'Pieza') : p)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            ${(() => {
                const allPhotos = [];
                if (job.photos) {
                    if (Array.isArray(job.photos)) allPhotos.push(...job.photos);
                    else if (typeof job.photos === 'object') {
                        for (let k in job.photos) {
                            if (Array.isArray(job.photos[k])) allPhotos.push(...job.photos[k]);
                            else if (typeof job.photos[k] === 'string') allPhotos.push(job.photos[k]);
                        }
                    }
                }
                if (allPhotos.length === 0) return '';
                return `
                    <div style="grid-column:span 2;background:#f8f9fa;padding:15px;border-radius:8px;">
                        <h4 style="margin:0 0 10px;color:#2c3e50;"><i class="fas fa-camera"></i> Evidencias Fotográficas (${allPhotos.length})</h4>
                        <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;">
                            ${allPhotos.map(url => `
                                <a href="${url}" target="_blank" rel="noopener noreferrer">
                                    <img src="${url}" alt="Evidencia" loading="lazy" decoding="async" style="width:90px;height:90px;object-fit:cover;border-radius:6px;border:1px solid #ddd;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                                </a>
                            `).join('')}
                        </div>
                    </div>
                `;
            })()}
        </div>
    `;

    detailModal.classList.add('active');
}

// Modal de cambio de estado
function openStatusModal(jobId) {
    const job = jobsCache.find(j => j.id === jobId);
    if (!job || !statusModal) return;

    currentJobId = jobId;
    selectedStatus = isJobRunning(job) ? JOB_STATUS.WORKING : (job.status || JOB_STATUS.WORKING);

    if (statusModalTitle) statusModalTitle.textContent = `Actualizar Estado: ${job.vehicle?.unit || 'Unidad'}`;
    if (statusModalSubtitle) statusModalSubtitle.textContent = `Estado actual: ${job.status || 'Abierto'}`;

    statusOptions.forEach(opt => {
        const isMatch = opt.dataset.status === selectedStatus || (isJobRunning(job) && opt.dataset.status === JOB_STATUS.WORKING);
        opt.classList.toggle('active', isMatch);
        opt.classList.toggle('selected', isMatch);
    });

    statusModal.classList.add('active');
}

async function handleConfirmStatusUpdate() {
    if (!currentJobId || !selectedStatus) return;

    const job = jobsCache.find(j => j.id === currentJobId);
    if (!job) return;

    // Si el mecánico marca el trabajo como finalizado, abrir el formulario oficial de entrega y salida
    if (selectedStatus === JOB_STATUS.FINISHED) {
        if (statusModal) statusModal.classList.remove('active');
        openExitModal(job);
        return;
    }

    const now = serverTimestamp();
    const b = getJobTimeBreakdown(job);

    const updateData = {
        status: selectedStatus,
        lastStatusChange: now,
        activeTimeSeconds: b.activeSeconds,
        pausedPartsSeconds: b.pausedPartsSeconds,
        pausedExitSeconds: b.pausedExitSeconds,
        totalTimeSeconds: b.activeSeconds
    };

    if (selectedStatus === JOB_STATUS.WORKING && !job.startTime) {
        updateData.startTime = now;
    }

    // Actualización local inmediata
    job.status = selectedStatus;
    job.lastStatusChange = new Date();
    job.activeTimeSeconds = b.activeSeconds;
    job.pausedPartsSeconds = b.pausedPartsSeconds;
    job.pausedExitSeconds = b.pausedExitSeconds;
    job.totalTimeSeconds = b.activeSeconds;
    if (selectedStatus === JOB_STATUS.WORKING && !job.startTime) {
        job.startTime = new Date();
    }
    renderJobs(jobsCache);

    // Modo offline
    if (!navigator.onLine) {
        try {
            await enqueueOfflineOperation('UPDATE_JOB_STATUS', {
                jobId: currentJobId,
                status: selectedStatus,
                activeTimeSeconds: b.activeSeconds,
                pausedPartsSeconds: b.pausedPartsSeconds,
                pausedExitSeconds: b.pausedExitSeconds,
                totalTimeSeconds: b.activeSeconds
            });
            statusModal.classList.remove('active');
            showStatus('Estado guardado localmente (Offline). Se sincronizará al conectar.', 'info');
        } catch (e) {
            alert("Error guardando estado offline: " + e.message);
        }
        return;
    }

    try {
        confirmStatusUpdate.disabled = true;
        confirmStatusUpdate.textContent = 'Actualizando...';

        const jobRef = doc(db, "Trabajos", currentJobId);
        await updateDoc(jobRef, updateData);

        statusModal.classList.remove('active');
        showStatus('Estado y control de tiempo actualizados', 'success');
    } catch (err) {
        console.error("Error al actualizar estado:", err);
        alert(`Error al actualizar estado: ${err.message}`);
    } finally {
        confirmStatusUpdate.disabled = false;
        confirmStatusUpdate.textContent = 'Actualizar';
    }
}

// ==============================================================
// GESTIÓN DEL MODAL DE SALIDA / ENTREGA DE UNIDADES
// ==============================================================

function setupExitModalHandlers() {
    if (!exitModal) return;

    // Toggle de mismo chofer vs diferente chofer
    if (sameDriverCheck) {
        sameDriverCheck.addEventListener('change', () => {
            const isSame = sameDriverCheck.checked;
            if (sameDriverInfoBox) sameDriverInfoBox.style.display = isSame ? 'block' : 'none';
            if (differentDriverFields) differentDriverFields.style.display = isSame ? 'none' : 'block';
        });
    }

    // Manejo de captura de foto INE Frente
    if (exitIneFrontInput) {
        exitIneFrontInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            exitIneFrontFile = file;

            const reader = new FileReader();
            reader.onload = (event) => {
                if (exitIneFrontImg) exitIneFrontImg.src = event.target.result;
                if (exitIneFrontPlaceholder) exitIneFrontPlaceholder.style.display = 'none';
                if (exitIneFrontPreview) exitIneFrontPreview.style.display = 'flex';
            };
            reader.readAsDataURL(file);
        });
    }

    if (removeExitIneFrontBtn) {
        removeExitIneFrontBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exitIneFrontFile = null;
            if (exitIneFrontInput) exitIneFrontInput.value = '';
            if (exitIneFrontImg) exitIneFrontImg.src = '';
            if (exitIneFrontPreview) exitIneFrontPreview.style.display = 'none';
            if (exitIneFrontPlaceholder) exitIneFrontPlaceholder.style.display = 'flex';
        });
    }

    // Manejo de captura de foto INE Reverso
    if (exitIneBackInput) {
        exitIneBackInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            exitIneBackFile = file;

            const reader = new FileReader();
            reader.onload = (event) => {
                if (exitIneBackImg) exitIneBackImg.src = event.target.result;
                if (exitIneBackPlaceholder) exitIneBackPlaceholder.style.display = 'none';
                if (exitIneBackPreview) exitIneBackPreview.style.display = 'flex';
            };
            reader.readAsDataURL(file);
        });
    }

    if (removeExitIneBackBtn) {
        removeExitIneBackBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exitIneBackFile = null;
            if (exitIneBackInput) exitIneBackInput.value = '';
            if (exitIneBackImg) exitIneBackImg.src = '';
            if (exitIneBackPreview) exitIneBackPreview.style.display = 'none';
            if (exitIneBackPlaceholder) exitIneBackPlaceholder.style.display = 'flex';
        });
    }

    // Confirmar entrega y finalizar
    if (confirmExitAndFinishBtn) {
        confirmExitAndFinishBtn.addEventListener('click', handleConfirmExitAndFinish);
    }
}

function resetExitIneInputs() {
    exitIneFrontFile = null;
    exitIneBackFile = null;

    if (exitIneFrontInput) exitIneFrontInput.value = '';
    if (exitIneFrontImg) exitIneFrontImg.src = '';
    if (exitIneFrontPreview) exitIneFrontPreview.style.display = 'none';
    if (exitIneFrontPlaceholder) exitIneFrontPlaceholder.style.display = 'flex';

    if (exitIneBackInput) exitIneBackInput.value = '';
    if (exitIneBackImg) exitIneBackImg.src = '';
    if (exitIneBackPreview) exitIneBackPreview.style.display = 'none';
    if (exitIneBackPlaceholder) exitIneBackPlaceholder.style.display = 'flex';

    if (exitDriverNameInput) exitDriverNameInput.value = '';
}

function openExitModal(job) {
    if (!job || !exitModal) return;
    pendingExitJob = job;

    // Validación de fecha: no puede ser anterior a la actual
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    if (exitDateInput) {
        exitDateInput.min = todayStr;
        exitDateInput.value = todayStr;
    }

    // Auto-completar datos preexistentes del trabajo
    if (exitPlatesInput) {
        exitPlatesInput.value = job.vehicle?.plates || '';
    }
    if (exitModelInput) {
        exitModelInput.value = job.vehicle?.model || job.vehicle?.unit || '';
    }
    if (exitCompanyInput) {
        exitCompanyInput.value = job.entryDriver?.company || job.client?.company || job.workDetails?.driverCompany || '';
    }
    if (exitReportByInput) {
        exitReportByInput.value = currentMechanic?.fullName || currentMechanic?.name || 'Taller Mecánico Alfonso';
    }

    // Resumen del chofer de entrada
    const entry = job.entryDriver || {};
    const entryName = entry.driverName || job.workDetails?.driverName || 'Sin registrar';
    const entryCompany = entry.company || job.client?.company || job.workDetails?.driverCompany || 'N/A';

    if (sameDriverSummary) {
        sameDriverSummary.innerHTML = `<strong>Chofer Registrado al Ingreso:</strong> ${escapeHtml(entryName)} &bull; <strong>Empresa:</strong> ${escapeHtml(entryCompany)}`;
    }

    // Miniaturas de la INE del chofer de entrada si existen
    if (entryInePreviews) {
        entryInePreviews.innerHTML = '';
        if (entry.ineFrontUrl) {
            entryInePreviews.innerHTML += `
                <div style="text-align: center;">
                    <span style="display: block; font-size: 11px; color: #64748b; margin-bottom: 2px;">INE Frente</span>
                    <a href="${entry.ineFrontUrl}" target="_blank" rel="noopener">
                        <img src="${entry.ineFrontUrl}" alt="INE Frente" style="width: 75px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1;">
                    </a>
                </div>
            `;
        }
        if (entry.ineBackUrl) {
            entryInePreviews.innerHTML += `
                <div style="text-align: center;">
                    <span style="display: block; font-size: 11px; color: #64748b; margin-bottom: 2px;">INE Reverso</span>
                    <a href="${entry.ineBackUrl}" target="_blank" rel="noopener">
                        <img src="${entry.ineBackUrl}" alt="INE Reverso" style="width: 75px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1;">
                    </a>
                </div>
            `;
        }
        if (!entry.ineFrontUrl && !entry.ineBackUrl) {
            entryInePreviews.innerHTML = `<span style="font-size: 11.5px; color: #94a3b8; font-style: italic;">No se capturaron fotos de INE al ingreso.</span>`;
        }
    }

    // Estado por defecto del selector inteligente
    if (sameDriverCheck) sameDriverCheck.checked = true;
    if (sameDriverInfoBox) sameDriverInfoBox.style.display = 'block';
    if (differentDriverFields) differentDriverFields.style.display = 'none';

    resetExitIneInputs();
    exitModal.classList.add('active');
}

async function handleConfirmExitAndFinish() {
    if (!pendingExitJob) return;

    const valDate = exitDateInput ? exitDateInput.value : '';
    const todayStr = new Date().toISOString().split('T')[0];

    // Validación estricta de fecha: no puede ser antes de la fecha actual
    if (!valDate || valDate < todayStr) {
        alert("La fecha de entrega es obligatoria y no puede ser anterior a la fecha actual.");
        if (exitDateInput) exitDateInput.focus();
        return;
    }

    const plates = exitPlatesInput ? exitPlatesInput.value.trim() : '';
    const model = exitModelInput ? exitModelInput.value.trim() : '';
    const company = exitCompanyInput ? exitCompanyInput.value.trim() : '';

    if (!plates || !model || !company) {
        alert("Por favor completa los campos requeridos: Placas, Modelo y Nombre de la Empresa.");
        return;
    }

    const isSame = sameDriverCheck ? sameDriverCheck.checked : true;
    const entry = pendingExitJob.entryDriver || {};
    let finalDriverName = '';
    let finalIneFrontUrl = '';
    let finalIneBackUrl = '';

    if (isSame) {
        finalDriverName = entry.driverName || pendingExitJob.workDetails?.driverName || '';
        finalIneFrontUrl = entry.ineFrontUrl || '';
        finalIneBackUrl = entry.ineBackUrl || '';
    } else {
        finalDriverName = exitDriverNameInput ? exitDriverNameInput.value.trim() : '';

        if (!finalDriverName) {
            alert("Por favor indica el nombre del nuevo chofer que retira la unidad.");
            if (exitDriverNameInput) exitDriverNameInput.focus();
            return;
        }
    }

    const reportedBy = exitReportByInput ? exitReportByInput.value.trim() : (currentMechanic?.fullName || 'Taller Mecánico Alfonso');

    try {
        confirmExitAndFinishBtn.disabled = true;
        confirmExitAndFinishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando entrega...';

        // Subir fotos de INE del nuevo chofer si se capturaron
        if (!isSame && (exitIneFrontFile || exitIneBackFile)) {
            const cleanUnit = (pendingExitJob.vehicle?.unit || 'unidad').replace(/[^a-zA-Z0-9_-]/g, '_');
            const timestamp = Date.now();

            if (exitIneFrontFile) {
                confirmExitAndFinishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo INE Frente...';
                const sRef = storageRef(storage, `trabajos/ine/${cleanUnit}_salida_frente_${timestamp}`);
                await uploadBytesResumable(sRef, exitIneFrontFile);
                finalIneFrontUrl = await getDownloadURL(sRef);
            }

            if (exitIneBackFile) {
                confirmExitAndFinishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo INE Reverso...';
                const sRef = storageRef(storage, `trabajos/ine/${cleanUnit}_salida_reverso_${timestamp}`);
                await uploadBytesResumable(sRef, exitIneBackFile);
                finalIneBackUrl = await getDownloadURL(sRef);
            }
        }

        const exitDriverData = {
            exitDate: valDate,
            plates: plates,
            model: model,
            company: company,
            isSameDriver: isSame,
            driverName: finalDriverName,
            ineFrontUrl: finalIneFrontUrl,
            ineBackUrl: finalIneBackUrl,
            reportedBy: reportedBy,
            completedAt: new Date().toISOString()
        };

        const now = serverTimestamp();
        const b = getJobTimeBreakdown(pendingExitJob);

        const updateData = {
            status: JOB_STATUS.FINISHED,
            lastStatusChange: now,
            endTime: now,
            activeTimeSeconds: b.activeSeconds,
            pausedPartsSeconds: b.pausedPartsSeconds,
            pausedExitSeconds: b.pausedExitSeconds,
            totalTimeSeconds: b.activeSeconds,
            exitDriver: exitDriverData
        };

        // Modo offline
        if (!navigator.onLine) {
            await enqueueOfflineOperation('UPDATE_JOB_STATUS_AND_EXIT', {
                jobId: pendingExitJob.id,
                ...updateData,
                exitDriver: exitDriverData
            });
            exitModal.classList.remove('active');
            showStatus('Entrega registrada localmente (Offline). Se sincronizará al conectar.', 'info');
        } else {
            const jobRef = doc(db, "Trabajos", pendingExitJob.id);
            await updateDoc(jobRef, updateData);
        }

        // Actualización local inmediata
        pendingExitJob.status = JOB_STATUS.FINISHED;
        pendingExitJob.endTime = new Date();
        pendingExitJob.exitDriver = exitDriverData;
        renderJobs(jobsCache);

        exitModal.classList.remove('active');
        showStatus('Trabajo finalizado y registro de salida completado con éxito.', 'success');

        // Preguntar al mecánico si desea generar y descargar el reporte de Entrada y Salida
        setTimeout(async () => {
            const wantsPdf = confirm("¡Trabajo finalizado con éxito!\n\n¿Deseas generar y descargar el Reporte Oficial de Entrada y Salida (PDF) ahora mismo?");
            if (wantsPdf) {
                try {
                    await generateEntryExitReport(pendingExitJob);
                } catch (pdfErr) {
                    console.error("Error generando PDF de Entrada y Salida:", pdfErr);
                    alert("No se pudo generar el PDF automáticamente: " + pdfErr.message);
                }
            }
        }, 300);

    } catch (err) {
        console.error("Error al finalizar trabajo y registrar salida:", err);
        alert(`Error al registrar salida: ${err.message}`);
    } finally {
        confirmExitAndFinishBtn.disabled = false;
        confirmExitAndFinishBtn.innerHTML = '<i class="fas fa-check-double"></i> Confirmar Entrega y Finalizar';
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
