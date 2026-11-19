// Gestión de Colaboradores - Portal Administrativo (Stargate)
import { initAuthGuard } from './auth-guard.js';
import { 
    db, 
    collection, 
    onSnapshot, 
    doc, 
    updateDoc, 
    deleteDoc 
} from './firebase-config.js';

let employeesCache = [];
let currentEditEmployeeId = null;
let unsubscribeColaboradores = null;

// Elementos DOM
const employeesContainer = document.getElementById('employeesContainer');
const loader = document.getElementById('loader');
const emptyState = document.getElementById('emptyState');
const statusMessage = document.getElementById('statusMessage');
const searchInput = document.getElementById('searchInput');
const sortFilter = document.getElementById('sortFilter');

// Modales
const employeeModal = document.getElementById('employeeModal');
const modalBody = document.getElementById('modalBody');
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editEmployeeForm');
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
        setupColaboradoresListener();
        setupEventListeners();
    });
});

// Escuchar colaboradores desde Firebase en tiempo real
function setupColaboradoresListener() {
    if (loader) loader.style.display = 'block';
    if (employeesContainer) employeesContainer.innerHTML = '';
    if (emptyState) emptyState.style.display = 'none';

    unsubscribeColaboradores = onSnapshot(collection(db, "colaboradores"), (querySnapshot) => {
        employeesCache = [];

        if (querySnapshot.empty) {
            if (emptyState) emptyState.style.display = 'block';
            if (loader) loader.style.display = 'none';
            renderEmployees([]);
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const emp = { id: docSnap.id, ...docSnap.data() };

            // Formatear fecha de contratación
            emp.hireDateFormatted = formatDate(emp.hireDate);

            // Generar iniciales
            const nameStr = (emp.fullName || emp.name || 'Colaborador').trim();
            const names = nameStr.split(/\s+/);
            if (names.length >= 2) {
                emp.initials = (names[0].charAt(0) + names[1].charAt(0)).toUpperCase();
            } else {
                emp.initials = nameStr.substring(0, 2).toUpperCase();
            }

            employeesCache.push(emp);
        });

        if (loader) loader.style.display = 'none';
        renderEmployees(employeesCache);
    }, (error) => {
        console.error("Error al escuchar colaboradores:", error);
        if (statusMessage) {
            statusMessage.textContent = `Error al cargar colaboradores: ${error.message}`;
            statusMessage.className = 'status-message error';
            statusMessage.style.display = 'block';
        }
        if (loader) loader.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
    });
}

function formatDate(dateVal) {
    if (!dateVal) return "No especificada";
    try {
        if (typeof dateVal === 'string' && dateVal.includes('-')) {
            const parts = dateVal.split('-');
            if (parts.length === 3) {
                const date = new Date(parts[0], parts[1] - 1, parts[2]);
                if (!isNaN(date)) {
                    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
                }
            }
        }
        const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
        if (!isNaN(d)) {
            return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        }
    } catch (e) {
        // Fallback
    }
    return String(dateVal);
}

