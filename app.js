// Variables globales
let video = document.getElementById('video');
let canvas = document.getElementById('canvasOverlay');
let stream = null;
let detector = null;
let selectedDenom = null;
let scanHistory = [];

// Inicialización
async function onOpenCvReady() {
    console.log('OpenCV listo');
    detector = new BillDetector(video, canvas);
    await detector.initialize();
    await initCameraSelect();
}

// Navegación entre tabs
function switchTab(tab) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`view-${tab}`).classList.add('active');
    event.currentTarget.classList.add('active');
    
    // Detener cámara si cambia a manual
    if (tab === 'manual' && stream) {
        stopCamera();
    }
}

// Selección de denominación
function selectDenom(val) {
    selectedDenom = val;
    document.querySelectorAll('.denom-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (parseInt(btn.dataset.value) === val) {
            btn.classList.add('selected');
        }
    });
    
    // Cargar rangos en el detalle desplegable
    loadRangesInfo(val);
}

function loadRangesInfo(denom) {
    const validator = new Validator();
    const rangos = validator.getRangos(denom);
    const container = document.getElementById('rangesList');
    
    container.innerHTML = rangos.map(r => `
        <div class="range-item">
            <span>${r.desde.toLocaleString()}</span>
            <span>→</span>
            <span>${r.hasta.toLocaleString()}</span>
        </div>
    `).join('');
}

// Validación de input (solo números)
function validateInput(input) {
    input.value = input.value.replace(/\D/g, '').slice(0, 9);
}

// Verificación manual
function verifyManual() {
    if (!selectedDenom) {
        alert('Selecciona primero la denominación del billete');
        return;
    }
    
    const input = document.getElementById('serieInput');
    const numero = input.value;
    
    if (numero.length !== 9) {
        alert('Ingresa los 9 dígitos completos');
        input.focus();
        return;
    }
    
    const validator = new Validator();
    const resultado = validator.validarSerieB(numero, selectedDenom);
    
    showManualResult(resultado);
    addToHistory(resultado, selectedDenom);
}

