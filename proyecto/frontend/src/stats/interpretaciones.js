import { formatear } from '../utils/formato';

/**
 * Interpretaciones estadisticas automaticas.
 *
 * Cada grafica se acompana de una lectura en lenguaje claro de lo que muestran
 * los datos: donde se concentra la muestra, hacia donde se inclina la
 * distribucion, como se reparte el 50 % central o que clase domina. Son funciones
 * puras sobre la tabla ya calculada. La frase se muestra en la tarjeta de cada
 * grafica (recuadro .interpretacion) y viaja ademas al PDF via el atributo
 * data-interpretacion de cada figure.
 *
 * Umbral de simetria: se usa el segundo coeficiente de asimetria de Pearson
 * (3 * (media - mediana) / sigma). Por debajo de 0,1 la distribucion se considera
 * simetrica; el signo indica la cola (positivo = derecha, negativo = izquierda).
 */

const UMBRAL_SIMETRIA = 0.1;

const lim = (tabla) => (tabla.datosEnteros ? 0 : 2);
const fmt = (valor, decimales) => formatear(valor, decimales);

function intervaloDe(fila, decimales) {
  return `[${fmt(fila.limiteInferior, decimales)}, ${fmt(fila.limiteSuperior, decimales)}]`;
}

/**
 * Histograma: lectura enfocada en las barras contiguas, la clase modal y si
 * la serie tiene uno o varios picos. Se muestra en pantalla bajo la tarjeta
 * de la grafica y viaja ademas al PDF por data-interpretacion.
 */
export function interpretarHistograma(tabla) {
  if (!tabla || !Array.isArray(tabla.filas) || tabla.filas.length === 0) return '';

  const decimales = lim(tabla);
  const modal = tabla.filas.reduce(
    (maxima, fila) => (fila.frecuencia > maxima.frecuencia ? fila : maxima),
    tabla.filas[0]
  );
  const empatadas = tabla.filas.filter((f) => f.frecuencia === modal.frecuencia);

  const picos =
    empatadas.length > 1
      ? `hay ${empatadas.length} clases empatadas en el máximo (clases ${empatadas.map((f) => f.clase).join(', ')})`
      : 'la serie es unimodal, con un único máximo claro';

  return (
    `Cada barra abarca ${fmt(tabla.amplitud, decimales)} de amplitud. La más alta es ` +
    `la clase ${modal.clase}, ${intervaloDe(modal, decimales)}, con f = ${modal.frecuencia} ` +
    `(${fmt(modal.relativa)} % de la muestra): en conjunto, ${picos}.`
  );
}

/**
 * Histograma y poligono de frecuencias: clase modal, su peso relativo y la
 * tendencia de la distribucion.
 */
export function interpretarDistribucion(tabla) {
  if (!tabla || !Array.isArray(tabla.filas) || tabla.filas.length === 0) return '';

  const decimales = lim(tabla);
  const modal = tabla.filas.reduce(
    (maxima, fila) => (fila.frecuencia > maxima.frecuencia ? fila : maxima),
    tabla.filas[0]
  );

  let tendencia = 'prácticamente uniforme, sin una cola marcada';
  if (tabla.desviacionPoblacional > 0) {
    const asimetria = (3 * (tabla.media - tabla.mediana)) / tabla.desviacionPoblacional;
    if (Math.abs(asimetria) < UMBRAL_SIMETRIA) {
      tendencia = 'aproximadamente simétrica';
    } else if (asimetria > 0) {
      tendencia = 'asimétrica a la derecha (cola positiva)';
    } else {
      tendencia = 'asimétrica a la izquierda (cola negativa)';
    }
  }

  return (
    `La mayor concentración de datos se encuentra en la clase ${modal.clase}, ` +
    `intervalo ${intervaloDe(modal, decimales)}, con una frecuencia de ` +
    `${modal.frecuencia} datos (${fmt(modal.relativa)} %). ` +
    `La distribución muestra una tendencia ${tendencia}.`
  );
}

/**
 * Diagrama de caja y bigotes: reparto del 50 % central, IQR y dispersion total.
 */
export function interpretarCaja(tabla) {
  if (!tabla || !Array.isArray(tabla.filas) || tabla.filas.length === 0) return '';

  const decimales = lim(tabla);
  const iqr = tabla.q3 - tabla.q1;

  return (
    `El 50 % central de los datos se ubica entre Q1 (${fmt(tabla.q1, decimales)}) y ` +
    `Q3 (${fmt(tabla.q3, decimales)}), con una mediana de Md ` +
    `(${fmt(tabla.mediana, decimales)}). El rango intercuartílico (IQR) es ` +
    `${fmt(iqr, decimales)} y la dispersión total abarca desde Xmin ` +
    `(${fmt(tabla.xMin, decimales)}) hasta Xmax (${fmt(tabla.xMax, decimales)}).`
  );
}

/**
 * Pastel de frecuencias relativas: clase dominante dentro de la muestra.
 */
export function interpretarPastel(tabla) {
  if (!tabla || !Array.isArray(tabla.filas) || tabla.filas.length === 0) return '';

  const decimales = lim(tabla);
  const dominante = tabla.filas.reduce(
    (maxima, fila) => (fila.relativa > maxima.relativa ? fila : maxima),
    tabla.filas[0]
  );

  return (
    `La categoría o intervalo dominante es la clase ${dominante.clase}, ` +
    `${intervaloDe(dominante, decimales)}, que representa el ` +
    `${fmt(dominante.relativa)} % del total de la muestra (n = ${tabla.n}).`
  );
}

/**
 * Frecuencia relativa: contraste entre la clase de mayor y menor peso.
 */
export function interpretarRelativa(tabla) {
  if (!tabla || !Array.isArray(tabla.filas) || tabla.filas.length === 0) return '';

  const decimales = lim(tabla);
  const mayor = tabla.filas.reduce(
    (maxima, fila) => (fila.relativa > maxima.relativa ? fila : maxima),
    tabla.filas[0]
  );
  const menor = tabla.filas.reduce(
    (minima, fila) => (fila.relativa < minima.relativa ? fila : minima),
    tabla.filas[0]
  );

  return (
    `La clase ${mayor.clase} concentra el mayor porcentaje de la muestra ` +
    `(${fmt(mayor.relativa)} %), mientras que la clase ${menor.clase} registra el ` +
    `menor (${fmt(menor.relativa)} %), sobre un total de ${tabla.n} datos.`
  );
}
