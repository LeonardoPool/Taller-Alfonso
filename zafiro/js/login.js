// Login de Mecánicos - Portal de Mecánicos (Zafiro)
import { 
    db, 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    getDoc, 
    analytics, 
    logEvent 
} from './firebase-config.js';
import { normalizeText, clearMechanicSession, getPortalUrl } from './auth-guard.js';

// Animación de fondo con hexágonos
function createBackgroundAnimation() {
    const animationContainer = document.getElementById('backgroundAnimation');
    if (!animationContainer) return;

    const colors = ['#4a6cf7', '#3a5ae0', '#2a4ac8'];

    for (let i = 0; i < 20; i++) {
        const hexagon = document.createElement('div');
        hexagon.classList.add('hexagon');

        const size = Math.random() * 80 + 40;
        hexagon.style.width = `${size}px`;
        hexagon.style.height = `${size * 0.788}px`;
        hexagon.style.left = `${Math.random() * 100}%`;
        hexagon.style.top = `${Math.random() * 100}%`;
        hexagon.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        hexagon.style.opacity = Math.random() * 0.1 + 0.1;

        const duration = Math.random() * 25 + 15;
        hexagon.style.animationDuration = `${duration}s`;
        hexagon.style.animationDelay = `${Math.random() * 10}s`;

        animationContainer.appendChild(hexagon);
    }
}

function onReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

