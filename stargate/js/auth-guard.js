// Guardia de autenticación para Portal Administrativo (Stargate)
import { auth, signOut, onAuthStateChanged } from './firebase-config.js';

export function initAuthGuard(onUserAuthenticated) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Usuario autenticado en Firebase
            const displayName = user.displayName || user.email || 'Usuario';
            const firstName = displayName.split('@')[0].split(' ')[0];
            const firstLetter = firstName.charAt(0).toUpperCase();

            // Actualizar avatar en navbar si existe
            const userProfile = document.getElementById('userProfile') || document.querySelector('.user-profile');
            if (userProfile) {
                userProfile.textContent = firstLetter;
                userProfile.title = displayName;
            }

            // Actualizar bienvenida si existe
            const welcomeTitle = document.getElementById('welcomeTitle');
            if (welcomeTitle) {
                welcomeTitle.textContent = `Bienvenido de nuevo, ${firstName}`;
            }

            if (typeof onUserAuthenticated === 'function') {
                onUserAuthenticated(user);
            }
        } else {
            // Si hay sesión persistida localmente (recarga rápida o persistencia de sesión)
            const isLocalSession = localStorage.getItem('isLoggedIn') === 'true';
            if (isLocalSession) {
                const username = localStorage.getItem('username') || 'Usuario';
                const firstName = username.split('@')[0].split(' ')[0];
                const firstLetter = firstName.charAt(0).toUpperCase();

                const userProfile = document.getElementById('userProfile') || document.querySelector('.user-profile');
                if (userProfile) {
                    userProfile.textContent = firstLetter;
                    userProfile.title = username;
                }

                const welcomeTitle = document.getElementById('welcomeTitle');
                if (welcomeTitle) {
                    welcomeTitle.textContent = `Bienvenido de nuevo, ${firstName}`;
                }

                if (typeof onUserAuthenticated === 'function') {
                    onUserAuthenticated({ email: username, displayName: username });
                }
            } else {
                // Usuario no autenticado, redirigir al login
                localStorage.removeItem('isLoggedIn');
                window.location.href = 'index.html';
            }
        }
    });

    // Configurar botón de cerrar sesión
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
                signOut(auth).then(() => {
                    localStorage.removeItem('isLoggedIn');
                    localStorage.removeItem('username');
                    window.location.href = 'index.html';
                }).catch((error) => {
                    console.error('Error al cerrar sesión:', error);
                    localStorage.removeItem('isLoggedIn');
                    localStorage.removeItem('username');
                    window.location.href = 'index.html';
                });
            }
        });
    }

    // Configurar toggle para sidebar en dispositivos móviles
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