// Renderizar tarjetas de colaboradores
function renderEmployees(employees) {
    if (!employeesContainer) return;
    let filtered = [...employees];

    // Ordenamiento
    if (sortFilter) {
        if (sortFilter.value === 'name-asc') {
            filtered.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
        } else if (sortFilter.value === 'name-desc') {
            filtered.sort((a, b) => (b.fullName || '').localeCompare(a.fullName || ''));
        } else if (sortFilter.value === 'hire-date') {
            filtered.sort((a, b) => {
                const dateA = new Date(a.hireDate || 0).getTime();
                const dateB = new Date(b.hireDate || 0).getTime();
                return dateB - dateA;
            });
        }
    }

    // Filtro de búsqueda
    if (searchInput && searchInput.value.trim() !== '') {
        const term = searchInput.value.toLowerCase().trim();
        filtered = filtered.filter(emp => 
            (emp.fullName || '').toLowerCase().includes(term) ||
            (emp.curp || '').toLowerCase().includes(term) ||
            (emp.rfc || '').toLowerCase().includes(term) ||
            (emp.employeeNumber || '').toLowerCase().includes(term) ||
            (emp.tipoEmpleado || '').toLowerCase().includes(term)
        );
    }

    if (filtered.length === 0) {
        employeesContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    employeesContainer.innerHTML = '';

    filtered.forEach((emp, index) => {
        const card = createEmployeeCard(emp);
        card.style.animationDelay = `${index * 0.05}s`;
        employeesContainer.appendChild(card);
    });
}

// Crear tarjeta de colaborador con diseño original
function createEmployeeCard(employee) {
    const card = document.createElement('div');
    card.className = 'employee-card';

    card.innerHTML = `
        <div class="employee-header">
            <div class="employee-avatar">${escapeHtml(employee.initials)}</div>
        </div>
        <div class="employee-info">
            <h3 class="employee-name">${escapeHtml(employee.fullName || 'Nombre no especificado')}</h3>
            <div class="employee-details">
                <div class="detail-item">
                    <div class="detail-label">CURP</div>
                    <div class="detail-value">${escapeHtml(employee.curp || 'No especificado')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">RFC</div>
                    <div class="detail-value">${escapeHtml(employee.rfc || 'No especificado')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Número de empleado</div>
                    <div class="detail-value">${escapeHtml(employee.employeeNumber || 'No especificado')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Fecha de contratación</div>
                    <div class="detail-value">${escapeHtml(employee.hireDateFormatted || 'No especificada')}</div>
                </div>
            </div>
        </div>
        <div class="employee-footer">
            <div class="employee-actions">
                <button class="employee-btn view-btn" data-id="${employee.id}">
                    <i class="fas fa-eye"></i>
                    <span>Ver</span>
                </button>
                <button class="employee-btn edit-btn" data-id="${employee.id}">
                    <i class="fas fa-edit"></i>
                    <span>Editar</span>
                </button>
                <button class="employee-btn delete-btn" data-id="${employee.id}">
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
    if (sortFilter) sortFilter.addEventListener('change', () => renderEmployees(employeesCache));
    if (searchInput) searchInput.addEventListener('input', () => renderEmployees(employeesCache));

    // Delegación de eventos en tarjetas
    document.addEventListener('click', (e) => {
        const viewBtn = e.target.closest('.view-btn');
        if (viewBtn) {
            const empId = viewBtn.dataset.id;
            showEmployeeDetails(empId);
            return;
        }

        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            const empId = editBtn.dataset.id;
            openEditModal(empId);
            return;
        }

        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            const empId = deleteBtn.dataset.id;
            const emp = employeesCache.find(em => em.id === empId);
            if (emp && confirm(`¿Estás seguro de que deseas eliminar al colaborador "${emp.fullName}"?`)) {
                deleteEmployee(empId);
            }
            return;
        }
    });

    // Cerrar modales
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (employeeModal) employeeModal.style.display = 'none';
            if (editModal) editModal.style.display = 'none';
        });
    });

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            if (editModal) editModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === employeeModal) employeeModal.style.display = 'none';
        if (e.target === editModal) editModal.style.display = 'none';
    });

    // Formulario de edición
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentEditEmployeeId) return;

            const submitBtn = editForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            }

            const updatedData = {
                fullName: document.getElementById('editEmployeeName').value.trim(),
                curp: document.getElementById('editCurp').value.trim(),
                rfc: document.getElementById('editRfc').value.trim(),
                employeeNumber: document.getElementById('editEmployeeNumber').value.trim(),
                hireDate: document.getElementById('editHireDate').value
            };

            await updateEmployee(currentEditEmployeeId, updatedData);

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
            }
        });
    }
}

// Ver detalles en modal
function showEmployeeDetails(empId) {
    const emp = employeesCache.find(e => e.id === empId);
    if (!emp || !employeeModal || !modalBody) return;

    modalBody.innerHTML = `
        <div class="employee-detail-header" style="display:flex;align-items:center;gap:15px;margin-bottom:20px;">
            <div class="employee-avatar" style="width:60px;height:60px;font-size:24px;border-radius:50%;background:#3498db;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">${escapeHtml(emp.initials)}</div>
            <div>
                <h3 style="margin:0;font-size:20px;color:#2c3e50;">${escapeHtml(emp.fullName || 'Sin Nombre')}</h3>
                <p style="margin:4px 0 0;color:#7f8c8d;"><i class="fas fa-user-tag"></i> ${escapeHtml(emp.tipoEmpleado || 'Colaborador')}</p>
            </div>
        </div>
        <div class="detail-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
            <div class="detail-item">
                <strong style="color:#7f8c8d;display:block;font-size:12px;">CURP</strong>
                <span style="color:#2c3e50;">${escapeHtml(emp.curp || 'No especificado')}</span>
            </div>
            <div class="detail-item">
                <strong style="color:#7f8c8d;display:block;font-size:12px;">RFC</strong>
                <span style="color:#2c3e50;">${escapeHtml(emp.rfc || 'No especificado')}</span>
            </div>
            <div class="detail-item">
                <strong style="color:#7f8c8d;display:block;font-size:12px;">NÚMERO DE EMPLEADO</strong>
                <span style="color:#2c3e50;">${escapeHtml(emp.employeeNumber || 'No especificado')}</span>
            </div>
            <div class="detail-item">
                <strong style="color:#7f8c8d;display:block;font-size:12px;">FECHA DE CONTRATACIÓN</strong>
                <span style="color:#2c3e50;">${escapeHtml(emp.hireDateFormatted)}</span>
            </div>
            <div class="detail-item" style="grid-column: span 2;">
                <strong style="color:#7f8c8d;display:block;font-size:12px;">ID EN SISTEMA</strong>
                <span style="color:#2c3e50;font-family:monospace;">${emp.id}</span>
            </div>
        </div>
        <div style="margin-top:25px;display:flex;justify-content:flex-end;gap:10px;">
            <button class="form-btn cancel-btn" onclick="document.getElementById('employeeModal').style.display='none'">Cerrar</button>
            <button class="form-btn save-btn" id="modalEditEmpBtn"><i class="fas fa-edit"></i> Editar</button>
        </div>
    `;

    employeeModal.style.display = 'block';

    const modalEditEmpBtn = document.getElementById('modalEditEmpBtn');
    if (modalEditEmpBtn) {
        modalEditEmpBtn.addEventListener('click', () => {
            employeeModal.style.display = 'none';
            openEditModal(empId);
        });
    }
}

// Abrir modal de edición
function openEditModal(empId) {
    const emp = employeesCache.find(e => e.id === empId);
    if (!emp || !editModal) return;

    currentEditEmployeeId = empId;

    document.getElementById('editEmployeeName').value = emp.fullName || '';
    document.getElementById('editCurp').value = emp.curp || '';
    document.getElementById('editRfc').value = emp.rfc || '';
    document.getElementById('editEmployeeNumber').value = emp.employeeNumber || '';
    document.getElementById('editHireDate').value = emp.hireDate || '';

    editModal.style.display = 'block';
}

// Actualizar colaborador en Firestore
async function updateEmployee(empId, updatedData) {
    try {
        const empRef = doc(db, "colaboradores", empId);
        await updateDoc(empRef, updatedData);

        editModal.style.display = 'none';
        showStatus('Colaborador actualizado exitosamente', 'success');
    } catch (error) {
        console.error("Error al actualizar colaborador:", error);
        alert(`Error al actualizar: ${error.message}`);
    }
}

// Eliminar colaborador de Firestore
async function deleteEmployee(empId) {
    try {
        await deleteDoc(doc(db, "colaboradores", empId));
        showStatus('Colaborador eliminado exitosamente', 'success');
    } catch (error) {
        console.error("Error al eliminar colaborador:", error);
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

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

window.addEventListener('beforeunload', () => {
    if (unsubscribeColaboradores) unsubscribeColaboradores();
});
