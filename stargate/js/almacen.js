// Gestión de Almacén e Inventario - Portal Administrativo (Stargate)
import { initAuthGuard } from './auth-guard.js';
import { initNotificationsManager } from './notifications-manager.js';
import { 
    db, 
    collection, 
    onSnapshot, 
    getDocs, 
    doc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    serverTimestamp,
    storage,
    storageRef,
    uploadBytesResumable,
    getDownloadURL
} from './firebase-config.js';

let partsCache = [];
let currentEditPart = null;
let unsubscribeParts = null;
let newPartImageFile = null;
const storageUrlCache = new Map();

// Referencias a elementos DOM
const partsContainer = document.getElementById('partsContainer');
const loader = document.getElementById('loader');
const emptyState = document.getElementById('emptyState');
const statusMessage = document.getElementById('statusMessage');
const searchInput = document.getElementById('searchInput');
const rackFilter = document.getElementById('rackFilter');
const sortFilter = document.getElementById('sortFilter');
const stockFilter = document.getElementById('stockFilter');

// Modales y botones
const editModal = document.getElementById('editModal');
const stockModal = document.getElementById('stockModal');
const detailModal = document.getElementById('detailModal');
const newPartModal = document.getElementById('newPartModal');
const detailBody = document.getElementById('detailBody');
const saveChangesBtn = document.getElementById('saveChangesBtn');
const updateStockBtn = document.getElementById('updateStockBtn');
const saveNewPartBtn = document.getElementById('saveNewPartBtn');
const openNewPartModalBtn = document.getElementById('openNewPartModalBtn');
const closeModalBtns = document.querySelectorAll('.close-modal');

// Notificaciones gestionadas globalmente por notifications-manager.js

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
        loadParts();
        setupEventListeners();

        // Parámetro de URL para abrir modal de nueva pieza
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('action') === 'new' && newPartModal) {
            newPartModal.classList.add('active');
        }
    });
});

// Cargar piezas desde Firebase
async function loadParts() {
    try {
        if (loader) loader.style.display = 'block';
        if (partsContainer) partsContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'none';

        // Escucha en tiempo real para mantener datos sincronizados
        unsubscribeParts = onSnapshot(collection(db, "Piezas"), async (snapshot) => {
            partsCache = [];

            if (snapshot.empty) {
                if (emptyState) emptyState.style.display = 'block';
                if (loader) loader.style.display = 'none';
                renderParts([]);
                return;
            }

            // Optimización: Carga en paralelo de URLs de imágenes mediante Promise.all
            const partsPromises = snapshot.docs.map(async (docRef) => {
                const data = docRef.data();
                const part = {
                    id: docRef.id,
                    ...data,
                    nombre: data.partName || data.nombre || "Sin nombre",
                    codigo: data.serialNumber || data.codigo || "Sin código",
                    precio: Number(data.salePrice || data.precio) || 0,
                    estante: data.storageLocation || data.estante || "General",
                    minStock: Number(data.minStock) || 5,
                    stock: Number(data.stock) || 0,
                    supplier: data.supplier || "Sin proveedor",
                    purchasePrice: Number(data.purchasePrice) || 0,
                    timestamp: data.timestamp || null,
                    images: data.images || []
                };

                // Procesar imagen con caché en memoria y resolución no bloqueante
                if (part.images && part.images.length > 0) {
                    const imageUrl = part.images[0];
                    if (imageUrl && !imageUrl.startsWith('http') && storage) {
                        if (storageUrlCache.has(imageUrl)) {
                            part.fotoURL = storageUrlCache.get(imageUrl);
                        } else {
                            try {
                                const ref = storageRef(storage, imageUrl);
                                part.fotoURL = await getDownloadURL(ref);
                                storageUrlCache.set(imageUrl, part.fotoURL);
                            } catch (e) {
                                part.fotoURL = null;
                            }
                        }
                    } else {
                        part.fotoURL = imageUrl;
                    }
                } else {
                    part.fotoURL = null;
                }

                return part;
            });

            partsCache = await Promise.all(partsPromises);

            if (loader) loader.style.display = 'none';
            renderParts(partsCache);
        }, (error) => {
            console.error("Error al cargar piezas: ", error);
            if (statusMessage) {
                statusMessage.textContent = `Error al cargar piezas: ${error.message}`;
                statusMessage.className = 'status-message error';
                statusMessage.style.display = 'block';
            }
            if (loader) loader.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
        });

    } catch (error) {
        console.error("Error inicializando almacén: ", error);
        if (loader) loader.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
    }
}

