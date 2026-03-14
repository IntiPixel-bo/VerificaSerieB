class OCRProcessor {
    constructor() {
        this.worker = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            this.worker = await Tesseract.createWorker('eng');
            
            // Configurar whitelist para optimizar detección
            await this.worker.setParameters({
                tessedit_char_whitelist: '0123456789AB ',
                preserve_interword_spaces: '1'
            });
            
            this.initialized = true;
            console.log('OCR Inicializado');
        } catch (error) {
            console.error('Error inicializando OCR:', error);
            throw error;
        }
    }

    /**
     * Procesa una imagen completa buscando series
     * @param {HTMLCanvasElement|HTMLImageElement} element 
     * @returns {Promise<Array>}
     */
    async procesarImagen(element) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const resultado = await this.worker.recognize(element);
            const texto = resultado.data.text;
            
            console.log('Texto detectado:', texto);
            
            // Extraer posibles series
            const validator = new Validator();
            const seriesEncontradas = validator.extraerSeries(texto);
            
            return seriesEncontradas.map(serie => ({
                ...serie,
                confianza: resultado.data.confidence,
                textoOriginal: texto
            }));
            
        } catch (error) {
            console.error('Error en OCR:', error);
            return [];
        }
    }

    /**
     * Procesa una región específica de la imagen (ROI)
     */
    async procesarROI(canvas, x, y, width, height) {
        // Crear canvas temporal para recorte
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        tempCanvas.width = width;
        tempCanvas.height = height;
        
        // Dibujar región recortada
        ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
        
        // Aplicar preprocesamiento
        this.preprocesarImagenCanvas(tempCanvas);
        
        return await this.procesarImagen(tempCanvas);
    }

    /**
     * Preprocesamiento de imagen para mejorar OCR
     */
    preprocesarImagenCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Convertir a escala de grises y aumentar contraste
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            const contrast = 1.5; // Factor de contraste
            const adjusted = ((gray - 128) * contrast) + 128;
            
            data[i] = adjusted;     // R
            data[i + 1] = adjusted; // G
            data[i + 2] = adjusted; // B
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Aplicar umbral (threshold) para binarización suave
        // Esto ayuda a Tesseract a leer números
    }

    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.initialized = false;
        }
    }
}
