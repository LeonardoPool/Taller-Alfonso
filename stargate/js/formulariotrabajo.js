// Formulario de Registro de Orden de Trabajo - Portal Administrativo (Stargate)
import { initAuthGuard } from './auth-guard.js';
import { 
    db, 
    storage, 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    setDoc, 
    serverTimestamp, 
    storageRef, 
    uploadBytesResumable, 
    getDownloadURL 
} from './firebase-config.js';

// Archivos de imagen por categoría
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

// Clientes y Piezas
const clientNameInput = document.getElementById('clientName');
const companyInput = document.getElementById('company');
const clientResults = document.getElementById('clientResults');
const assignedMechanicSelect = document.getElementById('assignedMechanic');
const usedPartsList = document.getElementById('usedPartsList');
const partSearchInput = document.getElementById('partSearch');
const partResults = document.getElementById('partResults');
const searchPartBtn = document.getElementById('searchPartBtn');

function onReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

onReady(() => {
    initAuthGuard(() => {
        loadMechanicsList();
        setupClientSearch();
        setupPartsSearch();
        setupPhotoUploads();
        setupFormSubmit();
    });
});

async function loadMechanicsList() {
    if (!assignedMechanicSelect) return;
    try {
        const q = query(collection(db, "colaboradores"), where("tipoEmpleado", "==", "Mecánico"));
        const snapshot = await getDocs(q);

        assignedMechanicSelect.innerHTML = '<option value="">-- Sin asignar (Seleccionar mecánico) --</option>';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const fullName = data.fullName || 'Mecánico';
            const opt = document.createElement('option');
            opt.value = fullName;
            opt.textContent = fullName;
            assignedMechanicSelect.appendChild(opt);
        });
    } catch (err) {
        console.warn("Error cargando mecánicos en formulario:", err);
    }
}

// Búsqueda interactiva de clientes
function setupClientSearch() {
    if (!clientNameInput || !clientResults) return;

    let debounceTimer = null;
    clientNameInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const term = clientNameInput.value.trim().toLowerCase();

        if (term.length < 2) {
            clientResults.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const snapshot = await getDocs(collection(db, "Clientes"));
                clientResults.innerHTML = '';
                let count = 0;

                snapshot.forEach(docSnap => {
                    const client = docSnap.data();
                    const name = (client.clientName || '').toLowerCase();
                    const comp = (client.company || '').toLowerCase();

                    if (name.includes(term) || comp.includes(term)) {
                        count++;
                        const div = document.createElement('div');
                        div.className = 'client-result-item';
                        div.style.padding = '8px 12px';
                        div.style.cursor = 'pointer';
                        div.style.borderBottom = '1px solid #eee';
                        div.innerHTML = `<strong>${escapeHtml(client.clientName)}</strong> <span style="color:#777;">(${escapeHtml(client.company || 'Particular')})</span>`;

                        div.addEventListener('click', () => {
                            clientNameInput.value = client.clientName || '';
                            if (companyInput) companyInput.value = client.company || '';
                            clientResults.style.display = 'none';
                        });

                        clientResults.appendChild(div);
                    }
                });

                clientResults.style.display = count > 0 ? 'block' : 'none';
            } catch (err) {
                console.warn("Error buscando clientes:", err);
            }
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (!clientNameInput.contains(e.target) && !clientResults.contains(e.target)) {
            clientResults.style.display = 'none';
        }
    });
}

