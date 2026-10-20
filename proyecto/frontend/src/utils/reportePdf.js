import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatear } from './formato';
import urlFuenteRegular from '../assets/fonts/DejaVuSans.ttf?url';
import urlFuenteNegrita from '../assets/fonts/DejaVuSans-Bold.ttf?url';

/**
 * Reporte PDF de StatLab.
 *
 * Informe A4 vertical con la paleta maestra del proyecto:
 *   #0E1D21 base profunda · #122E34 superficie · #622347 plum (encabezados)
 *   #677E8A slate (bordes y textos secundarios) · #E0B4B2 rose (acentos)
 *
 * Tipografia: se empotra DejaVu Sans (Regular y Negrita). Las 14 fuentes estandar
 * de PDF solo cubren Latin-1, por lo que los simbolos del curso (Sigma, sigma,
 * raiz, superindices, menos matematico) salian distorsionados. DejaVu Sans cubre
 * griego, superindices y operadores, de modo que formulas como Σ(f · Xm), s², σ²
 * y √ se imprimen limpias. La barra de x̄ se dibuja a mano (getComputedStyle no
 * resuelve la marca combinante U+0304 en jsPDF).
 *
 * Estructura: cabecera, muestra de datos + parametros en recuadros lado a lado,
 * tabla de frecuencias a ancho completo, resumen de medidas en tarjetas tipo
 * dashboard y cada grafica en su propio recuadro. Las graficas se rasterizan desde
 * el SVG en linea: se clonan, se inlinean los estilos computados (necesario porque
 * usan var() y clases CSS) y se serializan a PNG sobre fondo blanco.
 */
const PALETA = {
  profundo: [14, 29, 33],
  superficie: [18, 46, 52],
  plum: [98, 35, 71],
  plumOscuro: [74, 26, 54],
  slate: [103, 126, 138],
  rose: [224, 180, 178],
  texto: [14, 29, 33],
  textoTenue: [76, 92, 100],
  blanco: [255, 255, 255],
  claro: [246, 239, 239],
  filaPar: [244, 246, 247],
  bordeSuave: [217, 222, 224],
  acentoSuave: [240, 231, 233],
};

const MARGEN = { izquierda: 14, derecha: 14, superior: 14, inferior: 14 };
const ANCHO_UTIL = 210 - MARGEN.izquierda - MARGEN.derecha;
const ALTO_PAGINA = 297;
const FAMILIA = 'DejaVu';

// Acentos por familia de medidas: los tres tonos oscuros de la paleta, siempre
// con titulo blanco, para que cada tarjeta del dashboard se distinga de un vistazo.
const ACENTO = {
  central: PALETA.plum,
  variabilidad: PALETA.superficie,
  posicion: PALETA.slate,
};

// --- Empotrado de la tipografia ---

let cacheFuentes = null;

function bufferABase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binario = '';
  const bloque = 0x8000;
  for (let i = 0; i < bytes.length; i += bloque) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + bloque));
  }
  return btoa(binario);
}

async function descargarFuente(url) {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`No se pudo cargar la tipografia (${respuesta.status})`);
  return bufferABase64(await respuesta.arrayBuffer());
}

async function registrarFuentes(doc) {
  if (!cacheFuentes) {
    const [regular, negrita] = await Promise.all([
      descargarFuente(urlFuenteRegular),
      descargarFuente(urlFuenteNegrita),
    ]);
    cacheFuentes = { regular, negrita };
  }
  doc.addFileToVFS('DejaVuSans.ttf', cacheFuentes.regular);
  doc.addFileToVFS('DejaVuSans-Bold.ttf', cacheFuentes.negrita);
  doc.addFont('DejaVuSans.ttf', FAMILIA, 'normal');
  doc.addFont('DejaVuSans-Bold.ttf', FAMILIA, 'bold');
}

// --- Utilidades de formato ---

const num = (valor, decimales = 2) => formatear(valor, decimales);

