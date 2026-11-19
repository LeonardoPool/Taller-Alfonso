// Guardia de autenticación para Portal de Mecánicos (Zafiro)
import { db, doc, getDoc } from './firebase-config.js';

export async function checkMechanicAuth() {
    const mechanicId = localStorage.getItem('mechanicId');
    const mechanicPin = localStorage.getItem('mechanicPin');
    const loggedInUserName = localStorage.getItem('loggedInUserName');

    if (!mechanicId || !mechanicPin) {
        console.warn("Sesión no válida en Portal Mecánicos. Redirigiendo...");
        localStorage.clear();
        window.location.href = 'index.html';
        return null;
    }

    // Acceso administrativo especial
    if (mechanicId === "admin" && mechanicPin === "Admin_2025") {
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
            localStorage.clear();
            window.location.href = 'index.html';
            return null;
        }

        const userData = docSnap.data();
        if (userData.pin !== mechanicPin) {
            console.warn("PIN no coincide");
            localStorage.clear();
            window.location.href = 'index.html';
            return null;
        }

        const tipo = (userData.tipoEmpleado || '').toLowerCase();
        if (!tipo.includes('mecan') && !tipo.includes('admin')) {
            console.warn("Tipo de empleado no autorizado para este portal");
            localStorage.clear();
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

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('¿Deseas cerrar sesión?')) {
                localStorage.clear();
                window.location.href = 'index.html';
            }
        });
    }

    // Mobile sidebar toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (menuToggle && sidebar) {
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
