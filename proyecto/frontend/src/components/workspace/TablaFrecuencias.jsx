import { useState } from 'react';
import { formatear, DECIMALES, DECIMALES_ENTERO } from '../../utils/formato';

// Los limites de clase se muestran enteros cuando los datos crudos lo son
function resolverDecimales(columna, tabla) {
  if (columna.decimales !== 'auto') return columna.decimales;
  return tabla.datosEnteros ? DECIMALES_ENTERO : DECIMALES;
}

// id: identidad unica de la columna (React key). clave: campo del dato que
// dibuja. fila: nivel de cabecera (1 = superior, 2 = subcolumna combinada).
// La cabecera Clase es combinada de 2 columnas: sus subcolumnas ii e is
// ocupan esos 2 huecos.
const COLUMNAS = [
  { id: 'clase', clave: 'clase', header: 'Clase', titulo: 'Intervalo de clase: límite inferior (ii) y límite superior (is)', fila: 1, colSpan: 2, soloCabecera: true },
  { id: 'ii', clave: 'limiteInferior', header: 'ii', titulo: 'Límite inferior', fila: 2, decimales: 'auto' },
  { id: 'is', clave: 'limiteSuperior', header: 'is', titulo: 'Límite superior', fila: 2, decimales: 'auto' },
  { id: 'f', clave: 'frecuencia', header: 'f', titulo: 'Frecuencia absoluta', fila: 1, rowSpan: 2, decimales: DECIMALES_ENTERO, total: 'suma' },
  { id: 'fa', clave: 'acumulada', header: 'fa', titulo: 'Frecuencia acumulada: f + fa anterior', fila: 1, rowSpan: 2, decimales: DECIMALES_ENTERO, total: 'ultimo' },
  { id: 'fr', clave: 'relativa', header: 'fr', titulo: 'Frecuencia relativa en porcentaje: f * 100 / n', fila: 1, rowSpan: 2, decimales: DECIMALES, total: 'proporcion', sufijo: ' %' },
  { id: 'fs', clave: 'suavizada', header: 'fs', titulo: 'Frecuencia suavizada: (f anterior + 2f + f posterior) / 4', fila: 1, rowSpan: 2, decimales: DECIMALES, total: 'suma' },
  { id: 'xm', clave: 'marcaClase', header: 'xm', titulo: 'Marca de clase', fila: 1, rowSpan: 2, decimales: DECIMALES },
  { id: 'f*xm', clave: 'producto', header: 'f*xm', titulo: 'Frecuencia absoluta por marca de clase', fila: 1, rowSpan: 2, decimales: DECIMALES, total: 'suma', auxiliar: true },
  { id: '(fr)(xm)', clave: 'relativaProducto', header: '(fr)(xm)', titulo: 'Frecuencia relativa por marca de clase: fr * xm / 100. Su suma es la media ponderada', fila: 1, rowSpan: 2, decimales: DECIMALES, total: 'suma', auxiliar: true },
  { id: '(xm-x)^2', clave: 'desviacion', header: '(xm-x)^2', titulo: 'Desviación cuadrada de la marca de clase respecto a la media', fila: 1, rowSpan: 2, decimales: DECIMALES, total: 'vacio', auxiliar: true },
  { id: '(xm-x)^2*f', clave: 'desviacionPonderada', header: '(xm-x)^2*f', titulo: 'Desviación cuadrada ponderada por la frecuencia', fila: 1, rowSpan: 2, decimales: DECIMALES, total: 'suma', auxiliar: true },
];

// Clase solo aporta la celda combinada de cabecera: no dibuja celda de cuerpo.
const COLUMNAS_DATOS = COLUMNAS.filter((columna) => !columna.soloCabecera);

const CABECERA_NIVEL_1 = COLUMNAS.filter((columna) => columna.fila === 1);
const CABECERA_NIVEL_2 = COLUMNAS.filter((columna) => columna.fila === 2);

// Cuantas columnas iniciales quedan fuera de los totales: la etiqueta TOTAL
// las abarca con colSpan.
const INICIO_TOTALES = COLUMNAS_DATOS.findIndex((columna) => columna.total);
const COLUMNAS_FILA_TOTAL = COLUMNAS_DATOS.slice(INICIO_TOTALES);

function calcularTotales(tabla) {
  const { filas, n } = tabla;
  const sumaFrecuencia = filas.reduce((s, f) => s + f.frecuencia, 0);
  const totales = {};

  COLUMNAS_DATOS.forEach((columna) => {
    const decimales = resolverDecimales(columna, tabla);

    switch (columna.total) {
      case 'suma':
        totales[columna.id] = formatear(
          filas.reduce((s, f) => s + f[columna.clave], 0),
          decimales
        );
        break;
      // fr ya viene en porcentaje, asi que el total cierra en 100. Se
      // recalcula desde sumatoria(f) en vez de sumar las celdas: sumar los fr
      // ya redondeados acumularia el error de redondeo de cada fila.
      case 'proporcion':
        totales[columna.id] = formatear(n > 0 ? (sumaFrecuencia / n) * 100 : 0, decimales);
        break;
      case 'ultimo':
        totales[columna.id] = formatear(
          filas.length ? filas[filas.length - 1][columna.clave] : 0,
          decimales
        );
        break;
      default:
        totales[columna.id] = '';
    }
  });

  return totales;
}