function fechaLegible() {
  return new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
}

function nombreArchivo(titulo) {
  const base = (titulo || 'reporte')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `statlab-${base || 'reporte'}.pdf`;
}

// --- Rasterizado de graficas SVG ---

// Propiedades computadas que hay que llevar al SVG clonado: los estilos de la
// aplicacion viven en hojas CSS y en variables de tema, y al serializar el SVG
// esas reglas dejan de aplicarse. Sin este paso la captura saldria sin colores.
const PROPIEDADES_CLAVE = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-size',
  'font-family',
  'font-weight',
  'text-anchor',
  'paint-order',
  'stop-color',
  'stop-opacity',
  'display',
  'visibility',
];

function inlinearEstilos(svg) {
  const clon = svg.cloneNode(true);
  const originales = [svg, ...svg.querySelectorAll('*')];
  const copias = [clon, ...clon.querySelectorAll('*')];

  originales.forEach((nodo, i) => {
    const destino = copias[i];
    if (!destino || !(nodo instanceof Element)) return;
    const computado = getComputedStyle(nodo);
    const inline = PROPIEDADES_CLAVE.map((prop) => `${prop}:${computado.getPropertyValue(prop)}`).join(';');
    destino.setAttribute('style', inline);
  });

  return clon;
}

/**
 * Convierte un SVG del DOM en un dataURL PNG a escala ampliada, sobre fondo
 * blanco para que el PDF no herede el fondo transparente del navegador.
 */
function svgAPng(svg, escala = 2) {
  return new Promise((resolver, rechazar) => {
    const rectangulo = svg.getBoundingClientRect();
    const ancho = Math.max(Math.round(rectangulo.width), 320);
    const alto = Math.max(Math.round(rectangulo.height), 180);

    const clon = inlinearEstilos(svg);
    clon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clon.setAttribute('width', String(ancho));
    clon.setAttribute('height', String(alto));

    const fondo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    fondo.setAttribute('width', '100%');
    fondo.setAttribute('height', '100%');
    fondo.setAttribute('fill', '#ffffff');
    clon.insertBefore(fondo, clon.firstChild);

    const xml = new XMLSerializer().serializeToString(clon);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

    const imagen = new Image();
    imagen.onload = () => {
      const lienzo = document.createElement('canvas');
      lienzo.width = ancho * escala;
      lienzo.height = alto * escala;
      const contexto = lienzo.getContext('2d');
      contexto.fillStyle = '#ffffff';
      contexto.fillRect(0, 0, lienzo.width, lienzo.height);
      contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
      resolver(lienzo.toDataURL('image/png'));
    };
    imagen.onerror = () => rechazar(new Error('No se pudo rasterizar la grafica'));
    imagen.src = url;
  });
}

// --- Encabezado, pie y saltos de pagina ---

function pintarCabecera(doc, { titulo, usuario, completa }) {
  const ancho = doc.internal.pageSize.getWidth();
  const alto = completa ? 30 : 12;

  doc.setFillColor(...PALETA.profundo);
  doc.rect(0, 0, ancho, alto, 'F');
  doc.setFillColor(...PALETA.plum);
  doc.rect(0, 0, 4, alto, 'F');

  doc.setTextColor(...PALETA.blanco);
  doc.setFont(FAMILIA, 'bold');
  doc.setFontSize(completa ? 17 : 11);
  doc.text('StatLab', 12, completa ? 13 : 8);

  doc.setFont(FAMILIA, 'normal');
  doc.setFontSize(completa ? 9 : 7);
  doc.setTextColor(...PALETA.rose);
  doc.text('Informe estadístico', 12, completa ? 19 : 11);

  const derecha = ancho - MARGEN.derecha;

  if (completa) {
    doc.setFontSize(8);
    doc.setTextColor(...PALETA.slate);
    doc.text(`Usuario: ${usuario || '—'}`, derecha, 11, { align: 'right' });
    doc.text(`Fecha: ${fechaLegible()}`, derecha, 16.5, { align: 'right' });
    doc.setFont(FAMILIA, 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...PALETA.blanco);
    // El titulo se parte como maximo en dos lineas y se recorta a la banda: asi un
    // nombre de proyecto largo no invade el cuerpo del informe.
    doc.text(doc.splitTextToSize(titulo, ancho * 0.55).slice(0, 2), derecha, 22, { align: 'right' });
  } else {
    doc.setFontSize(7);
    doc.setTextColor(...PALETA.slate);
    doc.text(doc.splitTextToSize(titulo, ancho - 80).slice(0, 1), derecha, 8, { align: 'right' });
  }

  return alto + 7;
}

