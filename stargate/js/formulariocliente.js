// Formulario de Registro de Clientes - Portal Administrativo (Stargate)
import { initAuthGuard } from './auth-guard.js';
import { 
    db, 
    collection, 
    doc, 
    setDoc, 
    serverTimestamp 
} from './firebase-config.js';
import { enqueueOfflineOperation } from './pwa-manager.js';

function onReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

onReady(() => {
    initAuthGuard();

    const clientForm = document.getElementById('clientForm');
    const submitBtn = document.getElementById('submitClient');
    const statusMessage = document.getElementById('statusMessage');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    if (clientForm) {
        clientForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const clientName = document.getElementById('clientName')?.value?.trim();
            const phone = document.getElementById('phone')?.value?.trim();
            const email = document.getElementById('email')?.value?.trim();
            const company = document.getElementById('company')?.value?.trim();
            const address = document.getElementById('address')?.value?.trim();
            const notes = document.getElementById('notes')?.value?.trim() || "";

            if (!clientName) {
                alert("Por favor ingresa el nombre del cliente");
                return;
            }

            // Manejo de modo sin conexión (Offline Sync)
            if (!navigator.onLine) {
                try {
                    await enqueueOfflineOperation('CREATE_CLIENT', {
                        clientName,
                        phone: phone || "",
                        email: email || "",
                        company: company || "",
                        address: address || "",
                        notes: notes || "",
                        timestamp: new Date().toISOString()
                    });
                    if (statusMessage) {
                        statusMessage.innerHTML = `<i class="fas fa-clock"></i> Guardado localmente (Modo offline). Se sincronizará automáticamente al conectar a internet.`;
                        statusMessage.className = 'status-message info';
                        statusMessage.style.display = 'block';
                    }
                    clientForm.reset();
                } catch (e) {
                    alert("Error guardando cliente offline: " + e.message);
                }
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

            if (progressContainer) {
                progressContainer.style.display = 'block';
                progressBar.style.width = '30%';
                progressText.textContent = 'Conectando con la base de datos...';
            }

            try {
                if (progressBar) progressBar.style.width = '70%';
                if (progressText) progressText.textContent = 'Guardando cliente...';

                const newClientRef = doc(collection(db, "Clientes"));
                await setDoc(newClientRef, {
                    clientName,
                    phone: phone || "",
                    email: email || "",
                    company: company || "",
                    address: address || "",
                    notes: notes || "",
                    timestamp: serverTimestamp()
                });

                if (progressBar) progressBar.style.width = '100%';
                if (progressText) progressText.textContent = '¡Cliente guardado exitosamente!';

                if (statusMessage) {
                    statusMessage.innerHTML = `<i class="fas fa-check-circle"></i> ¡Cliente registrado con éxito! (ID: ${newClientRef.id})`;
                    statusMessage.className = 'status-message success';
                    statusMessage.style.display = 'block';
                }

                clientForm.reset();

                setTimeout(() => {
                    if (progressContainer) progressContainer.style.display = 'none';
                    if (statusMessage) statusMessage.style.display = 'none';
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Cliente';
                }, 4000);
            } catch (error) {
                console.error("Error al registrar cliente:", error);
                if (progressContainer) progressContainer.style.display = 'none';
                if (statusMessage) {
                    statusMessage.innerHTML = `<i class="fas fa-exclamation-circle"></i> Error al guardar cliente: ${error.message}`;
                    statusMessage.className = 'status-message error';
                    statusMessage.style.display = 'block';
                }
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Cliente';
            }
        });
    }
});
