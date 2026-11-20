// Gestión de Clientes - Portal Administrativo (Stargate)
import { initAuthGuard } from './auth-guard.js';
import { initNotificationsManager } from './notifications-manager.js';
import { 
    db, 
    collection, 
    getDocs, 
    onSnapshot,
    doc, 
    updateDoc, 
    deleteDoc 
} from './firebase-config.js';

let clientsCache = [];
let companiesSet = new Set();
let currentEditClientId = null;
let unsubscribeClients = null;

// Referencias a elementos DOM
const clientsContainer = document.getElementById('clientsContainer');
const loader = document.getElementById('loader');
const emptyState = document.getElementById('emptyState');
const statusMessage = document.getElementById('statusMessage');
const searchInput = document.getElementById('searchInput');
const sortFilter = document.getElementById('sortFilter');
const companyFilter = document.getElementById('companyFilter');

// Modales
const clientModal = document.getElementById('clientModal');
const modalBody = document.getElementById('modalBody');
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editClientForm');
const cancelEditBtn = document.getElementById('cancelEdit');
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
        initNotificationsManager();
        loadClients();
        setupEventListeners();
    });
});

// Cargar clientes desde Firebase
async function loadClients() {
    try {
        if (loader) loader.style.display = 'block';
        if (clientsContainer) clientsContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'none';

        unsubscribeClients = onSnapshot(collection(db, "Clientes"), (querySnapshot) => {
            clientsCache = [];
            companiesSet.clear();
            companiesSet.add("Todas las empresas");

            if (querySnapshot.empty) {
                if (emptyState) emptyState.style.display = 'block';
                if (loader) loader.style.display = 'none';
                renderClients([]);
                return;
            }

            querySnapshot.forEach((docSnap) => {
                const client = { id: docSnap.id, ...docSnap.data() };

                // Formatear fecha
                if (client.timestamp) {
                    const date = client.timestamp.toDate ? client.timestamp.toDate() : new Date(client.timestamp);
                    client.fechaRegistroFormatted = isNaN(date) ? "No especificada" : date.toLocaleDateString('es-ES', {
                        year: 'numeric', month: 'long', day: 'numeric'
                    });
                } else {
                    client.fechaRegistroFormatted = "No especificada";
                }

                // Generar iniciales
                const nameStr = (client.clientName || client.name || 'Cliente').trim();
                const names = nameStr.split(/\s+/);
                if (names.length >= 2) {
                    client.initials = (names[0].charAt(0) + names[1].charAt(0)).toUpperCase();
                } else {
                    client.initials = nameStr.substring(0, 2).toUpperCase();
                }

                if (client.company && client.company.trim()) {
                    companiesSet.add(client.company.trim());
                }

                clientsCache.push(client);
            });

            updateCompanyFilter();
            if (loader) loader.style.display = 'none';
            renderClients(clientsCache);
        }, (error) => {
            console.error("Error al cargar clientes: ", error);
            if (statusMessage) {
                statusMessage.textContent = `Error al cargar clientes: ${error.message}`;
                statusMessage.className = 'status-message error';
                statusMessage.style.display = 'block';
            }
            if (loader) loader.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
        });

    } catch (error) {
        console.error("Error inicializando Clientes:", error);
        if (loader) loader.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
    }
}

// Actualizar filtro de empresas
function updateCompanyFilter() {
    if (!companyFilter) return;
    const currentVal = companyFilter.value;
    companyFilter.innerHTML = '';

    companiesSet.forEach(company => {
        const option = document.createElement('option');
        option.value = company === "Todas las empresas" ? "all" : company;
        option.textContent = company;
        companyFilter.appendChild(option);
    });

    if ([...companiesSet].includes(currentVal)) {
        companyFilter.value = currentVal;
    }
}

// Renderizar tarjetas de clientes
function renderClients(clients) {
    if (!clientsContainer) return;
    let filtered = [...clients];

    // Filtro por empresa
    if (companyFilter && companyFilter.value !== 'all') {
        filtered = filtered.filter(c => (c.company || '').trim() === companyFilter.value);
    }

    // Ordenamiento
    if (sortFilter) {
        if (sortFilter.value === 'name-asc') {
            filtered.sort((a, b) => (a.clientName || '').localeCompare(b.clientName || ''));
        } else if (sortFilter.value === 'name-desc') {
            filtered.sort((a, b) => (b.clientName || '').localeCompare(a.clientName || ''));
        } else if (sortFilter.value === 'recent') {
            filtered.sort((a, b) => {
                const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp || 0).getTime();
                const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp || 0).getTime();
                return timeB - timeA;
            });
        }
    }

    // Búsqueda
    if (searchInput && searchInput.value.trim() !== '') {
        const term = searchInput.value.toLowerCase().trim();
        filtered = filtered.filter(c => 
            (c.clientName || '').toLowerCase().includes(term) ||
            (c.company || '').toLowerCase().includes(term) ||
            (c.phone || '').toLowerCase().includes(term) ||
            (c.email || '').toLowerCase().includes(term)
        );
    }

    if (filtered.length === 0) {
        clientsContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    clientsContainer.innerHTML = '';

    filtered.forEach((client, index) => {
        const card = createClientCard(client);
        card.style.animationDelay = `${index * 0.05}s`;
        clientsContainer.appendChild(card);
    });
}

