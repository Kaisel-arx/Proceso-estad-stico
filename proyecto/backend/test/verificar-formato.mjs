// Verificacion manual del formato: no forma parte de la suite, es una comprobacion visual.
import { calcularTablaFrecuencias } from '../../frontend/src/stats/frecuencias.js';
import { formatear, DECIMALES, DECIMALES_ENTERO } from '../../frontend/src/utils/formato.js';

const ENTEROS = [12, 15, 15, 18, 22, 22, 22, 25, 28, 28, 30, 33, 33, 33, 36, 40, 40, 44, 45, 48, 50, 52, 55, 58, 60, 62, 65, 68, 70, 72, 75, 78, 80, 85, 88, 90, 5, 33, 40];
const DECIMALES_DATOS = [1.5, 2.25, 3.7, 4.1, 5.55, 6.3, 7.9, 8.05, 9.4, 2.5, 3.33, 4.75];

for (const [nombre, datos] of [['ENTEROS', ENTEROS], ['DECIMALES', DECIMALES_DATOS]]) {
  const t = calcularTablaFrecuencias(datos);
  console.log(`\n=== ${nombre} (n = ${t.n}) ===`);
  console.log('medidas de tendencia central / posicion / variabilidad:');
  const medidas = [
    ['media', t.media], ['mediaPonderada', t.mediaPonderada], ['mediana', t.mediana], ['moda', t.moda],
    ['q1', t.q1], ['q3', t.q3], ['p17', t.p17],
    ['varianzaPoblacional', t.varianzaPoblacional], ['desviacionPoblacional', t.desviacionPoblacional],
    ['varianzaMuestral', t.varianzaMuestral], ['desviacionMuestral', t.desviacionMuestral],
    ['coeficienteVariacion', t.coeficienteVariacion], ['sumaProducto', t.sumaProducto],
    ['sumaDesviacionPonderada', t.sumaDesviacionPonderada],
  ];
  for (const [clave, valor] of medidas) {
    const fueraDeDos = typeof valor === 'number' && !formatear(valor).includes(',');
    console.log(`  ${fueraDeDos ? 'FALLA' : 'ok   '} ${clave.padEnd(24)} ${formatear(valor)}`);
  }

  console.log('columnas de la tabla:');
  const cols = [
    ['f', (f) => f.frecuencia, DECIMALES_ENTERO],
    ['fa', (f) => f.acumulada, DECIMALES_ENTERO],
    ['fr', (f) => f.relativa, DECIMALES],
    ['fs', (f) => f.suavizada, DECIMALES],
    ['xm', (f) => f.marcaClase, DECIMALES],
    ['f*xm', (f) => f.producto, DECIMALES],
    ['(fr)(xm)', (f) => f.relativaProducto, DECIMALES],
    ['(xm-x)^2', (f) => f.desviacion, DECIMALES],
    ['(xm-x)^2*f', (f) => f.desviacionPonderada, DECIMALES],
  ];
  for (const [header, leer, dec] of cols) {
    const esEntero = dec === DECIMALES_ENTERO;
    const fila = t.filas.map((f) => formatear(leer(f), dec));
    const suma = formatear(t.filas.reduce((s, f) => s + leer(f), 0), dec);
    const ok = esEntero ? fila.every((v) => !v.includes(',')) : fila.every((v) => /,\d\d$/.test(v));
    console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${header.padEnd(12)} ${fila.join('  ')}   Sigma=${suma}`);
  }
}
