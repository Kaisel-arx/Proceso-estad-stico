// Prueba manual de las metricas: recalcula cada formula por una via independiente
// y la contrasta con el modulo, para no validar el codigo contra si mismo.
const { construirFrecuencias, medidaDePosicion } = require('../src/stats/frecuencias');

const r4 = (v) => Number(v.toFixed(4));

// --- Implementaciones de referencia, escritas al margen del modulo ---

function mediaAritmetica(filas, n) {
  // x barra = sumatoria(fi * xi) / n
  return r4(filas.reduce((s, f) => s + f.frecuencia * f.marcaClase, 0) / n);
}

function mediaPonderadaPorFr(filas) {
  // x virgulilla = sumatoria(fri * xi), con fri = fi / n
  const n = filas.reduce((s, f) => s + f.frecuencia, 0);
  return r4(filas.reduce((s, f) => s + (f.frecuencia / n) * f.marcaClase, 0));
}

function modaPorConteo(tabla) {
  // Mo = Li + (f1-f0)/((f1-f0)+(f1-f2)) * i, con Li = ii - 0.5
  const max = Math.max(...tabla.filas.map((f) => f.frecuencia));
  if (max <= 1) return null;
  const j = tabla.filas.findIndex((f) => f.frecuencia === max);
  const f1 = tabla.filas[j].frecuencia;
  const f0 = j > 0 ? tabla.filas[j - 1].frecuencia : 0;
  const f2 = j < tabla.filas.length - 1 ? tabla.filas[j + 1].frecuencia : 0;
  return r4(
    tabla.filas[j].limiteInferiorReal +
      ((f1 - f0) / ((f1 - f0) + (f1 - f2))) * tabla.amplitud
  );
}

function medianaPorAcumulada(tabla) {
  // Md = Li + ((n/2 - fa anterior) / f) * i, con Li = ii - 0.5
  const posicion = tabla.n / 2;
  const fila = tabla.filas.find((f) => posicion <= f.acumulada);
  const anterior = fila.acumulada - fila.frecuencia;
  return r4(fila.limiteInferiorReal + ((posicion - anterior) / fila.frecuencia) * tabla.amplitud);
}

function suavizadaEsperada(filas) {
  // fs = (f anterior + 2f + f posterior) / 4, replicando el vecino en los extremos
  return filas.map((f, j) => {
    const ant = filas[j - 1] ? filas[j - 1].frecuencia : f.frecuencia;
    const post = filas[j + 1] ? filas[j + 1].frecuencia : f.frecuencia;
    return r4((ant + 2 * f.frecuencia + post) / 4);
  });
}

function varianzaEsperada(tabla) {
  // sigma al cuadrado = sumatoria((xm - x barra)^2 * f) / n
  const n = tabla.n;
  const media = tabla.filas.reduce((s, f) => s + f.frecuencia * f.marcaClase, 0) / n;
  return tabla.filas.reduce((s, f) => s + (f.marcaClase - media) ** 2 * f.frecuencia, 0) / n;
}

function coeficienteVariacionEsperado(tabla) {
  // Cv = (sigma / x barra) * 100, con sigma sin redondear
  if (tabla.media === 0) return null;
  return r4((Math.sqrt(varianzaEsperada(tabla)) / tabla.media) * 100);
}

function posicionEsperada(tabla, tipo, k) {
  // X = Li + A * ((k*n/d - fa anterior) / (fa - fa anterior))
  const divisor = { cuartil: 4, decil: 10, percentil: 100 }[tipo];
  const posicion = (k * tabla.n) / divisor;
  const fila = tabla.filas.find((f) => posicion <= f.acumulada);
  const anterior = fila.acumulada - fila.frecuencia;
  return {
    posicion: r4(posicion),
    valor: r4(fila.limiteInferiorReal + ((posicion - anterior) / fila.frecuencia) * tabla.amplitud),
  };
}

const CASOS = {
  'n = 40 (parecido a tu referencia)': Array.from({ length: 40 }, (_, i) => 20 + ((i * 17) % 70)),
  'enteros con moda clara': [10, 10, 20, 30, 30, 30, 40, 50, 50, 60],
  'con decimales': [1.5, 2.5, 2.5, 3.5, 4.5, 9.9, 3.5, 3.5, 7.25, 8.75],
  'todos distintos (sin moda)': [1, 2, 3],
  'n impar': [12, 15, 15, 18, 22, 22, 22, 25, 28, 28, 30],
};

let fallos = 0;
const linea = (ok) => {
  if (!ok) fallos++;
  return ok ? 'ok  ' : 'FALLA';
};