// Crear tarjeta de cliente
function createClientCard(client) {
    const card = document.createElement('div');
    card.className = 'client-card';

    const isCorporate = client.company && client.company.trim() !== '';

    card.innerHTML = `
        ${isCorporate ? `<div class="corporate-client-indicator">EMPRESA</div>` : ''}
        <div class="client-header">
            <div class="client-avatar">${escapeHtml(client.initials)}</div>
        </div>
        <div class="client-info">
            <h3 class="client-name">${escapeHtml(client.clientName || 'Nombre no especificado')}</h3>
            ${client.company ? `
                <div class="client-company">
                    <i class="fas fa-building"></i>
                    <span>${escapeHtml(client.company)}</span>
                </div>
            ` : ''}
            <div class="client-details">
                <div class="detail-item">
                    <div class="detail-label">Teléfono</div>
                    <div class="detail-value">${escapeHtml(client.phone || 'No especificado')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Email</div>
                    <div class="detail-value">${escapeHtml(client.email || 'No especificado')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Registro</div>
                    <div class="detail-value">${escapeHtml(client.fechaRegistroFormatted || 'No especificada')}</div>
                </div>
            </div>
        </div>
        <div class="client-contact">
            <div class="contact-info">
                <i class="fas fa-map-marker-alt"></i>
                <span>${escapeHtml(client.address ? (client.address.length > 25 ? client.address.substring(0, 25) + '...' : client.address) : 'Sin dirección')}</span>
            </div>
        </div>
        <div class="client-footer">
            <div class="client-actions">
                <button class="client-btn view-btn" data-id="${client.id}">
                    <i class="fas fa-eye"></i>
                    <span>Ver</span>
                </button>
                <button class="client-btn edit-btn" data-id="${client.id}">
                    <i class="fas fa-edit"></i>
                    <span>Editar</span>
                </button>
                <button class="client-btn delete-btn" data-id="${client.id}">
                    <i class="fas fa-trash"></i>
                    <span>Eliminar</span>
                </button>
            </div>
        </div>
    `;

    return card;
}

// Configurar escuchas de eventos
function setupEventListeners() {
    if (sortFilter) sortFilter.addEventListener('change', () => renderClients(clientsCache));
    if (companyFilter) companyFilter.addEventListener('change', () => renderClients(clientsCache));
    if (searchInput) searchInput.addEventListener('input', () => renderClients(clientsCache));

    // Botones de acción en tarjetas
    document.addEventListener('click', (e) => {
        const viewBtn = e.target.closest('.view-btn');
        if (viewBtn) {
            const clientId = viewBtn.dataset.id;
            showClientDetails(clientId);
            return;
        }

        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            const clientId = editBtn.dataset.id;
            openEditModal(clientId);
            return;
        }

        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            const clientId = deleteBtn.dataset.id;
            const client = clientsCache.find(c => c.id === clientId);
            if (client && confirm(`¿Estás seguro de que deseas eliminar al cliente "${client.clientName}"?`)) {
                deleteClient(clientId);
            }
            return;
        }
    });

    // Cerrar modales
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (clientModal) clientModal.style.display = 'none';
            if (editModal) editModal.style.display = 'none';
        });
    });

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            if (editModal) editModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === clientModal) clientModal.style.display = 'none';
        if (e.target === editModal) editModal.style.display = 'none';
    });

    // Formulario de edición
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentEditClientId) return;

            const submitBtn = editForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            }

            const updatedData = {
                clientName: document.getElementById('editClientName').value.trim(),
                company: document.getElementById('editCompany').value.trim(),
                phone: document.getElementById('editPhone').value.trim(),
                email: document.getElementById('editEmail').value.trim(),
                address: document.getElementById('editAddress').value.trim(),
                notes: document.getElementById('editNotes').value.trim()
            };

            await updateClient(currentEditClientId, updatedData);

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
            }
        });
    }
}

