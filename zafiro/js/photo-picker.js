// Photo Picker Modal - Selector de Origen de Fotografías (Cámara vs Galería)
// DEFCON5 PWA
(function() {
    function injectStyles() {
        if (document.getElementById('photo-picker-styles')) return;
        const style = document.createElement('style');
        style.id = 'photo-picker-styles';
        style.textContent = `
            .photo-source-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(15, 23, 42, 0.75);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.25s ease, visibility 0.25s ease;
                padding: 16px;
                box-sizing: border-box;
            }
            .photo-source-backdrop.active {
                opacity: 1;
                visibility: visible;
            }
            .photo-source-sheet {
                background: #1e293b;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 18px;
                max-width: 400px;
                width: 100%;
                padding: 24px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
                color: #f8fafc;
                text-align: center;
                transform: translateY(20px) scale(0.97);
                transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                box-sizing: border-box;
                font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
            }
            .photo-source-backdrop.active .photo-source-sheet {
                transform: translateY(0) scale(1);
            }
            .photo-source-icon-wrap {
                width: 56px;
                height: 56px;
                border-radius: 50%;
                background: rgba(74, 108, 247, 0.15);
                border: 1px solid rgba(74, 108, 247, 0.3);
                color: #4a6cf7;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                margin: 0 auto 14px auto;
            }
            .photo-source-title {
                font-size: 18px;
                font-weight: 700;
                margin: 0 0 6px 0;
                color: #ffffff;
            }
            .photo-source-subtitle {
                font-size: 13px;
                color: #94a3b8;
                margin: 0 0 20px 0;
                line-height: 1.4;
            }
            .photo-source-actions {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin-bottom: 16px;
            }
            .photo-option-btn {
                display: flex;
                align-items: center;
                gap: 14px;
                width: 100%;
                padding: 14px 16px;
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                background: rgba(255, 255, 255, 0.04);
                color: #f8fafc;
                cursor: pointer;
                font-family: inherit;
                text-align: left;
                transition: all 0.2s ease;
                box-sizing: border-box;
            }
            .photo-option-btn:hover, .photo-option-btn:focus {
                background: rgba(74, 108, 247, 0.15);
                border-color: rgba(74, 108, 247, 0.4);
                transform: translateY(-1px);
            }
            .photo-option-btn:active {
                transform: scale(0.98);
            }
            .photo-option-btn .btn-icon {
                width: 44px;
                height: 44px;
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                flex-shrink: 0;
            }
            .photo-option-btn.btn-camera .btn-icon {
                background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                color: #ffffff;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
            }
            .photo-option-btn.btn-gallery .btn-icon {
                background: linear-gradient(135deg, #10b981 0%, #047857 100%);
                color: #ffffff;
                box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
            }
            .photo-option-btn .btn-info {
                display: flex;
                flex-direction: column;
                flex-grow: 1;
            }
            .photo-option-btn .btn-title {
                font-size: 15px;
                font-weight: 600;
                color: #ffffff;
                margin-bottom: 2px;
            }
            .photo-option-btn .btn-desc {
                font-size: 12px;
                color: #94a3b8;
            }
            .photo-option-btn .btn-chevron {
                color: #64748b;
                font-size: 14px;
            }
            .photo-source-cancel {
                width: 100%;
                padding: 12px;
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 10px;
                color: #94a3b8;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: inherit;
            }
            .photo-source-cancel:hover {
                background: rgba(255, 255, 255, 0.06);
                color: #f8fafc;
            }
            @media (max-width: 540px) {
                .photo-source-backdrop {
                    align-items: flex-end;
                    padding: 0;
                }
                .photo-source-sheet {
                    max-width: 100%;
                    border-radius: 20px 20px 0 0;
                    padding: 24px 20px 32px 20px;
                    transform: translateY(100%);
                }
                .photo-source-backdrop.active .photo-source-sheet {
                    transform: translateY(0);
                }
            }
        `;
        document.head.appendChild(style);
    }

    let activeInput = null;

    function ensureModalDOM() {
        injectStyles();
        if (document.getElementById('photoSourceBackdrop')) return;

        const backdrop = document.createElement('div');
        backdrop.id = 'photoSourceBackdrop';
        backdrop.className = 'photo-source-backdrop';
        backdrop.innerHTML = `
            <div class="photo-source-sheet" role="dialog" aria-modal="true" aria-labelledby="photoModalTitle">
                <div class="photo-source-icon-wrap">
                    <i class="fas fa-camera"></i>
                </div>
                <h3 class="photo-source-title" id="photoModalTitle">Agregar Fotografía</h3>
                <p class="photo-source-subtitle">¿Deseas tomar una foto con la cámara o elegirla de la galería?</p>
                <div class="photo-source-actions">
                    <button type="button" class="photo-option-btn btn-camera" id="photoOptionCamera">
                        <div class="btn-icon"><i class="fas fa-camera"></i></div>
                        <div class="btn-info">
                            <span class="btn-title">Tomar Foto</span>
                            <span class="btn-desc">Abrir la cámara del dispositivo</span>
                        </div>
                        <i class="fas fa-chevron-right btn-chevron"></i>
                    </button>
                    <button type="button" class="photo-option-btn btn-gallery" id="photoOptionGallery">
                        <div class="btn-icon"><i class="fas fa-images"></i></div>
                        <div class="btn-info">
                            <span class="btn-title">Elegir de la Galería</span>
                            <span class="btn-desc">Seleccionar fotos almacenadas</span>
                        </div>
                        <i class="fas fa-chevron-right btn-chevron"></i>
                    </button>
                </div>
                <button type="button" class="photo-source-cancel" id="photoOptionCancel">
                    Cancelar
                </button>
            </div>
        `;

        document.body.appendChild(backdrop);

        // Click en Tomar Foto
        document.getElementById('photoOptionCamera').addEventListener('click', (e) => {
            e.stopPropagation();
            if (!activeInput) return;
            const input = activeInput;
            closePhotoSourceModal();
            // Para cámara: capture="environment" y sin multiple (en móviles multiple puede forzar galería)
            input.removeAttribute('multiple');
            input.setAttribute('capture', 'environment');
            setTimeout(() => {
                input.click();
            }, 60);
        });

        // Click en Galería
        document.getElementById('photoOptionGallery').addEventListener('click', (e) => {
            e.stopPropagation();
            if (!activeInput) return;
            const input = activeInput;
            closePhotoSourceModal();
            // Para galería: sin capture y con multiple
            input.removeAttribute('capture');
            input.setAttribute('multiple', '');
            setTimeout(() => {
                input.click();
            }, 60);
        });

        // Click en Cancelar
        document.getElementById('photoOptionCancel').addEventListener('click', (e) => {
            e.stopPropagation();
            closePhotoSourceModal();
        });

        // Click en backdrop para cerrar
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closePhotoSourceModal();
            }
        });

        // Tecla Escape para cerrar
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closePhotoSourceModal();
            }
        });
    }

    window.openPhotoSourceModal = function(targetInputId) {
        const input = typeof targetInputId === 'string' ? document.getElementById(targetInputId) : targetInputId;
        if (!input) {
            console.warn('[PhotoPicker] No se encontró el input objetivo:', targetInputId);
            return;
        }

        activeInput = input;
        ensureModalDOM();

        const backdrop = document.getElementById('photoSourceBackdrop');
        if (backdrop) {
            backdrop.classList.add('active');
        }
    };

    window.closePhotoSourceModal = function() {
        const backdrop = document.getElementById('photoSourceBackdrop');
        if (backdrop) {
            backdrop.classList.remove('active');
        }
        activeInput = null;
    };
})();