// Búsqueda y selección de piezas de almacén
function setupPartsSearch() {
    if (!partSearchInput) return;

    let searchTimeout = null;

    async function handlePartSearch() {
        const searchTerm = partSearchInput.value.trim().toLowerCase();
        if (!searchTerm) {
            if (partResults) partResults.style.display = 'none';
            return;
        }

        try {
            const snapshot = await getDocs(collection(db, "Piezas"));
            const parts = [];

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const name = data.partName || data.nombre || '';
                const serial = data.serialNumber || data.codigo || '';
                if (name.toLowerCase().includes(searchTerm) || serial.toLowerCase().includes(searchTerm)) {
                    parts.push({
                        id: docSnap.id,
                        name: name || 'Pieza sin nombre',
                        serial: serial || '-'
                    });
                }
            });

            if (!partResults) return;
            partResults.innerHTML = '';

            if (parts.length === 0) {
                partResults.style.display = 'block';
                partResults.innerHTML = '<div class="autocomplete-item" style="padding:10px;color:#888;">No se encontraron piezas</div>';
                return;
            }

            parts.forEach(part => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.style.cssText = 'padding:10px 15px;cursor:pointer;border-bottom:1px solid #eee;';
                item.innerHTML = `<strong>${escapeHtml(part.name)}</strong> - <small style="color:#666;">Serie: ${escapeHtml(part.serial)}</small>`;
                item.addEventListener('click', () => {
                    addUsedPart(part);
                    partSearchInput.value = '';
                    partResults.style.display = 'none';
                });
                partResults.appendChild(item);
            });

            partResults.style.display = 'block';
        } catch (err) {
            console.error("Error buscando piezas:", err);
        }
    }

    partSearchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(handlePartSearch, 250);
    });

    if (searchPartBtn) {
        searchPartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handlePartSearch();
        });
    }

    document.addEventListener('click', (e) => {
        if (partResults && !partResults.contains(e.target) && e.target !== partSearchInput && e.target !== searchPartBtn) {
            partResults.style.display = 'none';
        }
    });
}

function addUsedPart(part) {
    if (usedParts.some(p => p.id === part.id)) {
        alert("Esta pieza ya ha sido agregada");
        return;
    }
    usedParts.push(part);
    renderUsedPartsList();
}