/**
 * Contenido del tooltip de cada encabezado: la formula del curso y una
 * sustitucion real con los valores de la tabla actual. Los indices 1 y 2
 * denotan la primera y la segunda clase.
 */
function pistaColumna(columna, tabla) {
  const [f0, f1] = tabla.filas;
  if (!f0) return null;
  const dec = tabla.datosEnteros ? DECIMALES_ENTERO : DECIMALES;
  const fmt = (v, d = 2) => formatear(v, d);

  switch (columna.id) {
    case 'clase':
      return {
        formula: 'Clase = intervalo contiguo [ii, is)',
        ejemplo: `Clase 1: [${fmt(f0.limiteInferior, dec)}, ${fmt(f0.limiteSuperior, dec)})${f1 ? ` · Clase 2 empieza en ${fmt(f1.limiteInferior, dec)}` : ''}`,
      };
    case 'ii':
      return {
        formula: 'ii₁ = Xmin · iiⱼ = iiⱼ₋₁ + i',
        ejemplo: `Clase 1: ii = ${fmt(f0.limiteInferior, dec)}${f1 ? ` · Clase 2: ${fmt(f0.limiteInferior, dec)} + ${fmt(tabla.amplitud, dec)} = ${fmt(f1.limiteInferior, dec)}` : ''}`,
      };
    case 'is':
      return {
        formula: 'isⱼ = iiⱼ + i',
        ejemplo: `Clase 1: is = ${fmt(f0.limiteInferior, dec)} + ${fmt(tabla.amplitud, dec)} = ${fmt(f0.limiteSuperior, dec)}`,
      };
    case 'f':
      return {
        formula: 'f = nº de datos dentro de [ii, is)',
        ejemplo: `Clase 1: cuenta en [${fmt(f0.limiteInferior, dec)}, ${fmt(f0.limiteSuperior, dec)}) = ${f0.frecuencia}`,
      };
    case 'fa':
      return {
        formula: 'faⱼ = faⱼ₋₁ + fⱼ',
        ejemplo: f1
          ? `Clase 2: fa = ${f0.acumulada} + ${f1.frecuencia} = ${f1.acumulada}`
          : `Clase 1: fa = 0 + ${f0.frecuencia} = ${f0.acumulada}`,
      };
    case 'fr':
      return {
        formula: 'fr = f × 100 ÷ n',
        ejemplo: `Clase 1: fr = ${f0.frecuencia} × 100 ÷ ${tabla.n} = ${fmt(f0.relativa)} %`,
      };
    case 'fs':
      return {
        formula: 'fsⱼ = (fⱼ₋₁ + 2fⱼ + fⱼ₊₁) ÷ 4',
        ejemplo: `Clase 1 (extremo: replica el vecino): (${f0.frecuencia} + 2×${f0.frecuencia} + ${f1 ? f1.frecuencia : f0.frecuencia}) ÷ 4 = ${fmt(f0.suavizada)}`,
      };
    case 'xm':
      return {
        formula: 'xm = (ii + is) ÷ 2',
        ejemplo: `Clase 1: xm = (${fmt(f0.limiteInferior, dec)} + ${fmt(f0.limiteSuperior, dec)}) ÷ 2 = ${fmt(f0.marcaClase)}`,
      };
    case 'f*xm':
      return {
        formula: 'f × xm · sumatoria = n · x̄',
        ejemplo: `Clase 1: ${f0.frecuencia} × ${fmt(f0.marcaClase)} = ${fmt(f0.producto)} · Σ = ${fmt(tabla.sumaProducto)}`,
      };
    case '(fr)(xm)':
      return {
        formula: 'fr × xm ÷ 100 · sumatoria = x̄',
        ejemplo: `Clase 1: ${fmt(f0.relativa)} × ${fmt(f0.marcaClase)} ÷ 100 = ${fmt(f0.relativaProducto)} · Σ = ${fmt(tabla.mediaPonderada)}`,
      };
    case '(xm-x)^2':
      return {
        formula: '(xm − x̄)²',
        ejemplo: `Clase 1: (${fmt(f0.marcaClase)} − ${fmt(tabla.media)})² = ${fmt(f0.desviacion)}`,
      };
    case '(xm-x)^2*f':
      return {
        formula: '(xm − x̄)² × f · sumatoria = n · σ²',
        ejemplo: `Clase 1: ${fmt(f0.desviacion)} × ${f0.frecuencia} = ${fmt(f0.desviacionPonderada)} · Σ = ${fmt(tabla.sumaDesviacionPonderada)}`,
      };
    default:
      return null;
  }
}

