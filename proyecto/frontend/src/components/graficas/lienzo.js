import { formatear } from '../../utils/formato';

// Nucleo geometrico de las graficas: lienzo, escalas y helpers de dibujo.
// Todo en unidades del viewBox de 480x250: el SVG escala con el ancho
// disponible y el tamano de fuente se elige pensando en esa reduccion.
//
// Paleta. Cada color tiene un papel fijo y se sirve desde las variables de
// tema.css, de modo que se adapta al modo claro/oscuro sin tocar aqui:
//
//   - BARRA (relleno): slate #677e8a, solido y sobrio. El degradado sube un
//     tono en el borde superior.
//   - SERIE (lineas principales): plum en claro / rose en oscuro. Es el trazo
//     del poligono de frecuencias y de la curva de tendencia.
//   - ACENTO (series superpuestas y media): color harmonico de la paleta,
//     nunca el del relleno.
export const COLOR = {
  barra: 'var(--grafica-barra)',
  barraAlto: 'var(--grafica-barra-alta)',
  barraHover: 'var(--grafica-barra-hover)',
  caja: 'var(--grafica-barra)',
  serie: 'var(--grafica-serie)',
  acento: 'var(--grafica-acento)',
  borde: 'var(--trazo)',
  rejilla: 'var(--rejilla)',
  texto: 'var(--grafica-valor)',
  tenue: 'var(--grafica-texto)',
};

export const ANCHO = 480;
export const ALTO = 250;
// La izquierda reserva el hueco de las etiquetas del eje Y (la mas ancha es
// "100 %"), la inferior el de las del eje X, y arriba y derecha son el aire
// que deja el marco.
export const MARGEN = { arriba: 18, derecha: 18, abajo: 38, izquierda: 50 };
export const X0 = MARGEN.izquierda;
export const X1 = ANCHO - MARGEN.derecha;
export const Y0 = MARGEN.arriba;
export const Y1 = ALTO - MARGEN.abajo;

// Las barras van mas marcadas que los ejes a proposito: son el dato.
export const GROSO_BARRA = 2;
export const GROSO_EJE = 1.5;

export const estilos = {
  textoEje: { fontSize: 9.5, fontWeight: 500, fill: COLOR.tenue, fontFamily: 'system-ui, sans-serif' },
  textoValor: { fontSize: 11, fontWeight: 700, fill: COLOR.texto, fontFamily: 'system-ui, sans-serif' },
  textoPorcentaje: { fontSize: 9.5, fontWeight: 700, fontFamily: 'system-ui, sans-serif' },
};

// Escala lineal de un dominio al tramo de salida. El ||=1 evita el NaN cuando
// el dominio degenera en un punto, que pasa con datos constantes.
export function escala(dominio, salida) {
  const [a, b] = dominio;
  const rango = b - a || 1;
  return (v) => salida[0] + ((v - a) / rango) * (salida[1] - salida[0]);
}

/**
 * Escala del eje vertical con marcas en pasos redondos (1, 2 o 5 por potencia
 * de diez), para que las etiquetas caigan en valores legibles. El techo se
 * redondea hacia arriba hasta la siguiente marca, de modo que la serie mas
 * alta nunca queda pegada al marco.
 */
export function ejeVertical(maximo, pasos = 4) {
  if (!(maximo > 0)) return { techo: 1, marcas: [0, 1] };

  const bruto = maximo / pasos;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  const normalizado = bruto / magnitud;
  const factor = normalizado >= 5 ? 10 : normalizado >= 2 ? 5 : normalizado >= 1 ? 2 : 1;
  const paso = factor * magnitud;

  const techo = Math.ceil(maximo / paso) * paso;
  const marcas = [];
  for (let v = 0; v <= techo + paso / 1000; v += paso) marcas.push(Number(v.toFixed(4)));

  return { techo, marcas };
}

export function puntos(px, py, pares) {
  return pares.map(([x, y]) => `${px(x)},${py(y)}`).join(' ');
}

/**
 * Curva suave que pasa exactamente por todos los puntos, en SVG con bezier
 * cubicas (Catmull-Rom convertida). Los puntos de control se recortan al
 * intervalo de valores del tramo: sin el recorte, una curva que sube y luego
 * baja se pasa por debajo del eje entre dos clases y dibujaria frecuencias
 * negativas. Con dos puntos se degrada a la recta.
 */
export function curva(px, py, pares, tension = 1) {
  if (pares.length < 2) return puntos(px, py, pares);

  const P = pares.map(([x, y]) => [px(x), py(y)]);
  const k = tension / 6;
  const limites = (a, b) => [Math.min(a, b), Math.max(a, b)];

  let d = `M ${P[0][0]} ${P[0][1]}`;
  for (let i = 0; i < P.length - 1; i += 1) {
    const [x1, y1] = P[i];
    const [x2, y2] = P[i + 1];
    const prev = P[i - 1] ?? P[i];
    const next = P[i + 2] ?? P[i + 1];

    const [lo, hi] = limites(y1, y2);
    const c1y = Math.min(Math.max(y1 + (y2 - prev[1]) * k, lo), hi);
    const c2y = Math.min(Math.max(y2 + (next[1] - y1) * k, lo), hi);

    d += ` C ${x1 + (x2 - prev[0]) * k} ${c1y}, ${x2 - (next[0] - x1) * k} ${c2y}, ${x2} ${y2}`;
  }
  return d;
}

// Empuja una etiqueta hacia dentro del lienzo: el anclaje de texto es su
// centro, asi que sin esto la primera y la ultima se salen por los bordes.
export function anclar(x, margen = 22) {
  return Math.min(Math.max(x, X0 + margen), X1 - margen);
}

// Decimales de las etiquetas de los limites reales. Con datos enteros el
// desplazamiento es medio y basta con uno; con decimales dos limites
// distintos pueden acabar mostrando el mismo numero a un decimal.
export function decLimites(tabla) {
  return tabla.datosEnteros ? 1 : 2;
}

/**
 * Bordes de dibujo de cada barra.
 *
 * La tabla usa la notacion de Excel: Ls = ii + amplitud y el intervalo real
 * se escribe [ii - 0.5, is + 0.5], de modo que el Ls de una clase coincide
 * con el Li de la siguiente y los limites reales se pisan. Para dibujar, el
 * lado derecho de una barra es el limite inferior de la clase siguiente, y en
 * la ultima se reconstruye sumando la amplitud. Asi las clases quedan
 * contiguas y cada barra conserva su contorno cerrado.
 */
export function bordesBarra(tabla) {
  const { filas, amplitud } = tabla;
  return filas.map((f, i) => ({
    izquierda: f.limiteInferiorReal,
    derecha: i === filas.length - 1 ? f.limiteInferiorReal + amplitud : filas[i + 1].limiteInferiorReal,
  }));
}

// Lineas de tooltip por clase, compartidas por histograma, poligono,
// relativa y pastel.
export function lineasClase(fila, tabla) {
  const dec = decLimites(tabla);
  return [
    `Clase ${fila.clase}: [${formatear(fila.limiteInferior, dec)}, ${formatear(fila.limiteSuperior, dec)})`,
    `f = ${fila.frecuencia} datos · fa = ${fila.acumulada}`,
    `fr = ${formatear(fila.relativa, 2)} % · xm = ${formatear(fila.marcaClase, dec)}`,
  ];
}
