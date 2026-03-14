class BillDetector {
    constructor(videoElement, canvasElement) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.isProcessing = false;
        this.ocr = new OCRProcessor();
        this.validator = new Validator();
        
        // Colores aproximados de billetes bolivianos en HSV (para OpenCV)
        this.coloresBilletes = {
            10: {lower: [35, 50, 50], upper: [85, 255, 255]}, // Verde
            20: [110, 50, 50], upper: [130, 255, 255], // Azul
            50: [0, 50, 50], upper: [10, 255, 255]     // Rojo/Naranja
        };
    }

    async initialize() {
        await this.ocr.initialize();
        // OpenCV se carga globalmente desde el CDN
    }

    /**
     * Detecta billetes en el frame actual
     */
    async detectarFrame() {
        if (!this.video.videoWidth || !window.cv) return [];
        
        const width = this.video.videoWidth;
        const height = this.video.videoHeight;
        
        // Ajustar canvas al tamaño del video
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        
        // Dibujar frame actual
        this.ctx.drawImage(this.video, 0, 0, width, height);
        
        // Usar OpenCV para detección de contornos
        const billetesDetectados = await this.procesarConOpenCV(width, height);
        
        return billetesDetectados;
    }

    procesarConOpenCV(width, height) {
        const src = cv.imread(this.canvas);
        const dst = new cv.Mat();
        const gray = new cv.Mat();
        const blurred = new cv.Mat();
        const edges = new cv.Mat();
        
        try {
            // Convertir a escala de grises
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            
            // Reducir ruido
            cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
            
            // Detección de bordes (Canny)
            cv.Canny(blurred, edges, 50, 150);
            
            // Dilatar para cerrar contornos
            const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
            cv.dilate(edges, dst, kernel);
            
            // Encontrar contornos
            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            
            const billetes = [];
            const minArea = (width * height) * 0.05; // Mínimo 5% del área
            const maxArea = (width * height) * 0.8;  // Máximo 80% del área
            
            for (let i = 0; i < contours.size(); i++) {
                const cnt = contours.get(i);
                const area = cv.contourArea(cnt);
                
                if (area > minArea && area < maxArea) {
                    const rect = cv.boundingRect(cnt);
                    const aspectRatio = rect.width / rect.height;
                    
                    // Los billetes tienen aspecto ~2.5 (ancho/alto)
                    if (aspectRatio > 1.5 && aspectRatio < 3.5) {
                        // Aproximar contorno a polígono
                        const approx = new cv.Mat();
                        const peri = cv.arcLength(cnt, true);
                        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
                        
                        // Si tiene 4 vértices, probablemente sea un billete
                        if (approx.rows === 4 || area > minArea * 2) {
                            // Determinar denominación por color (simplificado)
                            const denom = this.estimarDenominacion(src, rect);
                            
                            billetes.push({
                                rect: rect,
                                denom: denom,
                                vertices: approx,
                                confianza: this.calcularConfianza(rect, aspectRatio)
                            });
                        }
                        approx.delete();
                    }
                }
            }
            
            return billetes;
            
        } finally {
            src.delete(); dst.delete(); gray.delete(); 
            blurred.delete(); edges.delete();
        }
    }

    estimarDenominacion(srcMat, rect) {
        // Extraer ROI y analizar color predominante
        // Simplificado: por ahora retorna estimación basada en tamaño
        const area = rect.width * rect.height;
        
        // Estimación básica (puede mejorarse con análisis de color HSV real)
        if (area > 50000) return 50;
        if (area > 30000) return 20;
        return 10;
    }

    calcularConfianza(rect, aspectRatio) {
        // El aspecto ideal de un billete es ~2.35 (156mm / 66mm aprox)
        const idealAspect = 2.35;
        const diff = Math.abs(aspectRatio - idealAspect);
        return Math.max(0, 100 - (diff * 20));
    }

    dibujarDetecciones(billetes) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        billetes.forEach((bill, index) => {
            const { x, y, width, height } = bill.rect;
            
            // Dibujar rectángulo
            this.ctx.strokeStyle = '#00ff00';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(x, y, width, height);
            
            // Etiqueta
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
            this.ctx.fillRect(x, y - 30, 120, 30);
            this.ctx.fillStyle = 'black';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillText(`Bs. ${bill.denom}`, x + 5, y - 10);
            
            // Número de índice
            this.ctx.fillStyle = 'white';
            this.ctx.beginPath();
            this.ctx.arc(x + width - 15, y + 15, 12, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.fillStyle = 'black';
            this.ctx.textAlign = 'center';
            this.ctx.fillText((index + 1).toString(), x + width - 15, y + 20);
        });
    }

    async analizarBillete(bill) {
        // Extraer región del billete y aplicar OCR
        const padding = 10;
        const x = Math.max(0, bill.rect.x - padding);
        const y = Math.max(0, bill.rect.y - padding);
        const w = Math.min(this.canvas.width - x, bill.rect.width + padding * 2);
        const h = Math.min(this.canvas.height - y, bill.rect.height + padding * 2);
        
        // Analizar toda el área del billete
        const series = await this.ocr.procesarROI(this.canvas, x, y, w, h);
        
        if (series.length === 0) {
            // Si no se encontró en el área completa, intentar con la mitad inferior
            // (donde usualmente está la serie en billetes bolivianos)
            const yLower = y + (h * 0.7);
            const seriesLower = await this.ocr.procesarROI(this.canvas, x, yLower, w, h * 0.3);
            return seriesLower.map(s => ({...s, denom: bill.denom}));
        }
        
        return series.map(s => ({...s, denom: bill.denom}));
    }
}
