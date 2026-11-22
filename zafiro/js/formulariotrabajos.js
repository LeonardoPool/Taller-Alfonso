// Formulario de Trabajos para Mecánicos - Portal Mecánicos (Zafiro)
import { checkMechanicAuth } from './auth-guard.js';
import { 
    db, 
    storage, 
    collection, 
    getDocs, 
    doc, 
    setDoc, 
    serverTimestamp, 
    storageRef, 
    uploadBytesResumable, 
    getDownloadURL 
} from './firebase-config.js';
import { enqueueOfflineOperation } from './pwa-manager.js';

let currentMechanic = null;
const imageFiles = {
    interior: [],
    exterior: [],
    rear: [],
    front: [],
    left: [],
    right: [],
    plate: [],
    engine: [],
    mirror: [],
    rearview: []
};

let usedParts = [];
let modalParts = [];
let selectedParts = [];

// Elementos DOM
const jobForm = document.getElementById('jobForm');
const submitBtn = document.getElementById('submitJob');
const statusMessage = document.getElementById('statusMessage');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const accessVerification = document.getElementById('accessVerification');
const mainContent = document.getElementById('mainContent');

const clientNameInput = document.getElementById('clientName');
const companyInput = document.getElementById('company');
const clientResults = document.getElementById('clientResults');
const usedPartsList = document.getElementById('usedPartsList');
const partsModal = document.getElementById('partsModal');
const partsListContainer = document.getElementById('partsListContainer');
const modalSearchInput = document.getElementById('modalSearchInput');
const modalSearchBtn = document.getElementById('modalSearchBtn');
const addPartsBtn = document.getElementById('addPartsBtn');

function onReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

onReady(async () => {
    currentMechanic = await checkMechanicAuth();
    if (!currentMechanic) {
        if (accessVerification) {
            accessVerification.innerHTML = `
                <div style="text-align:center;padding:40px;color:#fff;">
                    <i class="fas fa-exclamation-triangle" style="font-size:48px;color:#e74c3c;"></i>
                    <h2 style="margin-top:20px;">Acceso no autorizado</h2>
                    <p style="margin-top:10px;color:#ccc;">Debes iniciar sesión con tu PIN de mecánico.</p>
                    <a href="index.html" class="btn btn-primary" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#4a6cf7;color:#fff;text-decoration:none;border-radius:6px;">Iniciar Sesión</a>
                </div>
            `;
        }
        return;
    }

    if (accessVerification) accessVerification.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';

    setupClientSearch();
    setupPartsModal();
    setupPhotoUploads();
    setupFormSubmit();
});

// Caché en memoria para evitar consultas repetitivas a Firestore durante la captura
let clientsCache = null;
let lastClientsFetch = 0;
let allPartsCache = null;
let lastPartsFetch = 0;

async function getCachedClients() {
    const now = Date.now();
    if (clientsCache && (now - lastClientsFetch) < 300000) {
        return clientsCache;
    }
    const snapshot = await getDocs(collection(db, "Clientes"));
    clientsCache = [];
    snapshot.forEach(docSnap => {
        clientsCache.push({ id: docSnap.id, ...docSnap.data() });
    });
    lastClientsFetch = now;
    return clientsCache;
}

async function getCachedParts() {
    const now = Date.now();
    if (allPartsCache && (now - lastPartsFetch) < 300000) {
        return allPartsCache;
    }
    const snapshot = await getDocs(collection(db, "Piezas"));
    allPartsCache = [];
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        allPartsCache.push({
            id: docSnap.id,
            name: data.partName || data.nombre || "Pieza",
            serial: data.serialNumber || data.codigo || "-",
            stock: Number(data.stock) || 0
        });
    });
    lastPartsFetch = now;
    return allPartsCache;
}

