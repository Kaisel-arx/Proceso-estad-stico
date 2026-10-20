const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  construirFrecuencias,
  modaAgrupada,
  posicionMediana,
  medidaDePosicion,
  TIPOS_POSICION,
} = require('../src/stats/frecuencias');

// El frontend es ESM y el backend CJS: se importa dinamicamente para comparar ambos algoritmos.
const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src', 'stats', 'frecuencias.js');

const MUESTRAS = [
  [12, 15, 15, 18, 22, 22, 22, 25, 28, 28, 30, 33, 33, 33, 36, 40, 40, 44, 45, 48, 50, 52, 55, 58, 60, 62, 65, 68, 70, 72, 75, 78, 80, 85, 88, 90, 5, 33, 40],
  [1.5, 2.25, 3.7, 4.1, 5.55, 6.3, 7.9, 8.05, 9.4, 2.5, 3.33, 4.75],
  [7, 7, 7, 7, 7],
  [1, 1000],
  [42],
  [-50, -10, 0, 10, 50],
  [-10, -4, -1, 1, 4, 8],
  Array.from({ length: 60 }, (_, i) => i + 1),
  [3, 3, 3, 4, 4, 4, 4, 5, 5, 5],
];

test('el modulo ESM del frontend es importable desde CJS', async () => {
  const mod = await import(`file:///${FRONTEND.replace(/\\/g, '/')}`);
  assert.equal(typeof mod.calcularTablaFrecuencias, 'function');
  assert.equal(typeof mod.percentilAgrupado, 'function');
});

test('backend y frontend producen exactamente la misma tabla', async () => {
  const mod = await import(`file:///${FRONTEND.replace(/\\/g, '/')}`);

  for (const datos of MUESTRAS) {
    const back = construirFrecuencias(datos);
    const front = mod.calcularTablaFrecuencias(datos);

    assert.equal(front.n, back.n, `n difiere para ${datos.length} valores`);
    assert.equal(front.k, back.k);
    assert.equal(front.amplitud, back.amplitud);
    assert.equal(front.datosEnteros, back.datosEnteros);
    assert.equal(front.media, back.media);
    assert.equal(front.mediaPonderada, back.mediaPonderada);
    assert.equal(front.posicionMediana, back.posicionMediana);
    assert.equal(front.moda, back.moda, `moda difiere para ${datos.length} valores`);
    assert.equal(front.sumaProducto, back.sumaProducto);
    assert.equal(front.sumaDesviacionPonderada, back.sumaDesviacionPonderada);
    assert.equal(front.varianzaPoblacional, back.varianzaPoblacional);
    assert.equal(front.varianzaMuestral, back.varianzaMuestral);
    assert.equal(front.desviacionPoblacional, back.desviacionPoblacional);
    assert.equal(front.desviacionMuestral, back.desviacionMuestral);
    assert.equal(front.coeficienteVariacion, back.coeficienteVariacion, `Cv difiere para ${datos.length} valores`);
    assert.deepEqual(front.detalleMediana, back.detalleMediana, `detalleMediana difiere para ${datos.length} valores`);
    assert.equal(front.q1, back.q1, `Q1 difiere para ${datos.length} valores`);
    assert.equal(front.mediana, back.mediana, `mediana difiere para ${datos.length} valores`);
    assert.equal(front.q3, back.q3, `Q3 difiere para ${datos.length} valores`);
    assert.equal(front.p17, back.p17, `P17 difiere para ${datos.length} valores`);
    assert.deepEqual(front.filas, back.filas, `filas difieren para ${datos.length} valores`);
  }
});

test('ambos modulos rechazan las mismas entradas invalidas', async () => {
  const mod = await import(`file:///${FRONTEND.replace(/\\/g, '/')}`);

  for (const malo of [null, undefined, [], '1,2,3', 42, {}]) {
    assert.equal(construirFrecuencias(malo), null, `backend acepto ${JSON.stringify(malo)}`);
    assert.equal(mod.calcularTablaFrecuencias(malo), null, `frontend acepto ${JSON.stringify(malo)}`);
  }
});

test('las medidas de posicion coinciden entre modulos', async () => {
  const mod = await import(`file:///${FRONTEND.replace(/\\/g, '/')}`);

  for (const datos of MUESTRAS) {
    const back = construirFrecuencias(datos);
    const front = mod.calcularTablaFrecuencias(datos);
    const etiqueta = `n=${datos.length}`;

    assert.equal(front.q1, back.q1, `Q1 ${etiqueta}`);
    assert.equal(front.mediana, back.mediana, `mediana ${etiqueta}`);
    assert.equal(front.q3, back.q3, `Q3 ${etiqueta}`);
    assert.equal(front.p17, back.p17, `P17 ${etiqueta}`);

    // Orden de posicion: P17 <= Q1 <= mediana <= Q3
    assert.ok(front.p17 <= front.q1, `P17 <= Q1 ${etiqueta}`);
    assert.ok(front.q1 <= front.q3, `Q1 <= Q3 ${etiqueta}`);
    assert.ok(front.q3 <= front.xMax + 1, `Q3 <= Xmax ${etiqueta}`);
  }
});

test('las medidas interactivas de posicion coinciden entre modulos', async () => {
  const mod = await import(`file:///${FRONTEND.replace(/\\/g, '/')}`);

  // Se recorren TODOS los k de cada familia, no solo una muestra
  for (const [tipo, config] of Object.entries(TIPOS_POSICION)) {
    assert.deepEqual(mod.TIPOS_POSICION[tipo], config, `config de ${tipo} difiere`);

    for (let k = config.min; k <= config.max; k++) {
      for (const datos of MUESTRAS) {
        const back = construirFrecuencias(datos);
        const front = mod.calcularTablaFrecuencias(datos);
        const baseBack = { filas: back.filas, n: back.n, amplitud: back.amplitud };
        const baseFront = { filas: front.filas, n: front.n, amplitud: front.amplitud };

        const rBack = medidaDePosicion(baseBack, tipo, k);
        const rFront = mod.medidaDePosicion(baseFront, tipo, k);
        assert.deepEqual(rFront, rBack, `${tipo} k=${k} difiere con n=${datos.length}`);
      }
    }
  }
});
