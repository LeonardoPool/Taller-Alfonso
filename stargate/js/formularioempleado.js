// Formulario de Registro de Colaboradores - Portal Administrativo (Stargate)
import { initAuthGuard } from './auth-guard.js';
import { 
    db, 
    collection, 
    addDoc, 
    serverTimestamp 
} from './firebase-config.js';

function onReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

onReady(() => {
    initAuthGuard();

    // Inicializar Flatpickr si está disponible
    if (typeof flatpickr !== 'undefined') {
        flatpickr("#hireDate", {
            dateFormat: "Y-m-d",
            locale: "es",
            maxDate: "today"
        });
    }

    // Toggle PIN visibility
    const togglePin = document.getElementById('togglePin');
    const pinInput = document.getElementById('pin');
    if (togglePin && pinInput) {
        togglePin.addEventListener('click', () => {
            const isPass = pinInput.type === 'password';
            pinInput.type = isPass ? 'text' : 'password';
            togglePin.classList.toggle('fa-eye', !isPass);
            togglePin.classList.toggle('fa-eye-slash', isPass);
        });
    }

    const form = document.getElementById('collaboratorForm');
    const submitBtn = document.getElementById('submitCollaborator');
    const statusMessage = document.getElementById('statusMessage');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fullName = document.getElementById('fullName')?.value?.trim();
            const hireDate = document.getElementById('hireDate')?.value?.trim();
            const curp = document.getElementById('curp')?.value?.trim();
            const rfc = document.getElementById('rfc')?.value?.trim();
            const employeeNumber = document.getElementById('employeeNumber')?.value?.trim();
            const pin = document.getElementById('pin')?.value?.trim();
            const tipoEmpleado = document.getElementById('tipoEmpleado')?.value;

            if (!fullName) {
                alert("Por favor ingresa el nombre completo");
                return;
            }

            if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
                alert("El PIN debe constar exactamente de 4 dígitos numéricos");
                return;
            }

            // Validar que el PIN no sea trivial (ej. 1111 o 1234)
            if (pin === pin[0].repeat(4)) {
                alert("El PIN no debe tener todos los dígitos repetidos (ej. 1111)");
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

            if (progressContainer) {
                progressContainer.style.display = 'block';
                progressBar.style.width = '35%';
                progressText.textContent = 'Verificando datos...';
            }

            try {
                if (progressBar) progressBar.style.width = '75%';
                if (progressText) progressText.textContent = 'Registrando colaborador en Firestore...';

                const docRef = await addDoc(collection(db, "colaboradores"), {
                    fullName,
                    hireDate: hireDate || "",
                    curp: curp || "",
                    rfc: rfc || "",
                    employeeNumber: employeeNumber || "",
                    pin,
                    tipoEmpleado: tipoEmpleado || "Mecánico",
                    timestamp: serverTimestamp()
                });

                if (progressBar) progressBar.style.width = '100%';
                if (progressText) progressText.textContent = '¡Colaborador guardado con éxito!';

                if (statusMessage) {
                    statusMessage.innerHTML = `<i class="fas fa-check-circle"></i> ¡Colaborador registrado con éxito! (ID: ${docRef.id})`;
                    statusMessage.className = 'status-message success';
                    statusMessage.style.display = 'block';
                }

                form.reset();

                setTimeout(() => {
                    if (progressContainer) progressContainer.style.display = 'none';
                    if (statusMessage) statusMessage.style.display = 'none';
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Colaborador';
                }, 4000);
            } catch (error) {
                console.error("Error al registrar colaborador:", error);
                if (progressContainer) progressContainer.style.display = 'none';
                if (statusMessage) {
                    statusMessage.innerHTML = `<i class="fas fa-exclamation-circle"></i> Error: ${error.message}`;
                    statusMessage.className = 'status-message error';
                    statusMessage.style.display = 'block';
                }
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Colaborador';
            }
        });
    }
});