function showManualResult(resultado) {
    const container = document.getElementById('manualResult');
    const card = document.getElementById('statusCard');
    const icon = document.getElementById('statusIcon');
    const title = document.getElementById('statusTitle');
    const desc = document.getElementById('statusDesc');
    
    container.classList.remove('hidden');
    card.className = 'status-card ' + resultado.tipoAlerta;
    
    if (resultado.tipoAlerta === 'valid') {
        icon.textContent = '✓';
        card.classList.add('valid');
    } else if (resultado.tipoAlerta === 'invalid') {
        icon.textContent = '✕';
        card.classList.add('invalid');
    } else {
        icon.textContent = '!';
    }
    
    title.textContent = resultado.mensaje;
    desc.textContent = resultado.detalle || 'Verifique el número ingresado';
    
    // Scroll al resultado
    setTimeout(() => {
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// Control de cámara
document.getElementById('btnStart').addEventListener('click', async () => {
    try {
        const constraints = {
            video: {
                facingMode: 'environment', // Cámara trasera por defecto
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        
        document.getElementById('btnStart').classList.add('hidden');
        document.getElementById('btnCapture').classList.remove('hidden');
        document.getElementById('cameraOptions')?.classList.remove('hidden');
        
        // Activar escaneo automático periódico
        startAutoScan();
    } catch (err) {
        alert('Error al acceder a la cámara: ' + err.message);
    }
});

document.getElementById('btnCapture').addEventListener('click', captureFrame);
document.getElementById('btnStop')?.addEventListener('click', stopCamera);

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    document.getElementById('btnStart').classList.remove('hidden');
    document.getElementById('btnCapture').classList.add('hidden');
    document.getElementById('btnStop').classList.add('hidden');
}

async function captureFrame() {
    if (!video.videoWidth) return;
    
    const processing = document.getElementById('processing');
    processing.classList.remove('hidden');
    
    try {
        // Detectar billetes y leer serie
        const billetes = await detector.detectarFrame();
        
        if (billetes.length === 0) {
            showScanResult({
                estado: 'NO_DETECTADO',
                mensaje: 'No se detectó billete',
                detalle: 'Enfoque el billete dentro del recuadro',
                tipoAlerta: 'uncertain'
            }, null);
            return;
        }
        
        // Tomar el primer billete detectado
        const bill = billetes[0];
        const series = await detector.analizarBillete(bill);
        
        if (series.length > 0) {
            // Tomar la primera serie B encontrada
            const serie = series[0];
            const validator = new Validator();
            
            // Determinar denominación por detección visual o default
            const denom = bill.denom || detectarDenominacionPorTamano(bill);
            
            const resultado = validator.validarSerieB(serie.numero, denom);
            showScanResult(resultado, denom);
            addToHistory(resultado, denom);
        } else {
            showScanResult({
                estado: 'NO_LECTURA',
                mensaje: 'No se leyó la serie',
                detalle: 'Asegúrese de que el número de serie sea visible',
                tipoAlerta: 'uncertain'
            }, null);
        }
    } catch (e) {
        console.error(e);
        showScanResult({
            estado: 'ERROR',
            mensaje: 'Error de procesamiento',
            detalle: 'Intente nuevamente',
            tipoAlerta: 'uncertain'
        }, null);
    } finally {
        processing.classList.add('hidden');
    }
}

function detectarDenominacionPorTamano(bill) {
    const area = bill.rect.width * bill.rect.height;
    // Heurística basada en área del billete en pantalla
    if (area > 150000) return 50;
    if (area > 100000) return 20;
    return 10;
}

function showScanResult(resultado, denom) {
    const container = document.getElementById('scanResult');
    const card = document.getElementById('resultCard');
    const icon = document.getElementById('resultIcon');
    const title = document.getElementById('resultTitle');
    const serie = document.getElementById('resultSerie');
    const detail = document.getElementById('resultDetail');
    
    container.classList.remove('hidden');
    card.className = 'result-card ' + resultado.tipoAlerta;
    
    // Icono según estado
    if (resultado.tipoAlerta === 'valid') icon.textContent = '✓';
    else if (resultado.tipoAlerta === 'invalid') icon.textContent = '✕';
    else icon.textContent = '⚠';
    
    title.textContent = resultado.mensaje;
    serie.textContent = resultado.numero ? `${resultado.numero} B` : '--';
    serie.style.display = resultado.numero ? 'block' : 'none';
    detail.textContent = resultado.detalle || '';
    
    // Vibración en móvil si es inválido
    if (resultado.tipoAlerta === 'invalid' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
    }
}

function addToHistory(resultado, denom) {
    const item = {
        ...resultado,
        denom: denom,
        timestamp: new Date()
    };
    
    scanHistory.unshift(item);
    if (scanHistory.length > 10) scanHistory.pop();
    
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    
    if (scanHistory.length === 0) {
        list.innerHTML = '<div class="empty-state">Los resultados aparecerán aquí</div>';
        return;
    }
    
    list.innerHTML = scanHistory.map(h => `
        <div class="history-item ${h.tipoAlerta}">
            <div class="result-icon">${h.tipoAlerta === 'valid' ? '✓' : h.tipoAlerta === 'invalid' ? '✕' : '!'}</div>
            <div>
                <div style="font-weight: 600;">${h.mensaje}</div>
                ${h.numero ? `<div style="font-family: monospace; font-size: 0.9rem;">Bs.${h.denom || '?'} ${h.numero} B</div>` : ''}
            </div>
        </div>
    `).join('');
}

// Donación
function showDonation() {
    document.getElementById('donationModal').classList.remove('hidden');
}

function hideDonation() {
    document.getElementById('donationModal').classList.add('hidden');
}

// Auto-scan (opcional - escaneo continuo)
let scanInterval = null;
function startAutoScan() {
    // Escanear cada 2 segundos si hay billete estable
    scanInterval = setInterval(async () => {
        if (!stream) return;
        // Implementación opcional de escaneo continuo
    }, 2000);
}

// Limpieza
window.addEventListener('beforeunload', () => {
    if (detector?.ocr) detector.ocr.terminate();
    stopCamera();
    if (scanInterval) clearInterval(scanInterval);
});