function setupClientSearch() {
    if (!clientNameInput || !clientResults) return;

    let debounce = null;
    clientNameInput.addEventListener('input', () => {
        clearTimeout(debounce);
        const term = clientNameInput.value.trim().toLowerCase();
        if (term.length < 2) {
            clientResults.style.display = 'none';
            return;
        }

        debounce = setTimeout(async () => {
            try {
                // Utiliza la caché local en memoria para no disparar lecturas en cada tecla
                const clients = await getCachedClients();
                clientResults.innerHTML = '';
                let count = 0;

                clients.forEach(c => {
                    const name = (c.clientName || '').toLowerCase();
                    const comp = (c.company || '').toLowerCase();

                    if (name.includes(term) || comp.includes(term)) {
                        count++;
                        const div = document.createElement('div');
                        div.style.padding = '8px 12px';
                        div.style.cursor = 'pointer';
                        div.style.borderBottom = '1px solid #444';
                        div.innerHTML = `<strong>${escapeHtml(c.clientName)}</strong> <span style="color:#aaa;">(${escapeHtml(c.company || 'Particular')})</span>`;

                        div.addEventListener('click', () => {
                            clientNameInput.value = c.clientName || '';
                            if (companyInput) companyInput.value = c.company || '';
                            clientResults.style.display = 'none';
                        });

                        clientResults.appendChild(div);
                    }
                });

                clientResults.style.display = count > 0 ? 'block' : 'none';
            } catch (err) {
                console.warn("Error buscando clientes:", err);
            }
        }, 200);
    });

    document.addEventListener('click', (e) => {
        if (!clientNameInput.contains(e.target) && !clientResults.contains(e.target)) {
            clientResults.style.display = 'none';
        }
    });
}

function setupPartsModal() {
    const searchPartBtn = document.getElementById('searchPartBtn');
    const closeModalBtn = document.querySelector('.close-modal');
    const cancelModalBtn = document.querySelector('.cancel-modal-btn');

    if (searchPartBtn && partsModal) {
        searchPartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loadParts();
            partsModal.style.display = 'block';
        });
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', () => partsModal.style.display = 'none');
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', () => partsModal.style.display = 'none');

    if (modalSearchBtn && modalSearchInput) {
        modalSearchBtn.addEventListener('click', () => loadParts(modalSearchInput.value.trim()));
    }

    if (addPartsBtn) {
        addPartsBtn.addEventListener('click', () => {
            selectedParts.forEach(p => {
                if (!usedParts.some(u => u.id === p.id)) usedParts.push(p);
            });
            renderUsedParts();
            selectedParts = [];
            if (partsModal) partsModal.style.display = 'none';
        });
    }
}

async function loadParts(filter = '') {
    if (!partsListContainer) return;
    partsListContainer.innerHTML = '<p style="padding:15px;color:#ccc;">Cargando almacén...</p>';

    try {
        const parts = await getCachedParts();
        const term = filter.toLowerCase();
        modalParts = parts.filter(part => {
            return !term || part.name.toLowerCase().includes(term) || part.serial.toLowerCase().includes(term);
        });

        if (modalParts.length === 0) {
            partsListContainer.innerHTML = '<p style="padding:15px;color:#aaa;">No se encontraron piezas en el almacén.</p>';
            return;
        }

        partsListContainer.innerHTML = '';
        modalParts.forEach(part => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.padding = '8px 12px';
            div.style.borderBottom = '1px solid #444';
            div.style.gap = '10px';

            const isChecked = selectedParts.some(p => p.id === part.id);
            div.innerHTML = `
                <input type="checkbox" id="chk_z_${part.id}" ${isChecked ? 'checked' : ''} style="width:18px;height:18px;">
                <label for="chk_z_${part.id}" style="flex:1;cursor:pointer;color:#fff;margin:0;">
                    <strong>${escapeHtml(part.name)}</strong>
                    <span style="display:block;font-size:12px;color:#aaa;">Código: ${escapeHtml(part.serial)} | Stock: ${part.stock}</span>
                </label>
            `;

            const chk = div.querySelector('input');
            chk.addEventListener('change', () => {
                if (chk.checked) selectedParts.push(part);
                else selectedParts = selectedParts.filter(p => p.id !== part.id);
            });

            partsListContainer.appendChild(div);
        });
    } catch (err) {
        console.error("Error al cargar piezas:", err);
        partsListContainer.innerHTML = `<p style="padding:15px;color:#e74c3c;">Error: ${err.message}</p>`;
    }
}