function renderUsedPartsList() {
    if (!usedPartsList) return;
    usedPartsList.innerHTML = '';

    if (usedParts.length === 0) {
        usedPartsList.innerHTML = '<p style="color:#777;font-style:italic;">No hay piezas seleccionadas aún.</p>';
        return;
    }

    usedParts.forEach((part, index) => {
        const div = document.createElement('div');
        div.className = 'used-part-item';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '8px 12px';
        div.style.background = '#f8f9fa';
        div.style.borderRadius = '6px';
        div.style.marginBottom = '6px';

        div.innerHTML = `
            <div>
                <strong>${escapeHtml(part.name)}</strong>
                <span style="font-size:12px;color:#666;margin-left:8px;">(${escapeHtml(part.serial)})</span>
            </div>
            <button type="button" class="btn-remove" style="background:none;border:none;color:#e74c3c;cursor:pointer;" title="Eliminar">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;

        div.querySelector('.btn-remove').addEventListener('click', () => {
            usedParts.splice(index, 1);
            renderUsedPartsList();
        });

        usedPartsList.appendChild(div);
    });
}

// Configuración de subida de imágenes con previsualización
function setupPhotoUploads() {
    const categories = Object.keys(imageFiles);

    categories.forEach(cat => {
        const input = document.getElementById(`${cat}Photos`);
        const previewContainer = document.getElementById(`${cat}Preview`);

        if (input && previewContainer) {
            input.addEventListener('change', (e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) {
                    imageFiles[cat] = imageFiles[cat].concat(files);
                    renderCategoryPreviews(cat, previewContainer);
                }
                input.value = '';
            });
        }
    });
}

function renderCategoryPreviews(cat, container) {
    container.innerHTML = '';
    const counter = document.getElementById(`${cat}Count`);
    if (counter) {
        counter.textContent = imageFiles[cat].length;
    }

    imageFiles[cat].forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.style.position = 'relative';
        div.style.display = 'inline-block';
        div.style.margin = '4px';

        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.style.width = '70px';
        img.style.height = '70px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '6px';
        img.style.border = '1px solid #ddd';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.innerHTML = '&times;';
        removeBtn.style.position = 'absolute';
        removeBtn.style.top = '-5px';
        removeBtn.style.right = '-5px';
        removeBtn.style.background = '#e74c3c';
        removeBtn.style.color = 'white';
        removeBtn.style.border = 'none';
        removeBtn.style.borderRadius = '50%';
        removeBtn.style.width = '20px';
        removeBtn.style.height = '20px';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.display = 'flex';
        removeBtn.style.alignItems = 'center';
        removeBtn.style.justifyContent = 'center';

        removeBtn.addEventListener('click', () => {
            imageFiles[cat].splice(index, 1);
            renderCategoryPreviews(cat, container);
        });

        div.appendChild(img);
        div.appendChild(removeBtn);
        container.appendChild(div);
    });
}

// Envío del Formulario
function setupFormSubmit() {
    if (!jobForm) return;

    jobForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Validaciones básicas
        const clientName = clientNameInput?.value?.trim();
        const unit = document.getElementById('unit')?.value?.trim();
        const driverName = document.getElementById('driverName')?.value?.trim();
        const diagnosis = document.getElementById('diagnosis')?.value?.trim();

        if (!clientName || !unit || !driverName || !diagnosis) {
            alert("Por favor completa los campos obligatorios: Cliente, Unidad, Chofer y Diagnóstico.");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando Trabajo...';

        if (progressContainer) {
            progressContainer.style.display = 'block';
            progressBar.style.width = '10%';
            progressText.textContent = 'Preparando orden de trabajo...';
        }

        try {
            // Subir imágenes si existen
            const uploadedPhotos = {};
            const categories = Object.keys(imageFiles);
            let totalCats = categories.filter(c => imageFiles[c].length > 0).length;
            let currentCatIdx = 0;

            for (const cat of categories) {
                const files = imageFiles[cat];
                if (files.length > 0) {
                    currentCatIdx++;
                    const progress = 10 + Math.round((currentCatIdx / (totalCats + 1)) * 60);
                    if (progressBar) progressBar.style.width = `${progress}%`;
                    if (progressText) progressText.textContent = `Subiendo fotos de ${cat}...`;

                    uploadedPhotos[cat] = [];
                    for (const file of files) {
                        const fileTimestamp = Date.now();
                        const sRef = storageRef(storage, `trabajos/${unit}_${fileTimestamp}_${file.name}`);
                        const uploadTask = await uploadBytesResumable(sRef, file);
                        const downloadUrl = await getDownloadURL(uploadTask.ref);
                        uploadedPhotos[cat].push(downloadUrl);
                    }
                }
            }

            if (progressBar) progressBar.style.width = '85%';
            if (progressText) progressText.textContent = 'Registrando orden en Firestore...';

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
                    usedParts: usedParts.map(p => ({
                        id: p.id,
                        name: p.name,
                        serial: p.serial
                    })),
                    outsideParts: document.getElementById('outsideParts')?.value?.trim() || ""
                },
                usedParts: usedParts.map(p => ({
                    id: p.id,
                    name: p.name,
                    serial: p.serial
                })),
                mechanic: assignedMechanicSelect?.value || "Sin asignar",
                status: "Trabajo abierto",
                photos: uploadedPhotos,
                createdAt: serverTimestamp()
            };

            const newDocRef = doc(collection(db, "Trabajos"));
            await setDoc(newDocRef, jobData);

            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = '¡Orden de trabajo registrada con éxito!';

            if (statusMessage) {
                statusMessage.innerHTML = `<i class="fas fa-check-circle"></i> ¡Orden registrada exitosamente! ID: ${newDocRef.id}`;
                statusMessage.className = 'status-message success';
                statusMessage.style.display = 'block';
            }

            jobForm.reset();
            usedParts = [];
            renderUsedPartsList();
            Object.keys(imageFiles).forEach(k => imageFiles[k] = []);
            document.querySelectorAll('[id$="Preview"]').forEach(c => c.innerHTML = '');

            setTimeout(() => {
                window.location.href = 'trabajos.html';
            }, 2500);

        } catch (err) {
            console.error("Error al registrar trabajo:", err);
            if (statusMessage) {
                statusMessage.innerHTML = `<i class="fas fa-exclamation-circle"></i> Error al registrar orden: ${err.message}`;
                statusMessage.className = 'status-message error';
                statusMessage.style.display = 'block';
            }
            if (progressContainer) progressContainer.style.display = 'none';
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Trabajo';
        }
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
