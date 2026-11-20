// Guardia de autenticación para Portal de Mecánicos (Zafiro)
import { db, doc, getDoc } from './firebase-config.js';

export function normalizeText(str) {
    return (str || '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

export function getPortalUrl(page) {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/empleados')) {
        return '/empleados/' + page;
    }
    return page;
}

export function clearMechanicSession() {
    localStorage.removeItem('mechanicId');
    localStorage.removeItem('mechanicPin');
    localStorage.removeItem('loggedInUserName');
    localStorage.removeItem('mechanicLoggedIn');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('tipoEmpleado');
}

export async function checkMechanicAuth() {
    const mechanicId = localStorage.getItem('mechanicId');
    const mechanicPin = localStorage.getItem('mechanicPin');
    const loggedInUserName = localStorage.getItem('loggedInUserName');

    // Solo redirigir si el usuario realmente no ha iniciado sesión
    if (!mechanicId || !mechanicPin) {
        console.warn("Sesión no válida en Portal Mecánicos. Redirigiendo a login...");
        clearMechanicSession();
        window.location.href = getPortalUrl('index.html');
        return null;
    }

    const currentName = loggedInUserName || 'Mecánico';

    // Establecer la interfaz inmediatamente para que el usuario permanezca en el panel
    setupUI(currentName);

    // Acceso administrativo especial (bypass local rápido)
    if (mechanicId === "admin") {
        return {
            id: 'admin',
            fullName: 'Administrador',
            isAdmin: true,
            tipoEmpleado: 'Administrador'
        };
    }

    // Sincronizar datos de Firestore en segundo plano SIN interrumpir ni expulsar al usuario
    try {
        const docSnap = await getDoc(doc(db, "colaboradores", mechanicId));
        if (docSnap.exists()) {
            const userData = docSnap.data();
            const fullName = userData.fullName || currentName;
            setupUI(fullName);
            return {
                id: docSnap.id,
                ...userData,
                fullName: fullName,
                isAdmin: false
            };
        }
    } catch (error) {
        console.warn("Validación de Firestore en segundo plano (manteniendo sesión local activa):", error);
    }

    // Retornar sesión local activa (el usuario nunca es expulsado si tiene credenciales en sesión)
    return {
        id: mechanicId,
        fullName: currentName,
        isAdmin: false
    };
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

    // Logout con confirmación explícita
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && !logoutBtn.dataset.listenerAttached) {
        logoutBtn.dataset.listenerAttached = 'true';
        logoutBtn.addEventListener('click', () => {
            if (confirm('¿Deseas cerrar sesión?')) {
                clearMechanicSession();
                window.location.href = getPortalUrl('index.html');
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
