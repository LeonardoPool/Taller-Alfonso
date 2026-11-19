// Lógica de Autenticación para Portal Administrativo (Stargate)
import { 
    auth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    analytics, 
    logEvent 
} from './firebase-config.js';

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function onReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

onReady(function() {
    const loginButton = document.getElementById('loginButton');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const successMessage = document.getElementById('successMessage');

    // Verificar si el usuario ya está autenticado
    onAuthStateChanged(auth, (user) => {
        if (user) {
            window.location.href = 'dashboard.html';
        }
    });

    async function handleLogin() {
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        // Resetear errores
        emailError.style.display = 'none';
        passwordError.style.display = 'none';

        let isValid = true;

        if (!email || !validateEmail(email)) {
            emailError.textContent = "Por favor ingresa un correo electrónico válido";
            emailError.style.display = 'block';
            isValid = false;
        }

        if (!password || password.length < 6) {
            passwordError.textContent = "La contraseña debe tener al menos 6 caracteres";
            passwordError.style.display = 'block';
            isValid = false;
        }

        if (!isValid) return;

        loginButton.disabled = true;
        loginButton.textContent = 'Validando...';

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            successMessage.style.display = 'block';

            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('username', userCredential.user.email);

            if (analytics) {
                logEvent(analytics, 'login_success');
            }

            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        } catch (error) {
            loginButton.disabled = false;
            loginButton.textContent = 'Iniciar sesión';

            let errorMessage = "Error al iniciar sesión";
            switch (error.code) {
                case 'auth/invalid-email':
                    errorMessage = "Formato de email inválido";
                    break;
                case 'auth/user-disabled':
                    errorMessage = "Usuario deshabilitado";
                    break;
                case 'auth/user-not-found':
                    errorMessage = "Usuario no registrado";
                    break;
                case 'auth/wrong-password':
                    errorMessage = "Contraseña incorrecta";
                    break;
                case 'auth/too-many-requests':
                    errorMessage = "Demasiados intentos fallidos. Inténtalo más tarde";
                    break;
                case 'auth/network-request-failed':
                    errorMessage = "Error de conexión. Verifica tu red";
                    break;
                default:
                    errorMessage = error.message || "Credenciales incorrectas";
            }

            emailError.textContent = errorMessage;
            emailError.style.display = 'block';

            if (analytics) {
                logEvent(analytics, 'login_failed', { reason: error.code });
            }
        }
    }

    loginButton.addEventListener('click', handleLogin);

    // Permitir iniciar sesión al presionar Enter
    [emailInput, passwordInput].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleLogin();
            }
        });
    });
});