// Ver detalles en modal
function showClientDetails(clientId) {
    const client = clientsCache.find(c => c.id === clientId);
    if (!client || !clientModal || !modalBody) return;

    modalBody.innerHTML = `
        <div class="client-detail-header" style="display:flex;align-items:center;gap:15px;margin-bottom:20px;">
            <div class="client-avatar" style="width:60px;height:60px;font-size:24px;border-radius:50%;background:#3498db;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">${escapeHtml(client.initials)}</div>
            <div>
                <h3 style="margin:0;font-size:20px;color:#2c3e50;">${escapeHtml(client.clientName || 'Sin Nombre')}</h3>
                <p style="margin:4px 0 0;color:#7f8c8d;"><i class="fas fa-building"></i> ${escapeHtml(client.company || 'Particular')}</p>
            </div>
        </div>
        <div class="detail-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
            <div class="detail-item">
                <strong style="color:#7f8c8d;display:block;font-size:12px;">TELÉFONO</strong>
                <span style="color:#2c3e50;">${escapeHtml(client.phone || 'No especificado')}</span>
            </div>
            <div class="detail-item">
                <strong style="color:#7f8c8d;display:block;font-size:12px;">EMAIL</strong>
                <span style="color:#2c3e50;">${escapeHtml(client.email || 'No especificado')}</span>
            </div>
            <div class="detail-item" style="grid-column: span 2;">
                <strong style="color:#7f8c8d;display:block;font-size:12px;">DIRECCIÓN</strong>
                <span style="color:#2c3e50;">${escapeHtml(client.address || 'No especificada')}</span>
            </div>
            <div class="detail-item">
                <strong style="color:#7f8c8d;display:block;font-size:12px;">FECHA DE REGISTRO</strong>
                <span style="color:#2c3e50;">${escapeHtml(client.fechaRegistroFormatted)}</span>
            </div>
            <div class="detail-item">
                <strong style="color:#7f8c8d;display:block;font-size:12px;">ID DEL CLIENTE</strong>
                <span style="color:#2c3e50;font-family:monospace;">${client.id}</span>
            </div>
            ${client.notes ? `
                <div class="detail-item" style="grid-column: span 2;">
                    <strong style="color:#7f8c8d;display:block;font-size:12px;">NOTAS</strong>
                    <span style="color:#2c3e50;">${escapeHtml(client.notes)}</span>
                </div>
            ` : ''}
        </div>
        <div style="margin-top:25px;display:flex;justify-content:flex-end;gap:10px;">
            <button class="form-btn cancel-btn" onclick="document.getElementById('clientModal').style.display='none'">Cerrar</button>
            <button class="form-btn save-btn" id="modalEditBtn"><i class="fas fa-edit"></i> Editar</button>
        </div>
    `;

    clientModal.style.display = 'block';

    const modalEditBtn = document.getElementById('modalEditBtn');
    if (modalEditBtn) {
        modalEditBtn.addEventListener('click', () => {
            clientModal.style.display = 'none';
            openEditModal(clientId);
        });
    }
}

// Abrir modal de edición
function openEditModal(clientId) {
    const client = clientsCache.find(c => c.id === clientId);
    if (!client || !editModal) return;

    currentEditClientId = clientId;

    document.getElementById('editClientName').value = client.clientName || '';
    document.getElementById('editCompany').value = client.company || '';
    document.getElementById('editPhone').value = client.phone || '';
    document.getElementById('editEmail').value = client.email || '';
    document.getElementById('editAddress').value = client.address || '';
    document.getElementById('editNotes').value = client.notes || '';

    editModal.style.display = 'block';
}

// Actualizar cliente en Firestore
async function updateClient(clientId, updatedData) {
    try {
        const clientRef = doc(db, "Clientes", clientId);
        await updateDoc(clientRef, updatedData);

        editModal.style.display = 'none';
        showStatus('Cliente actualizado exitosamente', 'success');
    } catch (error) {
        console.error("Error al actualizar cliente:", error);
        alert(`Error al actualizar cliente: ${error.message}`);
    }
}

// Eliminar cliente en Firestore
async function deleteClient(clientId) {
    try {
        await deleteDoc(doc(db, "Clientes", clientId));
        showStatus('Cliente eliminado exitosamente', 'success');
    } catch (error) {
        console.error("Error al eliminar cliente:", error);
        alert(`Error al eliminar cliente: ${error.message}`);
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
    if (unsubscribeClients) unsubscribeClients();
});