const estilos = {
  tablaEnvoltura: {
    border: '1px solid var(--borde)',
    borderRadius: 12,
    overflow: 'hidden',
    background: 'var(--superficie)',
  },
  tablaDesplazable: { overflowX: 'auto' },
  tabla: {
    borderCollapse: 'collapse',
    width: '100%',
    minWidth: '1160px',
    tableLayout: 'fixed',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '0.78rem',
    textAlign: 'center',
  },
  th: {
    background: 'var(--tabla-th)',
    color: '#f6efef',
    fontWeight: 'bold',
    padding: '0.5rem 0.35rem',
    border: '1px solid var(--tabla-th-borde)',
    whiteSpace: 'normal',
    lineHeight: 1.25,
  },
  thCombinada: {
    background: 'var(--tabla-th-combinada)',
    fontSize: '0.86rem',
    letterSpacing: '0.05em',
  },
  td: {
    padding: '0.32rem 0.35rem',
    border: '1px solid var(--borde)',
    whiteSpace: 'nowrap',
  },
  tdEtiqueta: {
    textAlign: 'left',
    paddingLeft: '0.75rem',
    fontWeight: 'bold',
    background: 'var(--superficie-total)',
  },
  tdTotal: {
    background: 'var(--superficie-total)',
    fontWeight: 'bold',
    borderTop: '2px solid var(--tabla-th)',
  },
};

/**
 * Tabla de distribucion de frecuencias. Recibe la tabla ya calculada y el
 * indice de clase activo desde Workspace, que lo comparte con las graficas
 * para el resaltado cruzado en ambos sentidos.
 */
function TablaFrecuencias({ tabla, claseActiva, onClaseActiva }) {
  // Tooltip fijo del encabezado bajo el cursor (formula + sustitucion real).
  const [pista, setPista] = useState(null);

  const totales = calcularTotales(tabla);

  // El tooltip de cabecera se ancla al cursor y se recorta a los bordes de la
  // ventana; el contenido se recalcula con la tabla vigente en cada entrada.
  const mostrarPista = (evento, columna) => {
    const contenido = pistaColumna(columna, tabla);
    if (!contenido) return;
    setPista({
      x: Math.min(Math.max(evento.clientX, 170), window.innerWidth - 170),
      y: Math.min(evento.clientY, window.innerHeight - 130),
      ...contenido,
    });
  };
  const ocultarPista = () => setPista(null);

  return (
    <>
      <div style={estilos.tablaEnvoltura}>
        <div className="tabla-desplazable" style={estilos.tablaDesplazable}>
          <table style={estilos.tabla} aria-label="Tabla de distribución de frecuencias">
            <thead>
              <tr>
                {CABECERA_NIVEL_1.map((columna) => (
                  <th
                    key={columna.id}
                    className="th-pista"
                    style={{ ...estilos.th, ...(columna.colSpan ? estilos.thCombinada : null) }}
                    colSpan={columna.colSpan ?? 1}
                    rowSpan={columna.rowSpan ?? 1}
                    onMouseEnter={(evento) => mostrarPista(evento, columna)}
                    onMouseMove={(evento) => mostrarPista(evento, columna)}
                    onMouseLeave={ocultarPista}
                  >
                    {columna.header}
                  </th>
                ))}
              </tr>
              <tr>
                {CABECERA_NIVEL_2.map((columna) => (
                  <th
                    key={columna.id}
                    className="th-pista"
                    style={estilos.th}
                    onMouseEnter={(evento) => mostrarPista(evento, columna)}
                    onMouseMove={(evento) => mostrarPista(evento, columna)}
                    onMouseLeave={ocultarPista}
                  >
                    {columna.header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody onMouseLeave={() => onClaseActiva?.(-1)}>
              {tabla.filas.map((fila, indice) => (
                <tr
                  key={fila.clase}
                  className={
                    claseActiva === indice
                      ? 'frec-fila-activa'
                      : indice % 2 === 1
                        ? 'frec-fila-par'
                        : undefined
                  }
                  onMouseEnter={() => onClaseActiva?.(indice)}
                >
                  {COLUMNAS_DATOS.map((columna) => (
                    <td
                      key={columna.id}
                      className={columna.auxiliar ? 'frec-celda frec-celda-aux' : 'frec-celda'}
                      style={estilos.td}
                    >
                      {formatear(fila[columna.clave], resolverDecimales(columna, tabla))}
                      {columna.sufijo ?? ''}
                    </td>
                  ))}
                </tr>
              ))}

              <tr>
                <td style={{ ...estilos.td, ...estilos.tdEtiqueta }} colSpan={INICIO_TOTALES}>
                  TOTAL
                </td>
                {COLUMNAS_FILA_TOTAL.map((columna) => (
                  <td key={columna.id} style={{ ...estilos.td, ...estilos.tdTotal }}>
                    {totales[columna.id]}
                    {columna.sufijo ?? ''}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Tooltip fijo del encabezado: position: fixed lo saca del overflow
          horizontal del contenedor de la tabla. */}
      {pista && (
        <div className="formula-tooltip" style={{ left: pista.x, top: pista.y }} role="tooltip">
          <span className="formula-tooltip-formula">{pista.formula}</span>
          <span className="formula-tooltip-ejemplo">{pista.ejemplo}</span>
        </div>
      )}
    </>
  );
}

export default TablaFrecuencias;