// Renderizar tarjetas de piezas
function renderParts(parts) {
    if (!partsContainer) return;
    let filteredParts = [...parts];

    // Filtro por estante
    if (rackFilter && rackFilter.value !== 'all') {
        filteredParts = filteredParts.filter(part => part.estante === rackFilter.value);
    }

    // Filtro por stock
    if (stockFilter && stockFilter.value === 'low') {
        filteredParts = filteredParts.filter(part => part.stock < (part.minStock || 5));
    }

    // Ordenar
    if (sortFilter) {
        if (sortFilter.value === 'name') {
            filteredParts.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        } else if (sortFilter.value === 'stock') {
            filteredParts.sort((a, b) => (b.stock || 0) - (a.stock || 0));
        } else if (sortFilter.value === 'stock-low') {
            filteredParts.sort((a, b) => (a.stock || 0) - (b.stock || 0));
        }
    }

    // Filtrar por término de búsqueda si hay texto
    if (searchInput && searchInput.value.trim() !== '') {
        const term = searchInput.value.toLowerCase().trim();
        filteredParts = filteredParts.filter(p => 
            p.nombre.toLowerCase().includes(term) ||
            p.codigo.toLowerCase().includes(term) ||
            p.estante.toLowerCase().includes(term)
        );
    }

    if (filteredParts.length === 0) {
        partsContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    partsContainer.innerHTML = '';

    filteredParts.forEach((part, index) => {
        const partCard = createPartCard(part);
        partCard.style.animationDelay = `${index * 0.05}s`;
        partsContainer.appendChild(partCard);
    });
}

// Crear tarjeta de pieza con diseño fiel al original
function createPartCard(part) {
    const card = document.createElement('div');
    card.className = 'part-card';

    const isLowStock = part.stock < (part.minStock || 5);
    const precio = part.precio ? part.precio.toFixed(2) : '0.00';

    card.innerHTML = `
        ${isLowStock ? `<div class="low-stock-indicator">BAJO STOCK</div>` : ''}
        <div class="part-image">
            ${part.fotoURL ? 
                `<img src="${part.fotoURL}" alt="${escapeHtml(part.nombre)}" loading="lazy" decoding="async" class="part-thumbnail" onerror="this.parentElement.innerHTML='<div class=\\'default-part-image\\'><i class=\\'fas fa-cog\\'></i></div>'">` : 
                `<div class="default-part-image"><i class="fas fa-cog"></i></div>`
            }
        </div>
        <div class="part-info">
            <h3 class="part-name">${escapeHtml(part.nombre)}</h3>
            <div class="part-code">
                <i class="fas fa-barcode"></i>
                <span>${escapeHtml(part.codigo)}</span>
            </div>
            <div class="part-details">
                <div class="detail-item">
                    <div class="detail-label">Stock</div>
                    <div class="detail-value stock-value ${isLowStock ? 'low-stock' : ''}">${part.stock}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Mínimo</div>
                    <div class="detail-value">${part.minStock}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Precio</div>
                    <div class="detail-value">$${precio}</div>
                </div>
            </div>
        </div>
        <div class="part-footer">
            <div class="rack-location">
                <i class="fas fa-map-marker-alt"></i>
                <span>${escapeHtml(part.estante)}</span>
            </div>
            <div class="part-actions">
                <button class="part-btn detail-btn" data-id="${part.id}" title="Ver detalles">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="part-btn edit-btn" data-id="${part.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="part-btn update-btn" data-id="${part.id}" title="Actualizar stock">
                    <i class="fas fa-sync-alt"></i>
                </button>
                <button class="part-btn delete-btn" data-id="${part.id}" title="Eliminar">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;

    return card;
}

// Configurar escuchas de eventos (búsqueda, filtros, botones, modales)
function setupEventListeners() {
    if (rackFilter) rackFilter.addEventListener('change', () => renderParts(partsCache));
    if (sortFilter) sortFilter.addEventListener('change', () => renderParts(partsCache));
    if (stockFilter) stockFilter.addEventListener('change', () => renderParts(partsCache));

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderParts(partsCache);
        });
    }

    // Delegación de eventos para botones de tarjetas
    document.addEventListener('click', (e) => {
        const detailBtn = e.target.closest('.detail-btn');
        if (detailBtn) {
            const partId = detailBtn.dataset.id;
            openDetailModal(partId);
            return;
        }

        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            const partId = editBtn.dataset.id;
            openEditModal(partId);
            return;
        }

        const updateBtn = e.target.closest('.update-btn');
        if (updateBtn) {
            const partId = updateBtn.dataset.id;
            openStockModal(partId);
            return;
        }

        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            const partId = deleteBtn.dataset.id;
            const part = partsCache.find(p => p.id === partId);
            if (part && confirm(`¿Estás seguro de que deseas eliminar la pieza "${part.nombre}"?`)) {
                deletePart(partId);
            }
            return;
        }
    });

    // Abrir modal nueva pieza
    if (openNewPartModalBtn && newPartModal) {
        openNewPartModalBtn.addEventListener('click', () => {
            newPartImageFile = null;
            const prev = document.getElementById('newPartImagePreview');
            if (prev) { prev.innerHTML = ''; prev.style.display = 'none'; }
            const inp = document.getElementById('newPartImage');
            if (inp) inp.value = '';
            newPartModal.classList.add('active');
        });
    }

    // Listener para preview de imagen de nueva pieza
    const newPartImageInput = document.getElementById('newPartImage');
    const newPartImagePreview = document.getElementById('newPartImagePreview');
    if (newPartImageInput && newPartImagePreview) {
        newPartImageInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) {
                newPartImageFile = file;
                newPartImagePreview.innerHTML = `
                    <div style="position:relative;display:inline-block;">
                        <img src="${URL.createObjectURL(file)}" style="width:75px;height:75px;object-fit:cover;border-radius:8px;border:2px solid #4a6cf7;">
                        <button type="button" id="removeNewPartImgBtn" style="position:absolute;top:-6px;right:-6px;background:#e74c3c;color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:12px;font-weight:bold;line-height:1;display:flex;align-items:center;justify-content:center;">&times;</button>
                    </div>
                `;
                newPartImagePreview.style.display = 'block';
                document.getElementById('removeNewPartImgBtn')?.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    newPartImageFile = null;
                    newPartImagePreview.innerHTML = '';
                    newPartImagePreview.style.display = 'none';
                    newPartImageInput.value = '';
                });
            }
        });
    }

    // Guardar nueva pieza
    if (saveNewPartBtn) {
        saveNewPartBtn.addEventListener('click', handleSaveNewPart);
    }

    // Guardar cambios de edición
    if (saveChangesBtn) {
        saveChangesBtn.addEventListener('click', handleSaveChanges);
    }

    // Actualizar stock
    if (updateStockBtn) {
        updateStockBtn.addEventListener('click', handleUpdateStock);
    }

    // Cerrar modales
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (editModal) editModal.classList.remove('active');
            if (stockModal) stockModal.classList.remove('active');
            if (detailModal) detailModal.classList.remove('active');
            if (newPartModal) newPartModal.classList.remove('active');
        });
    });

    // Cerrar modal al hacer click fuera del contenido
    window.addEventListener('click', (e) => {
        if (e.target === editModal) editModal.classList.remove('active');
        if (e.target === stockModal) stockModal.classList.remove('active');
        if (e.target === detailModal) detailModal.classList.remove('active');
        if (e.target === newPartModal) newPartModal.classList.remove('active');
    });
}

// Modal de detalles fiel al diseño original
function openDetailModal(partId) {
    const part = partsCache.find(p => p.id === partId);
    if (!part || !detailModal || !detailBody) return;

    const isLowStock = part.stock < (part.minStock || 5);
    const precioVenta = part.precio !== undefined && part.precio !== null ? Number(part.precio).toFixed(2) : '0.00';
    const precioCompra = part.purchasePrice !== undefined && part.purchasePrice !== null ? Number(part.purchasePrice).toFixed(2) : '0.00';

    // Formatear fecha de última actualización
    let fechaActualizacion = 'No disponible';
    if (part.timestamp) {
        try {
            const date = part.timestamp.toDate ? part.timestamp.toDate() : new Date(part.timestamp);
            fechaActualizacion = date.toLocaleString('es-ES', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        } catch (error) {
            console.error("Error al formatear fecha:", error);
        }
    }

    const titleEl = document.getElementById('detailModalTitle');
    if (titleEl) titleEl.textContent = `Detalles: ${part.nombre}`;

    // Construir contenido con la estructura vertical exacta (6 tarjetas métricas + historial)
    detailBody.innerHTML = `
        ${part.fotoURL ? `
        <div class="detail-image-container">
            <div class="detail-image">
                <img src="${part.fotoURL}" alt="${escapeHtml(part.nombre)}" onerror="this.parentElement.innerHTML='<div class=\\'default-detail-image\\'><i class=\\'fas fa-cog\\'></i></div>'">
            </div>
        </div>` : ''}
        
        <div class="detail-info">
            <h3 class="detail-title">${escapeHtml(part.nombre)}</h3>
            <div class="detail-subtitle">
                <i class="fas fa-barcode"></i>
                <span>${escapeHtml(part.codigo || 'S/C')}</span>
            </div>
            
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">
                        <i class="fas fa-box"></i> STOCK
                    </div>
                    <div class="detail-value ${isLowStock ? 'detail-low-stock' : 'detail-stock'}">
                        ${part.stock}
                    </div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">
                        <i class="fas fa-tag"></i> PRECIO DE VENTA
                    </div>
                    <div class="detail-value detail-price">
                        $${precioVenta}
                    </div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">
                        <i class="fas fa-money-bill-wave"></i> PRECIO DE COMPRA
                    </div>
                    <div class="detail-value detail-cost">
                        $${precioCompra}
                    </div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">
                        <i class="fas fa-map-marker-alt"></i> UBICACIÓN
                    </div>
                    <div class="detail-value detail-location">
                        ${escapeHtml(part.estante || 'No asignada')}
                    </div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">
                        <i class="fas fa-truck"></i> PROVEEDOR
                    </div>
                    <div class="detail-value detail-supplier">
                        ${escapeHtml(part.supplier || 'N/A')}
                    </div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">
                        <i class="fas fa-database"></i> STOCK MÍNIMO
                    </div>
                    <div class="detail-value">
                        ${part.minStock || 5}
                    </div>
                </div>
            </div>
            
            <div class="detail-history">
                <div class="detail-history-title">
                    <i class="fas fa-history"></i> Historial
                </div>
                <div class="detail-history-item">
                    <div class="history-label">Última actualización:</div>
                    <div class="history-value">${fechaActualizacion}</div>
                </div>
            </div>
            
            <div class="detail-actions">
                <button class="btn btn-secondary close-modal" onclick="document.getElementById('detailModal').classList.remove('active')">Cerrar</button>
                <button class="btn btn-primary edit-btn" id="detailEditBtn" data-id="${part.id}">
                    <i class="fas fa-edit"></i> Editar Pieza
                </button>
            </div>
        </div>
    `;

    detailModal.classList.add('active');

    const detailEditBtn = document.getElementById('detailEditBtn');
    if (detailEditBtn) {
        detailEditBtn.addEventListener('click', () => {
            detailModal.classList.remove('active');
            openEditModal(partId);
        });
    }
}

// Modal de edición
function openEditModal(partId) {
    const part = partsCache.find(p => p.id === partId);
    if (!part || !editModal) return;

    currentEditPart = part;
    document.getElementById('modalTitle').textContent = `Editar: ${part.nombre}`;
    document.getElementById('editName').value = part.nombre;
    document.getElementById('editCode').value = part.codigo;
    document.getElementById('editPrice').value = part.precio || 0;
    document.getElementById('editStock').value = part.stock;
    document.getElementById('editMinStock').value = part.minStock;
    document.getElementById('editLocation').value = part.estante;

    editModal.classList.add('active');
}

async function handleSaveChanges() {
    if (!currentEditPart) return;

    const name = document.getElementById('editName').value.trim();
    const code = document.getElementById('editCode').value.trim();
    const price = parseFloat(document.getElementById('editPrice').value) || 0;
    const stock = parseInt(document.getElementById('editStock').value) || 0;
    const minStock = parseInt(document.getElementById('editMinStock').value) || 5;
    const location = document.getElementById('editLocation').value;

    if (!name || !code) {
        alert("Por favor completa los campos obligatorios");
        return;
    }

    try {
        saveChangesBtn.disabled = true;
        saveChangesBtn.textContent = 'Guardando...';

        const partRef = doc(db, "Piezas", currentEditPart.id);
        await updateDoc(partRef, {
            partName: name,
            nombre: name,
            serialNumber: code,
            codigo: code,
            salePrice: price,
            precio: price,
            stock: stock,
            minStock: minStock,
            storageLocation: location,
            estante: location,
            timestamp: serverTimestamp()
        });

        editModal.classList.remove('active');
        showStatus('Pieza actualizada exitosamente', 'success');
    } catch (error) {
        console.error("Error al actualizar pieza:", error);
        alert(`Error al actualizar: ${error.message}`);
    } finally {
        saveChangesBtn.disabled = false;
        saveChangesBtn.textContent = 'Guardar Cambios';
    }
}

// Modal de actualización rápida de stock
function openStockModal(partId) {
    const part = partsCache.find(p => p.id === partId);
    if (!part || !stockModal) return;

    currentEditPart = part;
    document.getElementById('currentStock').value = part.stock;
    document.getElementById('stockAmount').value = 1;
    document.getElementById('stockReason').value = '';
    stockModal.classList.add('active');
}

async function handleUpdateStock() {
    if (!currentEditPart) return;

    const currentStock = currentEditPart.stock;
    const action = document.getElementById('stockAction').value;
    const amount = parseInt(document.getElementById('stockAmount').value) || 0;
    const reason = document.getElementById('stockReason').value.trim();

    let newStock = currentStock;
    if (action === 'add') {
        newStock = currentStock + amount;
    } else if (action === 'remove') {
        newStock = Math.max(0, currentStock - amount);
    } else if (action === 'set') {
        newStock = Math.max(0, amount);
    }

    try {
        updateStockBtn.disabled = true;
        updateStockBtn.textContent = 'Actualizando...';

        const partRef = doc(db, "Piezas", currentEditPart.id);
        await updateDoc(partRef, {
            stock: newStock,
            timestamp: serverTimestamp()
        });

        stockModal.classList.remove('active');
        showStatus(`Stock actualizado de ${currentStock} a ${newStock}`, 'success');
    } catch (error) {
        console.error("Error al actualizar stock:", error);
        alert(`Error: ${error.message}`);
    } finally {
        updateStockBtn.disabled = false;
        updateStockBtn.textContent = 'Actualizar Stock';
    }
}

// Guardar nueva pieza
async function handleSaveNewPart() {
    const name = document.getElementById('newPartName').value.trim();
    const code = document.getElementById('newPartCode').value.trim();
    const price = parseFloat(document.getElementById('newPartPrice').value) || 0;
    const stock = parseInt(document.getElementById('newPartStock').value) || 0;
    const minStock = parseInt(document.getElementById('newPartMinStock').value) || 5;
    const location = document.getElementById('newPartLocation').value;

    if (!name || !code) {
        alert("Por favor completa los campos de nombre y código");
        return;
    }

    try {
        saveNewPartBtn.disabled = true;
        saveNewPartBtn.textContent = 'Guardando...';

        let uploadedImages = [];
        if (newPartImageFile && storage) {
            saveNewPartBtn.textContent = 'Subiendo fotografía...';
            try {
                const cleanCode = code.replace(/[^a-zA-Z0-9_-]/g, '_');
                const fileRef = storageRef(storage, `Piezas/${cleanCode}_${Date.now()}`);
                const uploadSnap = await uploadBytesResumable(fileRef, newPartImageFile);
                const downloadUrl = await getDownloadURL(uploadSnap.ref);
                uploadedImages = [downloadUrl];
            } catch (err) {
                console.warn("Fallo subida de foto de pieza:", err);
            }
        }

        await addDoc(collection(db, "Piezas"), {
            partName: name,
            nombre: name,
            serialNumber: code,
            codigo: code,
            salePrice: price,
            precio: price,
            stock: stock,
            minStock: minStock,
            storageLocation: location,
            estante: location,
            timestamp: serverTimestamp(),
            images: uploadedImages
        });

        newPartModal.classList.remove('active');
        // Reset form
        document.getElementById('newPartName').value = '';
        document.getElementById('newPartCode').value = '';
        document.getElementById('newPartPrice').value = '';
        document.getElementById('newPartStock').value = '1';
        document.getElementById('newPartMinStock').value = '5';
        newPartImageFile = null;
        const prev = document.getElementById('newPartImagePreview');
        if (prev) { prev.innerHTML = ''; prev.style.display = 'none'; }
        const inp = document.getElementById('newPartImage');
        if (inp) inp.value = '';

        showStatus(`Pieza "${name}" registrada exitosamente`, 'success');
    } catch (error) {
        console.error("Error registrando pieza:", error);
        alert(`Error al guardar: ${error.message}`);
    } finally {
        saveNewPartBtn.disabled = false;
        saveNewPartBtn.textContent = 'Guardar Pieza';
    }
}

// Eliminar pieza
async function deletePart(partId) {
    try {
        await deleteDoc(doc(db, "Piezas", partId));
        showStatus('Pieza eliminada exitosamente', 'success');
    } catch (error) {
        console.error("Error al eliminar pieza:", error);
        alert(`Error al eliminar: ${error.message}`);
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

// Notificaciones gestionadas por notifications-manager.js

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

window.addEventListener('beforeunload', () => {
    if (unsubscribeParts) unsubscribeParts();
});