function renderUsedParts() {
    if (!usedPartsList) return;
    usedPartsList.innerHTML = '';

    if (usedParts.length === 0) {
        usedPartsList.innerHTML = '<p style="color:#aaa;font-style:italic;">No hay piezas agregadas aún.</p>';
        return;
    }

    usedParts.forEach((part, index) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '8px 12px';
        div.style.background = 'rgba(255,255,255,0.06)';
        div.style.borderRadius = '6px';
        div.style.marginBottom = '6px';

        div.innerHTML = `
            <div>
                <strong style="color:#fff;">${escapeHtml(part.name)}</strong>
                <span style="font-size:12px;color:#aaa;margin-left:6px;">(${escapeHtml(part.serial)})</span>
            </div>
            <button type="button" style="background:none;border:none;color:#e74c3c;cursor:pointer;" title="Eliminar">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;

        div.querySelector('button').addEventListener('click', () => {
            usedParts.splice(index, 1);
            renderUsedParts();
        });

        usedPartsList.appendChild(div);
    });
}

function setupPhotoUploads() {
    Object.keys(imageFiles).forEach(cat => {
        const input = document.getElementById(`${cat}Photos`);
        const preview = document.getElementById(`${cat}Preview`);
        if (input && preview) {
            input.addEventListener('change', (e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) {
                    imageFiles[cat] = imageFiles[cat].concat(files);
                    renderPreviews(cat, preview);
                }
                input.value = '';
            });
        }
    });
}

function renderPreviews(cat, container) {
    container.innerHTML = '';
    const counter = document.getElementById(`${cat}Count`);
    if (counter) {
        counter.textContent = imageFiles[cat].length;
    }

    imageFiles[cat].forEach((file, index) => {
        const div = document.createElement('div');
        div.style.position = 'relative';
        div.style.display = 'inline-block';
        div.style.margin = '4px';

        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.style.width = '65px';
        img.style.height = '65px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '6px';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = '&times;';
        btn.style.position = 'absolute';
        btn.style.top = '-4px';
        btn.style.right = '-4px';
        btn.style.background = '#e74c3c';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '50%';
        btn.style.width = '18px';
        btn.style.height = '18px';
        btn.style.cursor = 'pointer';

        btn.addEventListener('click', () => {
            imageFiles[cat].splice(index, 1);
            renderPreviews(cat, container);
        });

        div.appendChild(img);
        div.appendChild(btn);
        container.appendChild(div);
    });
}

function setupFormSubmit() {
    if (!jobForm) return;

    jobForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const clientName = clientNameInput?.value?.trim();
        const unit = document.getElementById('unit')?.value?.trim();
        const driverName = document.getElementById('driverName')?.value?.trim();
        const diagnosis = document.getElementById('diagnosis')?.value?.trim();

        if (!clientName || !unit || !driverName || !diagnosis) {
            alert("Por favor completa los campos obligatorios: Cliente, Unidad, Chofer y Diagnóstico.");
            return;
        }

        // Manejo de modo sin conexión
        if (!navigator.onLine) {
            const hasImages = Object.values(imageFiles).some(files => files.length > 0);
            if (hasImages) {
                alert("Estás sin conexión a internet. La subida de fotografías requiere conexión a la red. Conéctate a internet para registrar la orden con imágenes.");
                return;
            }

            try {
                const engineStartEl = document.querySelector('input[name="engineStart"]:checked');
                const hasSpareEl = document.querySelector('input[name="hasSpare"]:checked');

                const offlineJob = {
                    client: {
                        name: clientName,
                        company: companyInput?.value?.trim() || "Particular"
                    },
                    vehicle: {
                        unit: unit,
                        engineNumber: document.getElementById('engineNumber')?.value?.trim() || "N/A",
                        plates: document.getElementById('plates')?.value?.trim() || "N/A"
                    },
                    workDetails: {
                        driverName: driverName,
                        diagnosis: diagnosis,
                        engineStart: engineStartEl ? engineStartEl.value : "no_especificado",
                        hasSpare: hasSpareEl ? hasSpareEl.value : "no_especificado",
                        usedParts: usedParts
                    },
                    mechanic: currentMechanic?.fullName || "Mecánico",
                    status: "trabajando",
                    totalTimeSeconds: 0,
                    createdAt: new Date().toISOString()
                };

                await enqueueOfflineOperation('CREATE_JOB', offlineJob);
                if (statusMessage) {
                    statusMessage.innerHTML = `<i class="fas fa-clock"></i> Trabajo guardado localmente (Modo offline). Se enviará al servidor al recuperar conexión.`;
                    statusMessage.className = 'status-message info';
                    statusMessage.style.display = 'block';
                }
                jobForm.reset();
                usedParts = [];
                renderUsedPartsList();
            } catch (err) {
                alert("Error al guardar trabajo offline: " + err.message);
            }
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando Trabajo...';

        if (progressContainer) {
            progressContainer.style.display = 'block';
            progressBar.style.width = '10%';
            progressText.textContent = 'Subiendo evidencias...';
        }

        try {
            const uploadedPhotos = {};
            const categories = Object.keys(imageFiles);

            for (const cat of categories) {
                const files = imageFiles[cat];
                if (files.length > 0) {
                    uploadedPhotos[cat] = [];
                    for (const file of files) {
                        try {
                            const cleanUnit = (unit || 'unidad').replace(/[^a-zA-Z0-9_-]/g, '_');
                            const cleanName = (file.name || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
                            const sRef = storageRef(storage, `trabajos/${cleanUnit}_${Date.now()}_${cleanName}`);
                            const uploadTask = await uploadBytesResumable(sRef, file);
                            const downloadUrl = await getDownloadURL(uploadTask.ref);
                            uploadedPhotos[cat].push(downloadUrl);
                        } catch (fileErr) {
                            console.warn(`[Zafiro] Error al subir foto ${file.name}:`, fileErr);
                        }
                    }
                }
            }

            if (progressBar) progressBar.style.width = '80%';
            if (progressText) progressText.textContent = 'Guardando orden en Firestore...';

            const engineStartEl = document.querySelector('input[name="engineStart"]:checked');
            const hasSpareEl = document.querySelector('input[name="hasSpare"]:checked');

            const jobData = {
                client: {
                    name: clientName,
                    company: companyInput?.value?.trim() || "Particular"
                },
                vehicle: {
                    unit: unit,
                    engineNumber: document.getElementById('engineNumber')?.value?.trim() || "",
                    plates: document.getElementById('plates')?.value?.trim() || "",
                    dieselLevel: document.getElementById('dieselLevel')?.value || "1/2",
                    tireCondition: document.getElementById('tireCondition')?.value || "Bueno",
                    oilPressure: document.getElementById('oilPressure')?.value || "Normal",
                    interiorCondition: document.getElementById('interiorCondition')?.value || "Bueno",
                    engineStart: engineStartEl ? engineStartEl.value : "si",
                    engineNotes: document.getElementById('engineNotes')?.value?.trim() || "",
                    engineSize: document.getElementById('engineSize')?.value?.trim() || ""
                },
                workDetails: {
                    hasSpare: hasSpareEl ? hasSpareEl.value : "no",
                    driverName: driverName,
                    diagnosis: diagnosis,
                    additionalNotes: document.getElementById('additionalNotes')?.value?.trim() || "",
                    usedParts: usedParts.map(p => ({ id: p.id, name: p.name, serial: p.serial })),
                    outsideParts: document.getElementById('outsideParts')?.value?.trim() || ""
                },
                usedParts: usedParts.map(p => ({ id: p.id, name: p.name, serial: p.serial })),
                mechanic: currentMechanic.fullName,
                status: "Trabajo abierto",
                totalTimeSeconds: 0,
                photos: uploadedPhotos,
                createdAt: serverTimestamp()
            };

            const newDocRef = doc(collection(db, "Trabajos"));
            await setDoc(newDocRef, jobData);

            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = '¡Trabajo registrado con éxito!';

            if (statusMessage) {
                statusMessage.innerHTML = `<i class="fas fa-check-circle"></i> ¡Trabajo registrado con éxito! (ID: ${newDocRef.id})`;
                statusMessage.className = 'status-message success';
                statusMessage.style.display = 'block';
            }

            jobForm.reset();
            usedParts = [];
            renderUsedParts();
            Object.keys(imageFiles).forEach(k => imageFiles[k] = []);
            document.querySelectorAll('[id$="Preview"]').forEach(c => c.innerHTML = '');
            document.querySelectorAll('[id$="Count"]').forEach(c => c.textContent = '0');

            setTimeout(() => {
                window.location.href = 'admin.html';
            }, 2000);
        } catch (err) {
            console.error("Error al registrar trabajo:", err);
            if (statusMessage) {
                statusMessage.innerHTML = `<i class="fas fa-exclamation-circle"></i> Error: ${err.message}`;
                statusMessage.className = 'status-message error';
                statusMessage.style.display = 'block';
            }
            if (progressContainer) progressContainer.style.display = 'none';
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Trabajo';
        }
    });
}

// Botón cancelar
const cancelBtn = document.querySelector('.cancel-btn');
if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'admin.html';
    });
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
