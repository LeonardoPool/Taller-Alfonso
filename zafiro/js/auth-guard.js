// Guardia de autenticación para Portal de Mecánicos (Zafiro)
import { db, doc, getDoc } from './firebase-config.js';

export function normalizeText(str) {
    return (str || '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

export function clearMechanicSession() {
    localStorage.removeItem('mechanicId');
    localStorage.removeItem('mechanicPin');
    localStorage.removeItem('loggedInUserName');
    localStorage.removeItem('mechanicLoggedIn');
    localStorage.removeItem('isLoggedIn');
}

export async function checkMechanicAuth() {
    const mechanicId = localStorage.getItem('mechanicId');
    const mechanicPin = localStorage.getItem('mechanicPin');
    const loggedInUserName = localStorage.getItem('loggedInUserName');

    if (!mechanicId || !mechanicPin) {
        console.warn("Sesión no válida en Portal Mecánicos. Redirigiendo...");
        clearMechanicSession();
        window.location.href = 'index.html';
        return null;
    }

    // Acceso administrativo especial
    if (mechanicId === "admin" && (mechanicPin === "Admin_2025" || mechanicPin === "2025" || mechanicPin === "0000")) {
        setupUI('Administrador');
        return {
            id: 'admin',
            fullName: 'Administrador',
            isAdmin: true,
            tipoEmpleado: 'Administrador'
        };
    }

    try {
        const docSnap = await getDoc(doc(db, "colaboradores", mechanicId));
        if (!docSnap.exists()) {
            console.warn("Mecánico no encontrado en Firestore");
            clearMechanicSession();
            window.location.href = 'index.html';
            return null;
        }

        const userData = docSnap.data();
        const expectedPin = String(userData.pin || '').trim();
        const sessionPin = String(mechanicPin || '').trim();

        if (expectedPin !== sessionPin) {
            console.warn("PIN no coincide");
            clearMechanicSession();
            window.location.href = 'index.html';
            return null;
        }

        const rawTipo = (userData.tipoEmpleado || '').toLowerCase();
        const tipoNorm = normalizeText(userData.tipoEmpleado);
        const isAllowedRole = !userData.tipoEmpleado || 
                              tipoNorm.includes('mecan') || 
                              rawTipo.includes('mecán') || 
                              tipoNorm.includes('admin');

        if (!isAllowedRole) {
            console.warn("Tipo de empleado no autorizado para este portal:", userData.tipoEmpleado);
            clearMechanicSession();
            window.location.href = 'index.html';
            return null;
        }

        const fullName = userData.fullName || loggedInUserName || 'Mecánico';
        setupUI(fullName);

        return {
            id: docSnap.id,
            ...userData,
            fullName: fullName,
            isAdmin: false
        };
    } catch (error) {
        console.error("Error al validar sesión:", error);
        // Resiliencia: si hay falla temporal de red, conservar sesión local para evitar expulsar al usuario
        if (mechanicId && mechanicPin) {
            console.warn("Manteniendo sesión local ante falla momentánea de red");
            const fullName = loggedInUserName || 'Mecánico';
            setupUI(fullName);
            return {
                id: mechanicId,
                fullName: fullName,
                isAdmin: mechanicId === 'admin'
            };
        }
        return null;
    }
}

function setupUI(fullName) {
    const welcomeTitle = document.getElementById('welcomeTitle');
    if (welcomeTitle) {
        welcomeTitle.textContent = `Bienvenido, ${fullName}`;
    }

    const userProfile = document.getElementById('userProfile') || document.querySelector('.user-profile');
    if (userProfile) {
        userProfile.textContent = fullName.charAt(0).toUpperCase();
        userProfile.title = fullName;
    }

    const loggedInUser = document.getElementById('loggedInUser');
    if (loggedInUser) {
        loggedInUser.textContent = fullName;
    }

    // Logout con confirmación
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && !logoutBtn.dataset.listenerAttached) {
        logoutBtn.dataset.listenerAttached = 'true';
        logoutBtn.addEventListener('click', () => {
            if (confirm('¿Deseas cerrar sesión?')) {
                clearMechanicSession();
                window.location.href = 'index.html';
            }
        });
    }

    // Mobile sidebar toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (menuToggle && sidebar && !menuToggle.dataset.listenerAttached) {
        menuToggle.dataset.listenerAttached = 'true';
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    // Cerrar notificaciones flotantes globalmente
    document.addEventListener('click', (e) => {
        if (e.target.closest('.notification-close')) {
            const notif = document.getElementById('floatingNotification');
            if (notif) notif.classList.remove('show');
        }
    });
    window.closeNotification = () => {
        const notif = document.getElementById('floatingNotification');
        if (notif) notif.classList.remove('show');
    };
}
