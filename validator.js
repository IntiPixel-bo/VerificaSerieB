class Validator {
    constructor() {
        this.rangos = RANGOS_SERIES;
    }

    /**
     * Valida número de serie asumiendo SIEMPRE Serie B
     * Usado para entrada manual
     */
    validarSerieB(numero, denominacion) {
        // Limpiar: solo números
        const numeroLimpio = numero.toString().replace(/\D/g, '');
        
        if (numeroLimpio.length !== 9) {
            return {
                valido: false,
                estado: 'FORMATO_INVALIDO',
                mensaje: 'Debe ingresar exactamente 9 dígitos',
                tipoAlerta: 'uncertain',
                numero: numeroLimpio
            };
        }

        const numeroInt = parseInt(numeroLimpio, 10);
        const rangosDenominacion = this.rangos[denominacion.toString()];
        
        if (!rangosDenominacion) {
            return {
                valido: false,
                estado: 'DENOMINACION_INVALIDA',
                mensaje: 'Denominación no válida',
                tipoAlerta: 'uncertain',
                numero: numeroLimpio
            };
        }

        const enRangoInvalido = rangosDenominacion.some(rango => {
            return numeroInt >= rango.desde && numeroInt <= rango.hasta;
        });

        if (enRangoInvalido) {
            return {
                valido: false,
                estado: 'SIN_VALOR_LEGAL',
                mensaje: 'SERIE B INVÁLIDA',
                detalle: 'El número está dentro de rangos invalidados por el BCB',
                numero: numeroLimpio,
                letra: 'B',
                tipoAlerta: 'invalid'
            };
        } else {
            return {
                valido: true,
                estado: 'VALIDO',
                mensaje: 'BILLETE VÁLIDO',
                detalle: 'Serie B fuera de rangos invalidados',
                numero: numeroLimpio,
                letra: 'B',
                tipoAlerta: 'valid'
            };
        }
    }

    /**
     * Para OCR: busca patrón de 9 dígitos seguidos de espacio opcional y B
     * Retorna todas las coincidencias encontradas
     */
    extraerSeriesB(texto) {
        const regex = /\b(\d{9})\s*[Bb]\b/g;
        const matches = [];
        let match;
        
        while ((match = regex.exec(texto)) !== null) {
            matches.push({
                numero: match[1],
                letra: 'B',
                textoCompleto: match[0],
                index: match.index
            });
        }
        
        // También buscar sin la B explícita (9 dígitos sueltos que parezcan serie)
        // pero con mayor validación posterior
        const regexSuelto = /\b([0-9]{9})\b/g;
        while ((match = regexSuelto.exec(texto)) !== null) {
            // Verificar que no sea parte de otra fecha o número grande
            const prevChar = texto.charAt(match.index - 1);
            const nextChar = texto.charAt(match.index + 10);
            
            // Si está entre espacios o al inicio/fin, probablemente sea serie
            if ((prevChar === ' ' || prevChar === '') && 
                (nextChar === ' ' || nextChar === '' || nextChar === 'B' || nextChar === 'b')) {
                matches.push({
                    numero: match[1],
                    letra: 'B',
                    textoCompleto: match[1] + ' B',
                    index: match.index,
                    inferido: true
                });
            }
        }
        
        return matches;
    }

    /**
     * Obtiene rangos para mostrar en UI
     */
    getRangos(denominacion) {
        return this.rangos[denominacion.toString()] || [];
    }
}
