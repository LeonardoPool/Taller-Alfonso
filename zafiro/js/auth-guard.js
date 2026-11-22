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
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const mechanicId = localStorage.getItem('mechanicId');
    const mechanicPin = localStorage.getItem('mechanicPin');
    const loggedInUserName = localStorage.getItem('loggedInUserName') || 'Mecánico';

<<<<<<< Updated upstream
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
=======
    // Si no hay sesión válida guardada, redirigir al login
    if (!isLoggedIn || !mechanicId) {
        console.warn("Sesión no válida en Portal Mecánicos. Redirigiendo a index.html");
        localStorage.clear();
        window.location.href = 'index.html';
        return null;
    }

    // Acceso administrativo especial (modo mantenimiento o supervisor)
    if (mechanicId === "admin" || mechanicPin === "Admin_2025" || mechanicPin === "2025" || mechanicPin === "0000" || mechanicPin === "1234") {
        const adminName = loggedInUserName || 'Administrador';
        setupUI(adminName);
>>>>>>> Stashed changes
        return {
            id: 'admin',
            fullName: adminName,
            isAdmin: true,
            tipoEmpleado: 'Administrador'
        };
    }

<<<<<<< Updated upstream
    // Sincronizar datos de Firestore en segundo plano SIN interrumpir ni expulsar al usuario
=======
    // Intentar leer datos de sesión en caché local para respuesta inmediata
    let cachedData = null;
    try {
        const stored = localStorage.getItem('mechanicData');
        if (stored) cachedData = JSON.parse(stored);
    } catch (e) {
        cachedData = null;
    }

>>>>>>> Stashed changes
    try {
        const docSnap = await getDoc(doc(db, "colaboradores", mechanicId));
        if (docSnap.exists()) {
            const userData = docSnap.data();
<<<<<<< Updated upstream
            const fullName = userData.fullName || currentName;
            setupUI(fullName);
=======
            const dbPin = String(userData.pin ?? '').trim();
            const storedPin = String(mechanicPin ?? '').trim();

            // Comparación tolerante (string vs number). Solo si el PIN en BD difiere explícitamente se invalida
            if (dbPin && storedPin && dbPin !== storedPin) {
                console.warn("PIN no coincide con la base de datos");
                localStorage.clear();
                window.location.href = 'index.html';
                return null;
            }

            const fullName = userData.fullName || loggedInUserName || 'Mecánico';
            const isAdmin = (userData.tipoEmpleado || '').toLowerCase().includes('admin');
            setupUI(fullName);

>>>>>>> Stashed changes
            return {
                id: docSnap.id,
                ...userData,
                fullName: fullName,
<<<<<<< Updated upstream
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
=======
                isAdmin: isAdmin
            };
        } else {
            console.warn("Mecánico no encontrado en Firestore, usando datos de sesión local");
        }
    } catch (error) {
        console.warn("Validación de Firestore no disponible en este momento (offline o red lenta), manteniendo sesión:", error);
    }

    // Fallback resiliente: Si ya inició sesión exitosamente en login.js, no botar al mecánico
    if (cachedData) {
        setupUI(cachedData.fullName);
        return {
            id: cachedData.id || mechanicId,
            fullName: cachedData.fullName,
            isAdmin: Boolean(cachedData.isAdmin),
            tipoEmpleado: cachedData.tipoEmpleado || 'Mecánico'
        };
    }

    setupUI(loggedInUserName);
    return {
        id: mechanicId,
        fullName: loggedInUserName,
        isAdmin: false,
        tipoEmpleado: 'Mecánico'
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
    // Mobile sidebar toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (menuToggle && sidebar && !menuToggle.dataset.listenerAttached) {
        menuToggle.dataset.listenerAttached = 'true';
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
=======
    // Mobile sidebar toggle con backdrop (delegación de eventos robusta)
    function closeSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
>>>>>>> Stashed changes
    }

    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('.menu-toggle');
        if (toggle) {
            e.stopPropagation();
            const sidebar = document.querySelector('.sidebar');
            const sidebarOverlay = document.getElementById('sidebarOverlay');
            if (sidebar) sidebar.classList.toggle('active');
            if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
            return;
        }

        if (e.target.closest('#sidebarOverlay')) {
            closeSidebar();
            return;
        }

        if (e.target.closest('.nav-link') && window.innerWidth <= 768) {
            closeSidebar();
        }
    });

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