onReady(async function () {
    // Si ya existe una sesión activa y válida en este portal, redirigir a admin.html
    if (localStorage.getItem('isLoggedIn') === 'true' && localStorage.getItem('mechanicId')) {
        window.location.href = getPortalUrl('admin.html');
        return;
    }

    createBackgroundAnimation();

    const loginButton = document.getElementById('loginButton');
    const mechanicSelect = document.getElementById('mechanicSelect');
    const pinInput = document.getElementById('pin');
    const selectError = document.getElementById('selectError');
    const pinError = document.getElementById('pinError');
    const successMessage = document.getElementById('successMessage');
    const loadingScreen = document.getElementById('firebaseLoading');
    const togglePin = document.getElementById('togglePin');

    // Timeout de seguridad para que la pantalla de carga nunca se quede congelada
    const hideLoadingSafety = setTimeout(() => {
        if (loadingScreen && loadingScreen.style.display !== 'none') {
            loadingScreen.style.opacity = '0';
            setTimeout(() => { loadingScreen.style.display = 'none'; }, 400);
        }
    }, 4500);

    // Cargar mecánicos disponibles
    try {
        const snapshot = await getDocs(collection(db, "colaboradores"));
        clearTimeout(hideLoadingSafety);

        if (mechanicSelect) {
            mechanicSelect.innerHTML = '<option value="" disabled selected>Selecciona tu nombre</option>';

            // Opción de admin de prueba/mantenimiento
            const adminOption = document.createElement('option');
            adminOption.value = "admin";
            adminOption.textContent = "Administrador (Mantenimiento)";
            mechanicSelect.appendChild(adminOption);

            if (!snapshot.empty) {
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    const rawTipo = (data.tipoEmpleado || '').toLowerCase();
                    const tipoNorm = normalizeText(data.tipoEmpleado);

                    // Incluir en el select si es mecánico o si no se especificó rol
                    if (!data.tipoEmpleado || tipoNorm.includes('mecan') || rawTipo.includes('mecán')) {
                        const option = document.createElement('option');
                        option.value = docSnap.id;
                        option.textContent = data.fullName || "Mecánico sin nombre";
                        mechanicSelect.appendChild(option);
                    }
                });
            }
        }

        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => { loadingScreen.style.display = 'none'; }, 400);
        }
    } catch (error) {
        clearTimeout(hideLoadingSafety);
        console.error("Error cargando mecánicos:", error);
        if (mechanicSelect) {
            mechanicSelect.innerHTML = '<option disabled selected>Error cargando mecánicos</option>';
        }
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => { loadingScreen.style.display = 'none'; }, 400);
        }
    }

    // Toggle visibilidad del PIN
    if (togglePin && pinInput) {
        togglePin.addEventListener('click', () => {
            if (pinInput.type === 'password') {
                pinInput.type = 'text';
                togglePin.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                pinInput.type = 'password';
                togglePin.classList.replace('fa-eye-slash', 'fa-eye');
            }
        });
    }

    // Solo números en PIN
    if (pinInput) {
        pinInput.addEventListener('input', function () {
            this.value = this.value.replace(/[^0-9]/g, '');
        });

        pinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }

    if (loginButton) {
        loginButton.addEventListener('click', handleLogin);
    }

    async function handleLogin() {
        const mechanicId = mechanicSelect?.value;
        const pin = pinInput?.value?.trim();

        if (selectError) selectError.style.display = 'none';
        if (pinError) pinError.style.display = 'none';

        let isValid = true;

        if (!mechanicId) {
            if (selectError) selectError.style.display = 'block';
            isValid = false;
        }

        if (!pin || pin.length !== 4) {
            if (pinError) {
                pinError.textContent = "El PIN debe tener 4 dígitos";
                pinError.style.display = 'block';
            }
            isValid = false;
        }

        if (!isValid) return;

        loginButton.disabled = true;
        loginButton.textContent = 'Validando acceso...';

        try {
            // Validación fija para Administrador
            if (mechanicId === "admin" && (pin === "2025" || pin === "0000" || pin === "1234" || pin === "Admin_2025")) {
                if (successMessage) successMessage.style.display = 'block';
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('mechanicLoggedIn', 'true');
                localStorage.setItem('loggedInUserName', 'Administrador');
                localStorage.setItem('mechanicPin', 'Admin_2025');
                localStorage.setItem('mechanicId', 'admin');
                localStorage.setItem('mechanicData', JSON.stringify({
                    id: 'admin',
                    fullName: 'Administrador',
                    tipoEmpleado: 'Administrador',
                    isAdmin: true
                }));

                setTimeout(() => {
                    window.location.href = getPortalUrl('admin.html');
                }, 500);
                return;
            }

            const docSnap = await getDoc(doc(db, "colaboradores", mechanicId));
            if (docSnap.exists()) {
                const mechanicData = docSnap.data();
                const expectedPin = String(mechanicData.pin ?? '').trim();
                const enteredPin = String(pin ?? '').trim();

                if (expectedPin === enteredPin) {
                    if (successMessage) successMessage.style.display = 'block';
                    const fullName = mechanicData.fullName || 'Mecánico';
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('mechanicLoggedIn', 'true');
                    localStorage.setItem('loggedInUserName', fullName);
                    localStorage.setItem('mechanicPin', enteredPin);
                    localStorage.setItem('mechanicId', mechanicId);
                    localStorage.setItem('tipoEmpleado', mechanicData.tipoEmpleado || 'Mecánico');
                    localStorage.setItem('mechanicData', JSON.stringify({
                        id: mechanicId,
                        fullName: fullName,
                        tipoEmpleado: mechanicData.tipoEmpleado || 'Mecánico',
                        isAdmin: (mechanicData.tipoEmpleado || '').toLowerCase().includes('admin')
                    }));

                    if (analytics) {
                        logEvent(analytics, 'mechanic_login_success');
                    }

                    setTimeout(() => {
                        window.location.href = getPortalUrl('admin.html');
                    }, 500);
                } else {
                    if (pinError) {
                        pinError.textContent = "PIN incorrecto. Intenta de nuevo.";
                        pinError.style.display = 'block';
                    }
                    loginButton.disabled = false;
                    loginButton.textContent = 'Acceder';
                }
            } else {
                if (selectError) {
                    selectError.textContent = "Mecánico no encontrado";
                    selectError.style.display = 'block';
                }
                loginButton.disabled = false;
                loginButton.textContent = 'Acceder';
            }
        } catch (error) {
            console.error("Error verificando acceso:", error);
            alert("Error de conexión al validar PIN: " + error.message);
            loginButton.disabled = false;
            loginButton.textContent = 'Acceder';
        }
    }
});