for (const [nombre, datos] of Object.entries(CASOS)) {
  const t = construirFrecuencias(datos);

  const esperadoMedia = mediaAritmetica(t.filas, t.n);
  const esperadaPonderada = mediaPonderadaPorFr(t.filas);
  const esperadaPosicion = r4(t.n / 2);
  const esperadaMediana = medianaPorAcumulada(t);
  const esperadaModa = modaPorConteo(t);
  const esperadosFs = suavizadaEsperada(t.filas);
  const esperadoDesplazamiento = datos.every(Number.isInteger) ? 0.5 : r4(t.amplitud / 2);

  console.log(`\n${nombre}  (n = ${t.n}, k = ${t.k}, i = ${t.amplitud})`);
  console.log(`  media aritmetica  ${String(t.media).padEnd(9)} esperado ${esperadoMedia}   ${linea(t.media === esperadoMedia)}`);
  console.log(`  media ponderada   ${String(t.mediaPonderada).padEnd(9)} esperado ${esperadaPonderada}   ${linea(t.mediaPonderada === esperadaPonderada)}`);
  console.log(`  posicion mediana  ${String(t.posicionMediana).padEnd(9)} esperado ${esperadaPosicion}   ${linea(t.posicionMediana === esperadaPosicion)}`);
  console.log(`  mediana           ${String(t.mediana).padEnd(9)} esperado ${esperadaMediana}   ${linea(t.mediana === esperadaMediana)}`);
  console.log(`  moda              ${String(t.moda).padEnd(9)} esperado ${esperadaModa}   ${linea(t.moda === esperadaModa)}`);

  // fs = (f anterior + 2f + f posterior) / 4 en cada fila
  const fsOk = t.filas.every((f, j) => f.suavizada === esperadosFs[j]);
  console.log(`  fs suavizada      ${JSON.stringify(t.filas.map((f) => f.suavizada))}`);
  console.log(`                     ${JSON.stringify(esperadosFs)}   ${linea(fsOk)}`);

  // Li = ii - 0.5 (enteros) o ii - i/2 (decimales); Ls = is + el mismo desplazamiento
  const limitesOk = t.filas.every(
    (f) =>
      f.limiteInferiorReal === r4(f.limiteInferior - esperadoDesplazamiento) &&
      f.limiteSuperiorReal === r4(f.limiteSuperior + esperadoDesplazamiento)
  );
  console.log(`  Li / Ls           Li = ii - ${esperadoDesplazamiento}, Ls = is + ${esperadoDesplazamiento}   ${linea(limitesOk)}`);

  // Variabilidad: varianza, desviacion estandar y coeficiente de variacion
  const esperadaVarianza = r4(varianzaEsperada(t));
  const esperadaSigma = r4(Math.sqrt(varianzaEsperada(t)));
  const esperadoCv = coeficienteVariacionEsperado(t);
  console.log(`  varianza s^2      ${String(t.varianzaPoblacional).padEnd(9)} esperado ${esperadaVarianza}   ${linea(t.varianzaPoblacional === esperadaVarianza)}`);
  console.log(`  desviacion sigma  ${String(t.desviacionPoblacional).padEnd(9)} esperado ${esperadaSigma}   ${linea(t.desviacionPoblacional === esperadaSigma)}`);
  console.log(`  coef. variacion   ${String(t.coeficienteVariacion).padEnd(9)} esperado ${esperadoCv}   ${linea(t.coeficienteVariacion === esperadoCv)}`);

  // Medidas de posicion por familia: se comprueba una k de cada una
  const base = { filas: t.filas, n: t.n, amplitud: t.amplitud };
  for (const [tipo, k] of [['cuartil', 2], ['decil', 5], ['percentil', 90]]) {
    const r = medidaDePosicion(base, tipo, k);
    const e = posicionEsperada(t, tipo, k);
    const simbolo = { cuartil: 'Q', decil: 'D', percentil: 'P' }[tipo];
    const ok = r.posicion === e.posicion && r.valor === e.valor;
    console.log(
      `  ${simbolo}${k}`.padEnd(18) +
        `${String(r.valor).padEnd(9)} esperado ${e.valor} (pos ${e.posicion})   ${linea(ok)}`
    );
  }

  // Invariante de posicion: la mediana debe caer dentro del rango de los datos
  const min = Math.min(...datos);
  const max = Math.max(...datos);
  if (t.mediana < min || t.mediana > max) {
    console.log(`  FALLA mediana fuera de [${min}, ${max}]`);
    fallos++;
  }
  // La media ponderada coincide con la aritmetica, asi que hereda su rango
  if (t.mediaPonderada < min || t.mediaPonderada > max) {
    console.log(`  FALLA media ponderada fuera de [${min}, ${max}]`);
    fallos++;
  }
  // fs es un promedio ponderado (1, 2, 1) de tres frecuencias no negativas, asi que
  // nunca puede superar la mayor de las tres. Ojo: fs NO esta acotada por 2f, porque el
  // suavizado desplaza masa hacia clases vacias.
  const fsAcotado = t.filas.every((f, j) => {
    const vecindad = [t.filas[j - 1], f, t.filas[j + 1]]
      .filter(Boolean)
      .map((x) => x.frecuencia);
    return f.suavizada <= Math.max(...vecindad) + 1e-9;
  });
  if (!fsAcotado) {
    console.log('  FALLA fs supera el maximo de su vecindad');
    fallos++;
  }
}

console.log(fallos === 0 ? '\nPRUEBA OK: las metricas coinciden con el calculo independiente' : `\n${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