function pintarPie(doc) {
  const total = doc.internal.getNumberOfPages();
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...PALETA.bordeSuave);
    doc.setLineWidth(0.3);
    doc.line(MARGEN.izquierda, alto - 10, ancho - MARGEN.derecha, alto - 10);

    doc.setFont(FAMILIA, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PALETA.textoTenue);
    doc.text('StatLab · generado automáticamente', MARGEN.izquierda, alto - 6);
    doc.text(`Página ${i} de ${total}`, ancho - MARGEN.derecha, alto - 6, { align: 'right' });
  }
}

function hayEspacio(y, alto) {
  return y + alto <= ALTO_PAGINA - MARGEN.inferior - 4;
}

function nuevaPagina(doc, titulo) {
  doc.addPage();
  return pintarCabecera(doc, { titulo, usuario: null, completa: false });
}

function seccion(doc, texto, y) {
  doc.setFont(FAMILIA, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PALETA.plum);
  doc.text(texto, MARGEN.izquierda, y);

  doc.setDrawColor(...PALETA.rose);
  doc.setLineWidth(0.9);
  doc.line(MARGEN.izquierda, y + 2, MARGEN.izquierda + 36, y + 2);

  return y + 8;
}

// --- Recuadros de la muestra y de los parametros ---

/**
 * Recuadro con barra de acento a la izquierda, titulo y linea de separacion.
 * Devuelve el origen interior donde se dibuja el contenido.
 */
function marcoTarjeta(doc, x, y, w, h, { titulo, acento, oscuro }) {
  doc.setFillColor(...(oscuro ? PALETA.superficie : PALETA.blanco));
  doc.setDrawColor(...PALETA.bordeSuave);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'FD');

  doc.setFillColor(...acento);
  doc.roundedRect(x, y, 3, h, 1.5, 1.5, 'F');
  doc.rect(x + 1.5, y, 1.5, h, 'F');

  doc.setFont(FAMILIA, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...(oscuro ? PALETA.rose : PALETA.plum));
  doc.text(titulo, x + 6, y + 6.5);

  doc.setDrawColor(...(oscuro ? PALETA.slate : PALETA.bordeSuave));
  doc.setLineWidth(0.2);
  doc.line(x + 6, y + 8.5, x + w - 4, y + 8.5);

  return { x: x + 6, y: y + 8.5 };
}

