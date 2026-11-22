// Generador de Reporte PDF Oficial - Taller Mecánico Alfonso Diésel (Portal Empleados / Zafiro)
// Formato ejecutivo oficial DEFCON 5 / Taller Alfonso
// Conserva el 100% de los datos del negocio, logo corporativo, evidencias fotográficas y registros operativos

export async function generateJobServiceReport(job) {
    if (!job) {
        alert("No se especificaron datos del trabajo.");
        return;
    }

    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        alert("La biblioteca jsPDF no está disponible. Por favor recarga la página.");
        return;
    }

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    // Helpers seguros
    const safeArray = v => Array.isArray(v) ? v : [];
    const safeText = (v, fallback = '—') => {
        if (v === null || v === undefined) return fallback;
        const s = String(v).trim();
        return s === '' ? fallback : s;
    };
    const toDate = (v) => {
        try {
            if (!v) return new Date();
            if (typeof v.toDate === 'function') return v.toDate();
            const d = new Date(v);
            return isNaN(d.getTime()) ? new Date() : d;
        } catch {
            return new Date();
        }
    };

    // Extracción y normalización de datos
    const clientName = safeText(job?.client?.name);
    const clientCompany = safeText(job?.client?.company);
    const clientDriver = safeText(job?.workDetails?.driverName || job?.driver, 'N/A');
    const clientContact = safeText(job?.client?.phone || job?.client?.contact, 'N/A');

    const unit = safeText(job?.vehicle?.unit);
    const plates = safeText(job?.vehicle?.plates);
    const engineNumber = safeText(job?.vehicle?.engineNumber, 'Sin');
    const displacement = safeText(job?.vehicle?.displacement || job?.vehicle?.engineModel, unit);

    const fuelLevel = safeText(job?.vehicle?.dieselLevel, '1/2');
    const oilPressure = safeText(job?.vehicle?.oilPressure, '40 psi');
    const tireCondition = safeText(job?.vehicle?.tireCondition, 'Normal');
    const cabinCondition = safeText(job?.vehicle?.cabinCondition, 'Normal');
    const engineStart = safeText(job?.vehicle?.engineStart, 'Enciende normal');
    const spareTire = job?.workDetails?.hasSpare === 'si' ? 'Tiene refacción' : 'Sin refacción';

    const mechanic = safeText(job?.mechanic, 'TALLER ALFONSO');
    const diagnosis = safeText(job?.workDetails?.diagnosis, 'No se registró diagnóstico para este servicio.');
    const statusText = safeText(job?.status, 'Trabajo empezado y en trabajando');
    const usedParts = safeArray(job?.workDetails?.usedParts || job?.usedParts);
    const outsideParts = safeText(job?.workDetails?.outsideParts, '');

    const createdAt = toDate(job?.createdAt);
    const today = new Date();

    // Formateo de fechas estilo "03 de noviembre de 2026 a las 06:39"
    const formatSpanishDateTime = (d) => {
        try {
            const day = d.toLocaleDateString('es-ES', { day: '2-digit' });
            const month = d.toLocaleDateString('es-ES', { month: 'long' });
            const year = d.getFullYear();
            const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            return `${day} de ${month} de ${year} a las ${time}`;
        } catch {
            return d.toLocaleDateString('es-ES');
        }
    };

    const regDateStr = formatSpanishDateTime(createdAt);
    const printDateStr = formatSpanishDateTime(today);

    // Folio de servicio profesional: sin '#' y sin 'DEF'
    let folioStr = '';
    if (job?.folio) {
        folioStr = String(job.folio);
    } else if (job?.id) {
        const cleanId = String(job.id).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        folioStr = cleanId.substring(0, 10);
    } else {
        const cleanUnit = unit.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        folioStr = cleanUnit || 'SRV01';
    }
    // Eliminar cualquier símbolo '#' y prefijo 'DEF' o 'DEF-'
    folioStr = folioStr.replace(/^[#\s]+/, '').replace(/^DEF[-_]?/i, '').trim();
    if (!folioStr) folioStr = 'SRV-01';

    // Dimensiones y Paleta Oficial (Taller Alfonso - Rojo Vino / Borgoña Corporativo)
    const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
    const margin = 14;
    const contentWidth = pageWidth - (margin * 2);        // 182 mm

    const Palette = {
        navyBg: [50, 16, 20],         // Borgoña oscuro (#321014)
        navyBanner: [139, 30, 30],    // Rojo vino corporativo oficial (#8B1E1E)
        accentBlue: [185, 28, 28],    // Rojo carmesí (#B91C1C)
        accentGreen: [16, 185, 129],  // Verde esmeralda (#10b981)
        lightBg: [254, 248, 248],     // Fondo de cajas suave (#fef8f8)
        border: [238, 215, 218],      // Borde claro (#eed7da)
        borderDark: [205, 168, 172],  // Borde intermedio (#cda8ac)
        textDark: [24, 24, 27],       // Texto casi negro (#18181b)
        textMuted: [113, 113, 122],   // Texto gris/etiquetas (#71717a)
        white: [255, 255, 255]
    };

    // ==========================================
    // 1. BANNER SUPERIOR OSCURO (ENCABEZADO COMPLETO)
    // ==========================================
    const bannerHeight = 30;
    doc.setFillColor(...Palette.navyBanner);
    doc.rect(0, 0, pageWidth, bannerHeight, 'F');

    // Carga e incrustación ajustada y proporcional del logo corporativo oficial
    const logoUrl = 'https://firebasestorage.googleapis.com/v0/b/taller-alfoso-mecanico-diesel.firebasestorage.app/o/logo.jpg?alt=media&token=081b7e59-e14f-42cc-a5ff-83a88e6acc2d';
    let textStartX = margin;
    try {
        const logoData = await loadImageAsDataUrl(logoUrl, 3500);
        if (logoData) {
            const maxW = 32;
            const maxH = 20;
            let logoW = maxW;
            let logoH = maxH;
            if (logoData.width && logoData.height) {
                const aspect = logoData.width / logoData.height;
                if (aspect > (maxW / maxH)) {
                    logoW = maxW;
                    logoH = maxW / aspect;
                } else {
                    logoH = maxH;
                    logoW = maxH * aspect;
                }
            }
            const padX = 2;
            const padY = 1.5;
            const boxW = logoW + (padX * 2);
            const boxH = logoH + (padY * 2);
            const boxX = margin;
            const boxY = (bannerHeight - boxH) / 2;

            doc.setFillColor(...Palette.white);
            doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'F');
            doc.addImage(logoData.dataUrl, 'JPEG', boxX + padX, boxY + padY, logoW, logoH, undefined, 'FAST');
            textStartX = boxX + boxW + 4;
        }
    } catch (e) {
        console.warn('Error al cargar logo:', e);
    }

    // Título y datos de la empresa en el encabezado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...Palette.white);
    doc.text('TALLER ALFONSO', textStartX, 10.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(255, 230, 230);
    doc.text('CENTRO INTEGRAL DE SERVICIO AUTOMOTRIZ & DIÉSEL PESADO', textStartX, 15.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(245, 205, 205);
    doc.text('PEDRO ALFONSO CAUICH PECH  •  Calle 136 #1157 x 73 y 75 col. Susulá Xoclán', textStartX, 19.5);
    doc.text('Tel: (999) 163-9673  •  Correo: talleralfonso@hotmail.com  •  Mérida, Yucatán', textStartX, 23.5);

    // Tarjeta del Folio a la derecha del banner
    const folioBoxW = 46;
    const folioBoxH = 18;
    const folioBoxX = pageWidth - margin - folioBoxW;
    const folioBoxY = (bannerHeight - folioBoxH) / 2;

    doc.setFillColor(74, 14, 16);
    doc.setDrawColor(185, 28, 28);
    doc.setLineWidth(0.4);
    doc.roundedRect(folioBoxX, folioBoxY, folioBoxW, folioBoxH, 2.5, 2.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(254, 202, 202);
    doc.text('FOLIO DE SERVICIO', folioBoxX + (folioBoxW / 2), folioBoxY + 5.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...Palette.white);
    doc.text(folioStr, folioBoxX + (folioBoxW / 2), folioBoxY + 12.5, { align: 'center' });

    // Franja roja de separación
    doc.setFillColor(...Palette.accentBlue);
    doc.rect(0, bannerHeight, pageWidth, 2, 'F');

    // ==========================================
    // 2. SUB-ENCABEZADO DE METADATOS Y PÍLDORA DE ESTADO
    // ==========================================
    let y = bannerHeight + 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...Palette.textMuted);
    doc.text(`Fecha de Registro: ${regDateStr}`, margin, y + 4.5);
    doc.text(`Impreso: ${printDateStr}`, margin + 74, y + 4.5);

    // Píldora de estado a la derecha (fondo azul vibrante, texto blanco)
    const pillW = 58;
    const pillH = 6.5;
    const pillX = pageWidth - margin - pillW;
    doc.setFillColor(...Palette.accentBlue);
    doc.roundedRect(pillX, y, pillW, pillH, 2, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...Palette.white);
    const cleanStatus = statusText.toUpperCase();
    doc.text(cleanStatus, pillX + (pillW / 2), y + 4.5, { align: 'center' });

    y += 9.5;

    // ==========================================
    // 3. TARJETAS: DATOS DEL CLIENTE Y DE LA UNIDAD
    // ==========================================
    const cardW = (contentWidth - 6) / 2;
    const cardH = 31;
    const col1X = margin;
    const col2X = margin + cardW + 6;

    // --- Tarjeta Cliente ---
    doc.setFillColor(...Palette.lightBg);
    doc.setDrawColor(...Palette.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(col1X, y, cardW, cardH, 2.5, 2.5, 'FD');

    // Indicador azul vertical y título
    doc.setFillColor(...Palette.accentBlue);
    doc.rect(col1X + 4, y + 4, 2.5, 4.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...Palette.navyBg);
    doc.text('DATOS DEL CLIENTE', col1X + 9, y + 7.5);

    // Filas cliente
    let cY = y + 13.5;
    const printClientRow = (label, val) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...Palette.textDark);
        doc.text(label, col1X + 5, cY);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(...Palette.textDark);
        doc.text(val, col1X + 22, cY);
        cY += 4.5;
    };

    printClientRow('Cliente:', clientName);
    printClientRow('Empresa:', clientCompany);
    printClientRow('Chofer:', clientDriver);
    printClientRow('Contacto:', clientContact);

    // --- Tarjeta Unidad ---
    doc.setFillColor(...Palette.lightBg);
    doc.setDrawColor(...Palette.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(col2X, y, cardW, cardH, 2.5, 2.5, 'FD');

    // Indicador verde vertical y título
    doc.setFillColor(...Palette.accentGreen);
    doc.rect(col2X + 4, y + 4, 2.5, 4.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...Palette.navyBg);
    doc.text('DATOS DE LA UNIDAD', col2X + 9, y + 7.5);

    // Filas unidad
    let uY = y + 13.5;
    const printUnitRow = (label, val) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...Palette.textDark);
        doc.text(label, col2X + 5, uY);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(...Palette.textDark);
        doc.text(val, col2X + 24, uY);
        uY += 4.5;
    };

    printUnitRow('Unidad:', unit);
    printUnitRow('Placas:', plates);
    printUnitRow('No. Motor:', engineNumber);
    printUnitRow('Cilindrada:', displacement);

    y += cardH + 4;

    // ==========================================
    // 4. INSPECCIÓN Y CONDICIÓN DE RECEPCIÓN DE LA UNIDAD
    // ==========================================
    const secHeaderH = 6.2;
    doc.setFillColor(...Palette.navyBg);
    doc.roundedRect(margin, y, contentWidth, secHeaderH, 1.5, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...Palette.white);
    doc.text('INSPECCIÓN Y CONDICIÓN DE RECEPCIÓN DE LA UNIDAD', margin + 5, y + 4.3);
    y += secHeaderH;

    const inspH = 15;
    doc.setFillColor(...Palette.lightBg);
    doc.setDrawColor(...Palette.border);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, inspH, 'FD');

    // 3 columnas x 2 filas
    const colW3 = contentWidth / 3;

    // Fila 1
    const printInspItem = (label, val, xPos, yPos) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...Palette.textMuted);
        doc.text(label, xPos + 4, yPos);

        const labelW = doc.getTextWidth(label);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...Palette.textDark);
        doc.text(val, xPos + 5 + labelW, yPos);
    };

    printInspItem('Nivel de Combustible:', fuelLevel, margin, y + 5.5);
    printInspItem('Presión de Aceite:', oilPressure, margin + colW3, y + 5.5);
    printInspItem('Estado de Llantas:', tireCondition, margin + (colW3 * 2), y + 5.5);

    // Fila 2
    printInspItem('Cabina / Interiores:', cabinCondition, margin, y + 11.5);
    printInspItem('Encendido de Motor:', engineStart, margin + colW3, y + 11.5);
    printInspItem('Llanta de Refacción:', spareTire, margin + (colW3 * 2), y + 11.5);

    y += inspH + 4;

    // ==========================================
    // 5. DIAGNÓSTICO TÉCNICO Y TRABAJOS SOLICITADOS
    // ==========================================
    doc.setFillColor(...Palette.navyBg);
    doc.roundedRect(margin, y, contentWidth, secHeaderH, 1.5, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...Palette.white);
    doc.text('DIAGNÓSTICO TÉCNICO Y TRABAJOS SOLICITADOS', margin + 5, y + 4.3);
    y += secHeaderH;

    const diagLines = doc.splitTextToSize(diagnosis, contentWidth - 36);
    const diagBoxH = Math.max(18, (diagLines.length * 4) + 12);

    doc.setFillColor(...Palette.lightBg);
    doc.setDrawColor(...Palette.border);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, diagBoxH, 'FD');

    // Técnico Responsable
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...Palette.accentBlue);
    doc.text('Técnico Responsable:', margin + 5, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...Palette.navyBg);
    doc.text(mechanic, margin + 35, y + 5.5);

    // Diagnóstico Técnico
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...Palette.textDark);
    doc.text('Diagnóstico Técnico:', margin + 5, y + 10.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...Palette.textDark);
    doc.text(diagLines, margin + 35, y + 10.5);

    y += diagBoxH + 4;

    // ==========================================
    // 6. RELACIÓN DE REFACCIONES Y MATERIALES INSTALADOS
    // ==========================================
    doc.setFillColor(...Palette.navyBg);
    doc.roundedRect(margin, y, contentWidth, secHeaderH, 1.5, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...Palette.white);
    doc.text('RELACIÓN DE REFACCIONES Y MATERIALES INSTALADOS', margin + 5, y + 4.3);
    y += secHeaderH;

    // Cabecera de la tabla
    const thH = 5.8;
    doc.setFillColor(...Palette.lightBg);
    doc.setDrawColor(...Palette.border);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, thH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...Palette.navyBg);
    doc.text('No.', margin + 4, y + 4);
    doc.text('CÓDIGO / SERIE', margin + 16, y + 4);
    doc.text('DESCRIPCIÓN DE LA PIEZA O REFACCIÓN', margin + 56, y + 4);
    doc.text('CANTIDAD', margin + 135, y + 4);
    doc.text('ORIGEN', margin + 158, y + 4);
    y += thH;

    if (usedParts.length > 0) {
        usedParts.forEach((part, pIdx) => {
            const pName = safeText(part?.name || part?.partName, 'Pieza');
            const pSerial = safeText(part?.serial || part?.serialNumber, '—');
            const rowH = 5.5;

            doc.setFillColor(pIdx % 2 === 0 ? 255 : 248, pIdx % 2 === 0 ? 255 : 250, pIdx % 2 === 0 ? 255 : 252);
            doc.rect(margin, y, contentWidth, rowH, 'F');

            doc.setDrawColor(...Palette.border);
            doc.setLineWidth(0.2);
            doc.line(margin, y + rowH, margin + contentWidth, y + rowH);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.2);
            doc.setTextColor(...Palette.textDark);
            doc.text(String(pIdx + 1), margin + 4, y + 3.8);
            doc.text(pSerial, margin + 16, y + 3.8);
            doc.text(pName, margin + 56, y + 3.8);
            doc.text('1', margin + 140, y + 3.8);
            doc.setTextColor(...Palette.textMuted);
            doc.text('Almacén', margin + 158, y + 3.8);

            y += rowH;
        });
    } else {
        doc.setFillColor(...Palette.white);
        doc.rect(margin, y, contentWidth, 6.5, 'F');
        doc.setDrawColor(...Palette.border);
        doc.setLineWidth(0.2);
        doc.line(margin, y + 6.5, margin + contentWidth, y + 6.5);

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.2);
        doc.setTextColor(...Palette.textMuted);
        doc.text('No se registraron piezas de almacén para esta orden de servicio.', margin + 5, y + 4.3);
        y += 6.5;
    }

    // Piezas externas si las hay
    if (outsideParts && outsideParts !== 'No se registraron piezas externas') {
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, y, contentWidth, 5.5, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...Palette.textDark);
        doc.text(`Piezas Externas: ${outsideParts}`, margin + 5, y + 3.8);
        y += 5.5;
    }

    // ==========================================
    // 7. EVIDENCIA FOTOGRÁFICA Y CONTROL DE CALIDAD
    // ==========================================
    const allPhotos = extractPhotosForPdf(job?.photos);

    if (allPhotos.length > 0) {
        // Carga paralela de fotos sin alterar su fidelidad
        const loadedPhotos = await Promise.all(
            allPhotos.map(async (p) => {
                const imgData = await loadImageAsDataUrl(p.url, 4500);
                return imgData ? { ...p, ...imgData } : null;
            })
        );
        const validPhotos = loadedPhotos.filter(Boolean);

        if (validPhotos.length > 0) {
            // Iniciar fotos en página dedicada
            doc.addPage();

            const printPhotoPageBanner = (suffix = '') => {
                // Banner superior que coincide con el estilo de la primera página
                doc.setFillColor(...Palette.navyBanner);
                doc.rect(0, 0, pageWidth, 22, 'F');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.setTextColor(...Palette.white);
                doc.text(`EVIDENCIA FOTOGRÁFICA Y CONTROL DE CALIDAD${suffix}`, margin, 11);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(180, 195, 215);
                doc.text(`Unidad: ${unit}  •  Placas: ${plates}  •  Registro visual del servicio técnico`, margin, 16.5);

                doc.setFillColor(...Palette.accentBlue);
                doc.rect(0, 22, pageWidth, 1.5, 'F');
            };

            printPhotoPageBanner();
            let photoY = 30;

            const photosPerPage = 4; // Cuadrícula 2x2
            const cellW = (contentWidth - 8) / 2; // ~87 mm
            const cellH = 58; // 58 mm

            let countOnPage = 0;
            let photoPageIndex = 1;

            for (let i = 0; i < validPhotos.length; i++) {
                if (countOnPage >= photosPerPage) {
                    doc.addPage();
                    photoPageIndex++;
                    printPhotoPageBanner(` (HOJA ${photoPageIndex})`);
                    photoY = 30;
                    countOnPage = 0;
                }

                const col = countOnPage % 2;
                const row = Math.floor(countOnPage / 2);
                const x = margin + col * (cellW + 8);
                const yPos = photoY + row * (cellH + 13);

                const photo = validPhotos[i];

                // Badge de categoría superior
                doc.setFillColor(...Palette.navyBg);
                doc.roundedRect(x, yPos, cellW, 5.8, 1.5, 1.5, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.setTextColor(...Palette.white);
                doc.text(photo.title.toUpperCase(), x + (cellW / 2), yPos + 4, { align: 'center' });

                // Marco contenedor de la imagen
                const imgBoxY = yPos + 6.2;
                const imgBoxH = cellH;
                doc.setFillColor(...Palette.lightBg);
                doc.setDrawColor(...Palette.border);
                doc.setLineWidth(0.3);
                doc.roundedRect(x, imgBoxY, cellW, imgBoxH, 1.5, 1.5, 'FD');

                // Renderizado con preservación de proporciones (sin distorsión)
                try {
                    const imgAspect = (photo.width && photo.height) ? (photo.width / photo.height) : (cellW / imgBoxH);
                    const boxAspect = cellW / imgBoxH;
                    let drawW = cellW - 2;
                    let drawH = imgBoxH - 2;
                    let drawX = x + 1;
                    let drawY = imgBoxY + 1;

                    if (imgAspect > boxAspect) {
                        drawW = cellW - 2;
                        drawH = drawW / imgAspect;
                        drawY = imgBoxY + 1 + ((imgBoxH - 2 - drawH) / 2);
                    } else {
                        drawH = imgBoxH - 2;
                        drawW = drawH * imgAspect;
                        drawX = x + 1 + ((cellW - 2 - drawW) / 2);
                    }

                    doc.addImage(photo.dataUrl, 'JPEG', drawX, drawY, drawW, drawH, undefined, 'FAST');
                } catch (imgErr) {
                    console.warn('Error dibujando foto:', imgErr);
                    doc.setFont('helvetica', 'italic');
                    doc.setFontSize(7);
                    doc.setTextColor(...Palette.textMuted);
                    doc.text('Foto no disponible', x + (cellW / 2), imgBoxY + (imgBoxH / 2), { align: 'center' });
                }

                countOnPage++;
            }
        }
    }

    // ==========================================
    // 8. PIE DE PÁGINA EN TODAS LAS HOJAS
    // ==========================================
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        const footerY = pageHeight - 7;

        doc.setDrawColor(...Palette.border);
        doc.setLineWidth(0.25);
        doc.line(margin, footerY - 2.5, pageWidth - margin, footerY - 2.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...Palette.textMuted);
        doc.text('DEFCON 5  •  Taller Mecánico Alfonso Diésel  •  Mérida, Yucatán  •  Tel: (999) 163-9673', margin, footerY);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(...Palette.navyBg);
        doc.text(`Página ${p} de ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
    }

    // Descarga del PDF generado
    const unitForFile = unit.replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`reporte-${unitForFile}.pdf`);
}

// Extracción ordenada de categorías fotográficas
function extractPhotosForPdf(photos) {
    if (!photos) return [];

    const categories = {
        front: 'Frente Delantero',
        right: 'Lateral Derecho',
        engine: 'Motor',
        exterior: 'Exterior',
        rear: 'Frente Trasero',
        left: 'Lateral Izquierdo',
        interior: 'Interior',
        plate: 'Placas',
        mirror: 'Espejos',
        rearview: 'Retrovisores',
        damage: 'Inspección de Daños',
        antes: 'Antes del Trabajo',
        despues: 'Después del Trabajo'
    };

    const result = [];

    if (Array.isArray(photos)) {
        photos.forEach((p, idx) => {
            const url = typeof p === 'string' ? p : (p?.url || '');
            if (url && url.startsWith('http')) {
                result.push({ url, title: `Evidencia ${idx + 1}` });
            }
        });
        return result;
    }

    if (typeof photos === 'object') {
        const categoryOrder = ['front', 'right', 'engine', 'exterior', 'rear', 'left', 'interior', 'plate', 'mirror', 'rearview', 'damage', 'antes', 'despues'];
        const allKeys = Object.keys(photos);

        const sortedKeys = [
            ...categoryOrder.filter(k => allKeys.includes(k)),
            ...allKeys.filter(k => !categoryOrder.includes(k))
        ];

        for (const cat of sortedKeys) {
            const val = photos[cat];
            const title = categories[cat.toLowerCase()] || (cat.charAt(0).toUpperCase() + cat.slice(1));

            if (Array.isArray(val)) {
                val.forEach(url => {
                    const clean = typeof url === 'string' ? url : (url?.url || '');
                    if (clean && clean.startsWith('http')) {
                        result.push({ url: clean, title });
                    }
                });
            } else if (typeof val === 'string' && val.startsWith('http')) {
                result.push({ url: val, title });
            }
        }
    }

    return result;
}

// Carga asíncrona de imagen con límite y preservación de nitidez
async function loadImageAsDataUrl(url, timeoutMs = 4500) {
    return new Promise((resolve) => {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            return resolve(null);
        }

        const img = new Image();
        img.crossOrigin = 'Anonymous';

        const timer = setTimeout(() => {
            img.src = '';
            resolve(null);
        }, timeoutMs);

        img.onload = () => {
            clearTimeout(timer);
            try {
                const maxDim = 1000;
                let w = img.naturalWidth || img.width || 800;
                let h = img.naturalHeight || img.height || 600;

                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    } else {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
                resolve({ dataUrl, width: w, height: h });
            } catch (err) {
                console.warn('Error convirtiendo imagen:', err);
                resolve(null);
            }
        };

        img.onerror = () => {
            clearTimeout(timer);
            resolve(null);
        };

        img.src = url;
    });
}

// ==============================================================
// GENERADOR OFICIAL: REPORTE DE ENTRADA Y SALIDA DE UNIDADES
// Formato, estructura y colores 100% idénticos al documento físico
// ==============================================================
export async function generateEntryExitReport(job) {
    if (!job) {
        alert("No se especificaron datos del trabajo.");
        return;
    }

    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        alert("La biblioteca jsPDF no está disponible. Por favor recarga la página.");
        return;
    }

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
    const margin = 18;
    const contentWidth = pageWidth - (margin * 2);        // 174 mm

    const safeText = (v, fallback = '—') => {
        if (v === null || v === undefined) return fallback;
        const s = String(v).trim();
        return s === '' ? fallback : s;
    };

    const toDate = (v) => {
        try {
            if (!v) return null;
            if (typeof v.toDate === 'function') return v.toDate();
            const d = new Date(v);
            return isNaN(d.getTime()) ? null : d;
        } catch {
            return null;
        }
    };

    const formatSpanishDate = (d) => {
        if (!d) return '—';
        try {
            const day = d.toLocaleDateString('es-ES', { day: '2-digit' });
            const month = d.toLocaleDateString('es-ES', { month: 'long' });
            const year = d.getFullYear();
            return `${day} de ${month} de ${year}`;
        } catch {
            return d.toLocaleDateString('es-ES');
        }
    };

    // Extraer datos de Entrada
    const entryDate = toDate(job.entryDriver?.capturedAt || job.createdAt) || new Date();
    const entryDateStr = formatSpanishDate(entryDate);
    const plates = safeText(job.vehicle?.plates, 'N/A');
    const model = safeText(job.vehicle?.model || job.vehicle?.unit, 'N/A');
    const entryDriverName = safeText(job.entryDriver?.driverName || job.workDetails?.driverName, 'N/A');
    const entryCompany = safeText(job.entryDriver?.company || job.client?.company, 'N/A');
    const entryIneNumber = 'SE ANEXA IDENTIFICACIÓN (INE)';
    const entryReporter = safeText(job.mechanic || 'PEDRO ALFONSO CAUICH PECH');

    // Extraer datos de Salida
    const exitDriverData = job.exitDriver || {};
    const isSameDriver = Boolean(exitDriverData.isSameDriver);
    const exitDate = toDate(exitDriverData.exitDate || exitDriverData.completedAt || job.endTime);
    const exitDateStr = exitDate ? formatSpanishDate(exitDate) : 'Pendiente de entrega';
    const exitPlates = safeText(exitDriverData.plates || job.vehicle?.plates, plates);
    const exitModel = safeText(exitDriverData.model || job.vehicle?.model || job.vehicle?.unit, model);
    const exitCompany = safeText(exitDriverData.company || job.client?.company, entryCompany);
    const exitDriverName = isSameDriver ? entryDriverName : safeText(exitDriverData.driverName, 'Pendiente');
    const exitIneNumber = 'SE ANEXA IDENTIFICACIÓN (INE)';
    const exitReporter = safeText(exitDriverData.reportedBy || job.mechanic || 'PEDRO ALFONSO CAUICH PECH');

    // Paleta oficial Taller Alfonso
    const redWine = [139, 30, 30];     // #8B1E1E
    const darkWine = [92, 20, 20];     // #5C1414
    const textDark = [20, 20, 24];
    const textMuted = [80, 80, 90];
    const lineGray = [160, 160, 170];

    // ==========================================
    // 1. LOGO Y ENCABEZADO
    // ==========================================
    const logoUrl = 'https://firebasestorage.googleapis.com/v0/b/taller-alfoso-mecanico-diesel.firebasestorage.app/o/logo.jpg?alt=media&token=081b7e59-e14f-42cc-a5ff-83a88e6acc2d';
    let logoData = null;
    try {
        logoData = await loadImageAsDataUrl(logoUrl, 3000);
    } catch (e) {
        console.warn('No se pudo cargar logo:', e);
    }

    if (logoData) {
        doc.addImage(logoData.dataUrl, 'JPEG', pageWidth - margin - 38, 12, 38, 26, undefined, 'FAST');
    }

    // Título centrado idéntico al documento original
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.setTextColor(...textDark);
    doc.text('ENTRADA Y SALIDA DE UNIDADES', pageWidth / 2, 28, { align: 'center' });

    // ==========================================
    // 2. SECCIÓN: ENTRADA DE UNIDAD (Recepción)
    // ==========================================
    let y = 46;

    const drawFieldLine = (label, value, xStart, currentY, fieldWidth) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...textDark);
        doc.text(label, xStart, currentY);

        const labelW = doc.getTextWidth(label) + 2;
        const lineX = xStart + labelW;
        const lineW = Math.max(20, fieldWidth - labelW);

        doc.setDrawColor(...lineGray);
        doc.setLineWidth(0.3);
        doc.line(lineX, currentY + 0.8, lineX + lineW, currentY + 0.8);

        if (value && value !== '—') {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...redWine);
            doc.text(String(value), lineX + 2, currentY - 0.2);
        }
        return lineX + lineW;
    };

    // Fila 1: EL DÍA _____ SE RECIBE LA UNIDAD CON PLACAS _____
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...textDark);

    const f1Part1 = 'EL DIA ';
    doc.text(f1Part1, margin, y);
    let curX = margin + doc.getTextWidth(f1Part1) + 1;
    doc.line(curX, y + 0.8, curX + 46, y + 0.8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...redWine);
    doc.text(entryDateStr, curX + 2, y - 0.2);

    curX += 48;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textDark);
    const f1Part2 = 'SE RECIBE LA UNIDAD CON PLACAS ';
    doc.text(f1Part2, curX, y);
    curX += doc.getTextWidth(f1Part2) + 1;
    const placasW = (margin + contentWidth) - curX;
    doc.line(curX, y + 0.8, curX + placasW, y + 0.8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...redWine);
    doc.text(plates, curX + 2, y - 0.2);

    // Fila 2: MODELO _____
    y += 9.5;
    drawFieldLine('MODELO ', model, margin, y, 70);

    // Fila 3: AL CHOFER O ENCARGADO _____
    y += 9.5;
    drawFieldLine('AL CHOFER O ENCARGADO ', entryDriverName, margin, y, contentWidth);

    // Fila 4: DE LA EMPRESA _____
    y += 9.5;
    drawFieldLine('DE LA EMPRESA ', entryCompany, margin, y, contentWidth);

    // Fila 5: CON NUMERO DE IDENTIFICACIÓN _____
    y += 9.5;
    drawFieldLine('CON NUMERO DE IDENTIFICACIÓN ', entryIneNumber, margin, y, 95);

    // Fila 6: NOMBRE DE QUIEN REALIZAR REPORTE _____
    y += 12;
    drawFieldLine('NOMBRE DE QUIEN REALIZAR REPORTE ', entryReporter, margin, y, contentWidth);

    // Espacio de Firma Chofer Entrada
    y += 24;
    const sigLineW = 75;
    const sigX = (pageWidth - sigLineW) / 2;
    doc.setDrawColor(...lineGray);
    doc.setLineWidth(0.4);
    doc.line(sigX, y, sigX + sigLineW, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...textDark);
    doc.text('FIRMA DE CHOFER O ENCARGADO', pageWidth / 2, y + 5, { align: 'center' });

    // ==========================================
    // 3. SECCIÓN: SALIDA DE UNIDAD (Entrega)
    // ==========================================
    y += 34;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...textDark);

    const s1Part1 = 'EL DIA ';
    doc.text(s1Part1, margin, y);
    curX = margin + doc.getTextWidth(s1Part1) + 1;
    doc.line(curX, y + 0.8, curX + 46, y + 0.8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...redWine);
    doc.text(exitDateStr, curX + 2, y - 0.2);

    curX += 48;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textDark);
    const s1Part2 = 'SE LE HACE ENTREGA DE LA UNIDAD CON PLACAS ';
    doc.text(s1Part2, curX, y);
    curX += doc.getTextWidth(s1Part2) + 1;
    const exitPlacasW = (margin + contentWidth) - curX;
    doc.line(curX, y + 0.8, curX + exitPlacasW, y + 0.8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...redWine);
    doc.text(exitPlates, curX + 2, y - 0.2);

    // Fila 2 Salida: MODELO _____
    y += 9.5;
    drawFieldLine('MODELO ', exitModel, margin, y, 70);

    // Fila 3 Salida: AL CHOFER O ENCARGADO _____
    y += 9.5;
    drawFieldLine('AL CHOFER O ENCARGADO ', exitDriverName, margin, y, contentWidth);

    // Fila 4 Salida: DE LA EMPRESA _____
    y += 9.5;
    drawFieldLine('DE LA EMPRESA ', exitCompany, margin, y, contentWidth);

    // Fila 5 Salida: CON NUMERO DE IDENTIFICACIÓN _____
    y += 9.5;
    drawFieldLine('CON NUMERO DE IDENTIFICACIÓN ', exitIneNumber, margin, y, 95);

    // Fila 6 Salida: NOMBRE DE QUIEN REALIZAR REPORTE _____
    y += 12;
    drawFieldLine('NOMBRE DE QUIEN REALIZAR REPORTE ', exitReporter, margin, y, contentWidth);

    // Espacio de Firma Chofer Salida
    y += 24;
    doc.setDrawColor(...lineGray);
    doc.setLineWidth(0.4);
    doc.line(sigX, y, sigX + sigLineW, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...textDark);
    doc.text('FIRMA DE SALIDA DE CHOFER O ENCARGADO.', pageWidth / 2, y + 5, { align: 'center' });

    // ==========================================
    // 4. PIE DE PÁGINA (DATOS Y ONDA ROJA INFERIOR)
    // ==========================================
    const footerY = pageHeight - 24;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...textDark);
    doc.text('999 163 9673', margin + 5, footerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...textMuted);
    doc.text('talleralfonso@hotmail.com', margin + 5, footerY + 4.2);
    doc.text('Calle: 136 No. 1157 x 73 y 75', margin + 5, footerY + 8.4);
    doc.text('Col. Susula Xoclan, Mérida, Yucatán, Mex.', margin + 5, footerY + 12.2);

    // Onda decorativa en la parte inferior derecha
    doc.setFillColor(...redWine);
    const waveStartX = pageWidth * 0.42;
    doc.lines([
        [pageWidth - waveStartX, 0],
        [0, 14],
        [-(pageWidth - waveStartX), 0]
    ], waveStartX, pageHeight - 14, [1, 1], 'F');

    // ==========================================
    // 5. PÁGINA DE ANEXOS: IDENTIFICACIONES (INE)
    // ==========================================
    const hasEntryIne = Boolean(job.entryDriver?.ineFrontUrl || job.entryDriver?.ineBackUrl);
    const hasExitIne = Boolean(exitDriverData.ineFrontUrl || exitDriverData.ineBackUrl);

    if (hasEntryIne || hasExitIne) {
        doc.addPage();

        // Banner superior anexo
        doc.setFillColor(...redWine);
        doc.rect(0, 0, pageWidth, 22, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(255, 255, 255);
        doc.text('ANEXO: IDENTIFICACIÓN OFICIAL (INE)', margin, 14);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(240, 240, 240);
        doc.text(`Unidad: ${plates}  •  Folio: ${job.id ? job.id.substring(0, 8) : 'S/F'}`, pageWidth - margin, 14, { align: 'right' });

        let anexoY = 32;

        // --- INE Entrada ---
        if (hasEntryIne) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...darkWine);
            doc.text(`1. INE DE ENTRADA — Chofer: ${entryDriverName} (${entryCompany})`, margin, anexoY);
            anexoY += 6;

            const boxW = 80;
            const boxH = 50;

            if (job.entryDriver?.ineFrontUrl) {
                const frontData = await loadImageAsDataUrl(job.entryDriver.ineFrontUrl, 3500);
                if (frontData) {
                    doc.addImage(frontData.dataUrl, 'JPEG', margin, anexoY, boxW, boxH, undefined, 'FAST');
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.setTextColor(...textMuted);
                    doc.text('Anverso (Frente)', margin + (boxW / 2), anexoY + boxH + 4, { align: 'center' });
                }
            }

            if (job.entryDriver?.ineBackUrl) {
                const backData = await loadImageAsDataUrl(job.entryDriver.ineBackUrl, 3500);
                if (backData) {
                    const xBack = margin + boxW + 10;
                    doc.addImage(backData.dataUrl, 'JPEG', xBack, anexoY, boxW, boxH, undefined, 'FAST');
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.setTextColor(...textMuted);
                    doc.text('Reverso (Vuelta)', xBack + (boxW / 2), anexoY + boxH + 4, { align: 'center' });
                }
            }

            anexoY += boxH + 16;
        }

        // --- INE Salida ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...darkWine);
        doc.text(`2. INE DE SALIDA — Chofer: ${exitDriverName} (${exitCompany})`, margin, anexoY);
        anexoY += 6;

        if (isSameDriver) {
            doc.setFillColor(236, 253, 245);
            doc.setDrawColor(16, 185, 129);
            doc.setLineWidth(0.4);
            doc.roundedRect(margin, anexoY, contentWidth, 16, 2, 2, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(4, 120, 87);
            doc.text('✓ Mismo chofer en entrada y salida. La entrega se acredita con la identificación de entrada registrada.', margin + 8, anexoY + 10);
        } else if (hasExitIne) {
            const boxW = 80;
            const boxH = 50;

            if (exitDriverData.ineFrontUrl) {
                const frontData = await loadImageAsDataUrl(exitDriverData.ineFrontUrl, 3500);
                if (frontData) {
                    doc.addImage(frontData.dataUrl, 'JPEG', margin, anexoY, boxW, boxH, undefined, 'FAST');
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.setTextColor(...textMuted);
                    doc.text('Anverso (Frente)', margin + (boxW / 2), anexoY + boxH + 4, { align: 'center' });
                }
            }

            if (exitDriverData.ineBackUrl) {
                const backData = await loadImageAsDataUrl(exitDriverData.ineBackUrl, 3500);
                if (backData) {
                    const xBack = margin + boxW + 10;
                    doc.addImage(backData.dataUrl, 'JPEG', xBack, anexoY, boxW, boxH, undefined, 'FAST');
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.setTextColor(...textMuted);
                    doc.text('Reverso (Vuelta)', xBack + (boxW / 2), anexoY + boxH + 4, { align: 'center' });
                }
            }
        } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(...textMuted);
            doc.text('No se adjuntaron fotografías de identificación de salida.', margin, anexoY + 6);
        }
    }

    const cleanPlates = (plates || 'UNIDAD').replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Entrada_Salida_${cleanPlates}.pdf`);
}