function muestraYParmetros(doc, tabla, valores, y) {
  const separacion = 6;
  const anchoTarjeta = (ANCHO_UTIL - separacion) / 2;
  const pad = 4.5;

  // --- Texto de la muestra: ordenada y separada solo por comas ---
  const ordenados = [...valores].sort((a, b) => a - b);
  const decMuestra = tabla.datosEnteros ? 0 : 2;
  const texto = ordenados.map((v) => num(v, decMuestra)).join(', ');

  doc.setFont(FAMILIA, 'normal');
  doc.setFontSize(7.6);
  const anchoTexto = anchoTarjeta - pad * 2;
  let lineas = doc.splitTextToSize(texto, anchoTexto);
  const LIMITE = 12;
  let recortado = false;
  if (lineas.length > LIMITE) {
    lineas = lineas.slice(0, LIMITE);
    recortado = true;
  }

  // --- Filas de parametros iniciales ---
  const dec = tabla.datosEnteros ? 0 : 2;
  const parametros = [
    ['Número de datos (n)', String(tabla.n)],
    ['Valor mínimo (Xmin)', num(tabla.xMin, dec)],
    ['Valor máximo (Xmax)', num(tabla.xMax, dec)],
    ['Rango (R)', num(tabla.rango, dec)],
    ['Intervalos (k, Sturges)', String(tabla.k)],
    ['Amplitud de clase (i)', num(tabla.amplitud, dec)],
  ];

  const altoFilas = lineas.length * 4.2;
  const altoParametros = parametros.length * 6;
  const altoCuerpo = Math.max(altoFilas, altoParametros);
  const alto = 8.5 + pad + altoCuerpo + pad + (recortado ? 5 : 0);

  if (!hayEspacio(y, alto + 8)) y = nuevaPagina(doc, 'Análisis estadístico');

  // Tarjeta izquierda: muestra de datos (fondo superficie #122E34)
  const marcoIzq = marcoTarjeta(doc, MARGEN.izquierda, y, anchoTarjeta, alto, {
    titulo: 'Muestra de datos ordenados',
    acento: PALETA.rose,
    oscuro: true,
  });
  doc.setFont(FAMILIA, 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(...PALETA.claro);
  lineas.forEach((linea, i) => {
    doc.text(linea, marcoIzq.x, marcoIzq.y + pad + (i + 1) * 4.2 - 1.2);
  });
  if (recortado) {
    doc.setFontSize(6.6);
    doc.setTextColor(...PALETA.rose);
    doc.text(
      `… (+${ordenados.length - numeroEnLineas(lineas)} valores más, n = ${tabla.n})`,
      marcoIzq.x,
      marcoIzq.y + pad + lineas.length * 4.2 + 3.2
    );
  }

  // Tarjeta derecha: parametros iniciales
  const xDer = MARGEN.izquierda + anchoTarjeta + separacion;
  const marcoDer = marcoTarjeta(doc, xDer, y, anchoTarjeta, alto, {
    titulo: 'Parámetros iniciales',
    acento: PALETA.plum,
    oscuro: false,
  });
  parametros.forEach(([etiqueta, valor], i) => {
    const filaY = marcoDer.y + pad + i * 6 + 3.6;
    doc.setFont(FAMILIA, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PALETA.textoTenue);
    doc.text(etiqueta, marcoDer.x, filaY);
    doc.setFont(FAMILIA, 'bold');
    doc.setTextColor(...PALETA.texto);
    doc.text(valor, xDer + anchoTarjeta - pad, filaY, { align: 'right' });
    if (i < parametros.length - 1) {
      doc.setDrawColor(...PALETA.bordeSuave);
      doc.setLineWidth(0.15);
      doc.line(marcoDer.x, filaY + 1.9, xDer + anchoTarjeta - pad, filaY + 1.9);
    }
  });

  return y + alto + 8;
}

// Cuenta cuantos valores entraron en las lineas visibles: cada linea lleva un
// numero seguido de ", "; la ultima puede ir sin coma.
function numeroEnLineas(lineas) {
  return lineas.reduce((total, linea) => total + linea.split(',').length, 0);
}

// --- Tabla de distribucion de frecuencias ---

function tablaFrecuencias(doc, tabla, y, nombre) {
  const dec = tabla.datosEnteros ? 0 : 2;
  const decReal = tabla.datosEnteros ? 1 : 2;

  const cuerpo = tabla.filas.map((f) => [
    String(f.clase),
    num(f.limiteInferior, dec),
    num(f.limiteSuperior, dec),
    num(f.limiteInferiorReal, decReal),
    num(f.limiteSuperiorReal, decReal),
    num(f.marcaClase, dec),
    String(f.frecuencia),
    `${num(f.relativa)} %`,
    String(f.acumulada),
  ]);

  // fr total se recalcula desde sumatoria(f) / n, no desde las celdas redondeadas,
  // para no arrastrar el error de redondeo de cada fila (mismo criterio que la UI).
  const sumaFrecuencia = tabla.filas.reduce((s, f) => s + f.frecuencia, 0);
  const frTotal = tabla.n > 0 ? (sumaFrecuencia / tabla.n) * 100 : 0;
  const relleno = { fillColor: PALETA.plumOscuro, textColor: PALETA.blanco, fontStyle: 'bold' };

  cuerpo.push([
    { content: 'TOTAL', styles: relleno },
    { content: '', styles: relleno },
    { content: '', styles: relleno },
    { content: '', styles: relleno },
    { content: '', styles: relleno },
    { content: '', styles: relleno },
    { content: String(sumaFrecuencia), styles: relleno },
    { content: `${num(frTotal)} %`, styles: relleno },
    { content: String(tabla.filas.at(-1).acumulada), styles: relleno },
  ]);

  let primeraPagina = true;

  autoTable(doc, {
    startY: y,
    margin: { ...MARGEN, top: 24 },
    tableWidth: ANCHO_UTIL,
    head: [
      [
        { content: 'Clase', rowSpan: 2 },
        { content: 'Límites de clase', colSpan: 2 },
        { content: 'Límites reales', colSpan: 2 },
        { content: 'Marca de clase', rowSpan: 2 },
        { content: 'Frec. absoluta', rowSpan: 2 },
        { content: 'Frec. relativa', rowSpan: 2 },
        { content: 'Frec. acumulada', rowSpan: 2 },
      ],
      ['Límite inferior (ii)', 'Límite superior (is)', 'Li', 'Ls'],
    ],
    body: cuerpo,
    rowPageBreak: 'avoid',
    styles: {
      font: FAMILIA,
      fontSize: 7.5,
      textColor: PALETA.texto,
      cellPadding: 1.7,
      halign: 'center',
      valign: 'middle',
      lineColor: PALETA.bordeSuave,
      lineWidth: 0.15,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: PALETA.plum,
      textColor: PALETA.blanco,
      fontStyle: 'bold',
      fontSize: 6.6,
      halign: 'center',
      cellPadding: 1.5,
    },
    alternateRowStyles: { fillColor: PALETA.filaPar },
    // Los anchos suman exactamente ANCHO_UTIL (182 mm): asi la tabla ocupa todo el
    // ancho util y autoTable no tiene que recortar contenido ni reescalar columnas.
    columnStyles: {
      0: { cellWidth: 14, fontStyle: 'bold' },
      1: { cellWidth: 20 },
      2: { cellWidth: 20 },
      3: { cellWidth: 15 },
      4: { cellWidth: 15 },
      5: { cellWidth: 24 },
      6: { cellWidth: 20 },
      7: { cellWidth: 27 },
      8: { cellWidth: 27 },
    },
    didDrawPage: () => {
      // La primera pagina ya lleva la cabecera completa; solo las continuaciones
      // reciben la banda compacta.
      if (primeraPagina) {
        primeraPagina = false;
        return;
      }
      pintarCabecera(doc, { titulo: nombre, usuario: null, completa: false });
    },
  });

  return doc.lastAutoTable.finalY + 9;
}

// --- Resumen de medidas en tarjetas dashboard ---

/**
 * Tarjeta de medidas con cabecera de acento y mosaico de celdas. Cada celda
 * muestra el simbolo (con barra opcional dibujada a mano para x̄), el valor
 * destacado, la etiqueta y la formula del curso.
 */
function tarjetaMetricas(doc, y, { titulo, acento, columnas, celdas }) {
  const x0 = MARGEN.izquierda;
  const w = ANCHO_UTIL;
  const pad = 5;
  const altoCabecera = 8;
  const cols = columnas || Math.min(celdas.length, 3);
  const filas = Math.ceil(celdas.length / cols);
  const altoCelda = 21;
  const alto = altoCabecera + pad + filas * altoCelda + pad - 1;

  doc.setFillColor(...PALETA.blanco);
  doc.setDrawColor(...PALETA.bordeSuave);
  doc.setLineWidth(0.3);
  doc.roundedRect(x0, y, w, alto, 2.5, 2.5, 'FD');

  doc.setFillColor(...acento);
  doc.roundedRect(x0, y, w, altoCabecera, 2.5, 2.5, 'F');
  doc.rect(x0, y + altoCabecera - 3, w, 3, 'F');
  doc.setFont(FAMILIA, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PALETA.blanco);
  doc.text(titulo, x0 + 5, y + 5.6);

  const anchoCelda = (w - pad * 2) / cols;
  celdas.forEach((celda, i) => {
    const col = i % cols;
    const fila = Math.floor(i / cols);
    const cx = x0 + pad + col * anchoCelda;
    const cy = y + altoCabecera + pad + fila * altoCelda;

    if (col > 0) {
      doc.setDrawColor(...PALETA.bordeSuave);
      doc.setLineWidth(0.15);
      doc.line(cx - 3, cy + 1, cx - 3, cy + altoCelda - 3);
    }

    // Linea superior: simbolo + valor
    let cursor = cx;
    doc.setFont(FAMILIA, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PALETA.plum);
    doc.text(celda.simbolo, cursor, cy + 5);
    if (celda.barra) {
      const anchoSimbolo = doc.getTextWidth(celda.simbolo);
      doc.setDrawColor(...PALETA.plum);
      doc.setLineWidth(0.45);
      doc.line(cursor, cy + 1.7, cursor + anchoSimbolo, cy + 1.7);
    }
    cursor += doc.getTextWidth(celda.simbolo) + 2.5;

    doc.setFontSize(13);
    doc.setTextColor(...PALETA.profundo);
    doc.text(celda.valor, cursor, cy + 5.4);

    doc.setFont(FAMILIA, 'normal');
    doc.setFontSize(6.7);
    doc.setTextColor(...PALETA.slate);
    doc.text(celda.etiqueta, cx, cy + 11.2, { maxWidth: anchoCelda - 3 });

    doc.setFontSize(6.2);
    doc.setTextColor(...PALETA.textoTenue);
    doc.text(celda.formula, cx, cy + 17.4, { maxWidth: anchoCelda - 3 });
  });

  return y + alto + 7;
}

function resumenMedidas(doc, tabla, posiciones, y, nombre) {
  const dec = tabla.datosEnteros ? 0 : 2;
  const moda = tabla.moda === null ? 'No se aplica' : num(tabla.moda, dec);

  const central = [
    { simbolo: 'x', barra: true, valor: num(tabla.media), etiqueta: 'Media aritmética', formula: 'Σ(f · Xm) / n' },
    { simbolo: 'Mp', valor: num(tabla.mediaPonderada), etiqueta: 'Media ponderada', formula: 'Σ(fr · Xm) / 100' },
    { simbolo: 'Md', valor: num(tabla.mediana), etiqueta: 'Mediana', formula: 'Li + ((n/2 − Fa) / f) · i' },
    { simbolo: 'Mo', valor: moda, etiqueta: 'Moda', formula: 'Li + ((f₁−f₀)/((f₁−f₀)+(f₁−f₂))) · i' },
  ];

  const variabilidad = [
    { simbolo: 'R', valor: num(tabla.rango, dec), etiqueta: 'Rango', formula: 'Xmax − Xmin' },
    { simbolo: 'σ²', valor: num(tabla.varianzaPoblacional), etiqueta: 'Varianza poblacional', formula: 'Σ((Xm − x)² · f) / n' },
    { simbolo: 's²', valor: num(tabla.varianzaMuestral), etiqueta: 'Varianza muestral', formula: 'Σ((Xm − x)² · f) / (n − 1)' },
    { simbolo: 'σ', valor: num(tabla.desviacionPoblacional), etiqueta: 'Desviación estándar', formula: '√σ²' },
    { simbolo: 's', valor: num(tabla.desviacionMuestral), etiqueta: 'Desviación muestral', formula: '√s²' },
    {
      simbolo: 'Cv',
      valor: tabla.coeficienteVariacion === null ? 'No aplica' : `${num(tabla.coeficienteVariacion)} %`,
      etiqueta: 'Coeficiente de variación',
      formula: '(σ / x) · 100',
    },
  ];

  // Exclusivamente las medidas que el usuario encendio (k > 0). La tarjeta de
  // Posicion no arranca con cuartiles ni percentiles fijos: si todo esta en 0 se
  // imprime la nota para que el lector sepa donde activarlas.
  const seleccionadas = (posiciones || []).map((p) => ({
    simbolo: p.nombre,
    valor: num(p.valor),
    etiqueta: `${p.etiqueta} ${p.k}`,
    formula: `Posición ${p.posicion} = (${p.k} · n) / ${p.divisor}`,
  }));
  const posicion = seleccionadas.length
    ? seleccionadas
    : [
        {
          simbolo: 'k',
          valor: '0',
          etiqueta: 'Sin medidas de posición seleccionadas',
          formula: 'Active cuartiles, deciles o percentiles en la interfaz',
        },
      ];

  const tarjetas = [
    { titulo: 'Tendencia central', acento: ACENTO.central, columnas: 4, celdas: central },
    { titulo: 'Variabilidad y dispersión', acento: ACENTO.variabilidad, columnas: 3, celdas: variabilidad },
    { titulo: 'Medidas de posición', acento: ACENTO.posicion, columnas: 4, celdas: posicion },
  ];

  for (const tarjeta of tarjetas) {
    const filas = Math.ceil(tarjeta.celdas.length / tarjeta.columnas);
    const alto = 8 + 5 + filas * 21 + 5 - 1;
    if (!hayEspacio(y, alto + 6)) y = nuevaPagina(doc, nombre);
    y = tarjetaMetricas(doc, y, tarjeta);
  }

  return y;
}

// --- Graficas ---

async function pintarGraficas(doc, figuras, y, nombre) {
  const pad = 6;

  for (const figura of figuras) {
    const svg = figura.querySelector('svg');
    if (!svg) continue;

    const titulo = figura.getAttribute('data-titulo') || 'Gráfica';
    // La lectura automatica viaja en el <figure> porque la captura rasteriza solo
    // el dibujo: aca se reimprime en texto real dentro de la misma tarjeta.
    const lectura = (figura.getAttribute('data-interpretacion') || '').trim();
    let dataUrl;
    try {
      dataUrl = await svgAPng(svg);
    } catch {
      continue; // Una grafica que no se rasteriza no debe tumbar el reporte
    }

    const propiedades = doc.getImageProperties(dataUrl);
    const anchoImagen = ANCHO_UTIL - pad * 2;
    let altoImagen = (propiedades.height / propiedades.width) * anchoImagen;
    altoImagen = Math.min(altoImagen, 150);

    const anchoLectura = anchoImagen - 5;
    doc.setFont(FAMILIA, 'normal');
    doc.setFontSize(7.4);
    const lineasLectura = lectura ? doc.splitTextToSize(lectura, anchoLectura) : [];
    const altoLectura = lineasLectura.length
      ? 4.4 + 3.6 + lineasLectura.length * 3.7 + 1.6
      : 0;

    const alto = 8 + pad + altoImagen + pad - 2 + altoLectura;

    if (!hayEspacio(y, alto + 6)) y = nuevaPagina(doc, nombre);

    doc.setFillColor(...PALETA.blanco);
    doc.setDrawColor(...PALETA.bordeSuave);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGEN.izquierda, y, ANCHO_UTIL, alto, 2.5, 2.5, 'FD');

    doc.setFillColor(...PALETA.slate);
    doc.roundedRect(MARGEN.izquierda, y, ANCHO_UTIL, 8, 2.5, 2.5, 'F');
    doc.rect(MARGEN.izquierda, y + 4, ANCHO_UTIL, 4, 'F');
    doc.setFont(FAMILIA, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...PALETA.blanco);
    doc.text(titulo, MARGEN.izquierda + 5, y + 5.6);

    doc.addImage(dataUrl, 'PNG', MARGEN.izquierda + pad, y + 8 + pad - 2, anchoImagen, altoImagen);

    if (lineasLectura.length) {
      const baseImagen = y + 8 + pad - 2 + altoImagen;
      const xLect = MARGEN.izquierda + pad + 4;
      const yEtiqueta = baseImagen + 4.4;
      const yFinal = yEtiqueta + 3.6 + (lineasLectura.length - 1) * 3.7;

      // Filete de acento al costado, igual que la tarjeta en pantalla
      doc.setDrawColor(...PALETA.plum);
      doc.setLineWidth(0.7);
      doc.line(MARGEN.izquierda + pad + 1.2, yEtiqueta - 3.4, MARGEN.izquierda + pad + 1.2, yFinal + 1.4);

      doc.setFont(FAMILIA, 'bold');
      doc.setFontSize(6.6);
      doc.setTextColor(...PALETA.plum);
      doc.text('INTERPRETACIÓN ESTADÍSTICA', xLect, yEtiqueta);

      doc.setFont(FAMILIA, 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(...PALETA.texto);
      doc.text(lineasLectura, xLect, yEtiqueta + 3.6);
    }

    y += alto + 7;
  }

  return y;
}

// --- Entrada publica ---

/**
 * Genera y descarga el reporte PDF del analisis vigente.
 *
 * @param {object} opciones
 * @param {object} opciones.tabla      tabla de frecuencias calculada
 * @param {number[]} [opciones.valores] datos crudos (se ordenan para la muestra)
 * @param {string} [opciones.titulo]   nombre del proyecto / analisis
 * @param {string} [opciones.usuario]  nombre de la sesion vigente
 * @param {HTMLElement[]} [opciones.figuras] figuras SVG marcadas para el informe
 * @param {object[]} [opciones.posiciones] medidas de posicion seleccionadas en la UI
 */
export async function descargarReportePDF({
  tabla,
  valores = [],
  titulo = 'Análisis estadístico',
  usuario = '',
  figuras = [],
  posiciones = [],
}) {
  if (!tabla) throw new Error('No hay tabla de frecuencias para exportar');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentes(doc);

  const nombre = titulo.trim() || 'Análisis estadístico';
  let y = pintarCabecera(doc, { titulo: nombre, usuario, completa: true });

  // --- Muestra de datos y parametros iniciales ---
  y = seccion(doc, 'Datos analizados', y);
  y = muestraYParmetros(doc, tabla, valores, y);

  // --- Tabla de frecuencias ---
  if (!hayEspacio(y, 40)) y = nuevaPagina(doc, nombre);
  y = seccion(doc, 'Distribución de frecuencias', y);
  y = tablaFrecuencias(doc, tabla, y, nombre);

  // --- Resumen de medidas ---
  if (!hayEspacio(y, 60)) y = nuevaPagina(doc, nombre);
  y = seccion(doc, 'Resumen de medidas', y);
  y = resumenMedidas(doc, tabla, posiciones, y, nombre);

  // --- Graficas ---
  if (figuras.length > 0) {
    if (!hayEspacio(y, 60)) y = nuevaPagina(doc, nombre);
    y = seccion(doc, 'Gráficas del análisis', y);
    await pintarGraficas(doc, figuras, y, nombre);
  }

  pintarPie(doc);
  doc.save(nombreArchivo(nombre));
}

export default descargarReportePDF;
