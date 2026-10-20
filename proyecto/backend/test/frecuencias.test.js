const test = require('node:test');
const assert = require('node:assert/strict');

const {
  construirFrecuencias,
  percentilAgrupado,
  posicionMediana,
  modaAgrupada,
  frecuenciasSuavizadas,
  medidaDePosicion,
  TIPOS_POSICION,
  intervalosSturges,
  K_INTERVALOS,
  MINIMO_DATOS,
} = require('../src/stats/frecuencias');

const ENTEROS = [12, 15, 15, 18, 22, 22, 22, 25, 28, 28, 30, 33, 33, 33, 36, 40, 40, 44, 45, 48, 50, 52, 55, 58, 60, 62, 65, 68, 70, 72, 75, 78, 80, 85, 88, 90, 5, 33, 40];
const DECIMALES = [1.5, 2.25, 3.7, 4.1, 5.55, 6.3, 7.9, 8.05, 9.4, 2.5, 3.33, 4.75];

// Mismo redondeo que aplica el modulo, para comparar contra las formulas a mano
function redondearA4(valor) {
  return Number(valor.toFixed(4));
}

// fr se redondea a 2 decimales, que es la precision con la que se presenta
function redondearA2(valor) {
  return Number(valor.toFixed(2));
}

test('la tabla rechaza entradas invalidas', () => {
  assert.equal(construirFrecuencias(null), null);
  assert.equal(construirFrecuencias(undefined), null);
  assert.equal(construirFrecuencias([]), null);
  assert.equal(construirFrecuencias('1,2,3'), null);
  assert.equal(construirFrecuencias(42), null);
});

test('intervalosSturges aplica k = 1 + 3.322 * log10(n) redondeado', () => {
  assert.equal(intervalosSturges(40), Math.round(1 + 3.322 * Math.log10(40)));
  assert.equal(intervalosSturges(1), 1);
  assert.equal(intervalosSturges(0), K_INTERVALOS);
  assert.equal(intervalosSturges(-5), K_INTERVALOS);
  assert.equal(intervalosSturges(NaN), K_INTERVALOS);
});

test('genera exactamente k intervalos, calculados por Sturges', () => {
  const tabla = construirFrecuencias(ENTEROS);
  assert.equal(tabla.k, intervalosSturges(ENTEROS.length));
  assert.equal(tabla.filas.length, tabla.k);
  assert.equal(tabla.n, ENTEROS.length);
});

test('la suma de fi coincide con n y Fi cierra en n', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const suma = tabla.filas.reduce((s, f) => s + f.frecuencia, 0);
  assert.equal(suma, tabla.n);
  assert.equal(tabla.filas.at(-1).acumulada, tabla.n);
});

test('ningun dato se pierde entre los intervalos', () => {
  for (const datos of [ENTEROS, DECIMALES, [7, 7, 7, 7, 7], [1, 1000]]) {
    const tabla = construirFrecuencias(datos);
    const suma = tabla.filas.reduce((s, f) => s + f.frecuencia, 0);
    assert.equal(suma, datos.length, `se perdieron datos en ${JSON.stringify(datos.slice(0, 5))}`);
  }
});

test('Xmax cae dentro del ultimo intervalo (cerrado en LS)', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const ultimo = tabla.filas.at(-1);
  assert.ok(tabla.xMax <= ultimo.limiteSuperior);
  assert.ok(tabla.xMax >= ultimo.limiteInferior);
});

test('la suma de fr da 100 y coincide con el porcentaje almacenado', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const sumaFr = tabla.filas.reduce((s, f) => s + f.relativa, 0);
  assert.ok(Math.abs(sumaFr - 100) < 0.1, `suma fr = ${sumaFr}`);

  // fr = f * 100 / n, no la proporcion: con f = 4 y n = 40 el valor es 10
  tabla.filas.forEach((f) => {
    const esperado = redondearA2((f.frecuencia * 100) / tabla.n);
    assert.equal(f.relativa, esperado, `fr de la clase ${f.clase}`);
  });

  // El campo porcentaje se conserva solo por el NOT NULL del esquema: es un espejo de fr
  tabla.filas.forEach((f) => {
    assert.equal(f.porcentaje, f.relativa, `porcentaje de la clase ${f.clase}`);
  });
});

test('los intervalos son contiguos y de amplitud uniforme', () => {
  const tabla = construirFrecuencias(ENTEROS);
  tabla.filas.forEach((f, i) => {
    const ancho = Number((f.limiteSuperior - f.limiteInferior).toFixed(4));
    assert.ok(Math.abs(ancho - tabla.amplitud) < 0.01, `intervalo ${i + 1} ancho ${ancho}`);
    if (i > 0) {
      assert.equal(f.limiteInferior, tabla.filas[i - 1].limiteSuperior, `hueco antes del intervalo ${i + 1}`);
    }
  });
});

test('datos enteros producen limites enteros', () => {
  const tabla = construirFrecuencias(ENTEROS);
  assert.equal(tabla.datosEnteros, true);
  tabla.filas.forEach((f) => {
    assert.ok(Number.isInteger(f.limiteInferior), `ii no entero: ${f.limiteInferior}`);
    assert.ok(Number.isInteger(f.limiteSuperior), `is no entero: ${f.limiteSuperior}`);
  });
});

test('datos decimales producen limites decimales', () => {
  const tabla = construirFrecuencias(DECIMALES);
  assert.equal(tabla.datosEnteros, false);
});

test('xm es el punto medio del intervalo', () => {
  const tabla = construirFrecuencias(ENTEROS);
  tabla.filas.forEach((f) => {
    assert.equal(f.marcaClase, Number(((f.limiteInferior + f.limiteSuperior) / 2).toFixed(2)));
  });
});

test('x barra = sumatoria(f * xm) / n', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const esperado = tabla.filas.reduce((s, f) => s + f.frecuencia * f.marcaClase, 0) / tabla.n;
  assert.ok(Math.abs(tabla.media - esperado) < 0.01, `media ${tabla.media} vs ${esperado}`);
  assert.ok(Math.abs(tabla.sumaProducto - tabla.n * tabla.media) < 0.5);
});

test('las columnas de apoyo son consistentes fila a fila', () => {
  const tabla = construirFrecuencias(ENTEROS);
  tabla.filas.forEach((f) => {
    assert.equal(f.producto, Number((f.frecuencia * f.marcaClase).toFixed(2)));
    const delta = Number((f.marcaClase - tabla.media).toFixed(4));
    assert.ok(Math.abs(f.desviacion - Number((delta * delta).toFixed(4))) < 0.01);
    assert.ok(Math.abs(f.desviacionPonderada - f.desviacion * f.frecuencia) < 0.5);
  });
});

test('la varianza y la desviacion derivan de la suma de (xm - x)^2 * f', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const suma = tabla.filas.reduce((s, f) => s + f.desviacionPonderada, 0);
  assert.ok(Math.abs(tabla.sumaDesviacionPonderada - suma) < 0.01);
  assert.ok(Math.abs(tabla.varianzaPoblacional - suma / tabla.n) < 0.01);
  assert.ok(Math.abs(tabla.varianzaMuestral - suma / (tabla.n - 1)) < 0.01);
  assert.ok(Math.abs(tabla.desviacionPoblacional - Math.sqrt(tabla.varianzaPoblacional)) < 0.01);
  assert.ok(Math.abs(tabla.desviacionMuestral - Math.sqrt(tabla.varianzaMuestral)) < 0.01);
});

test('la varianza poblacional es menor o igual que la muestral', () => {
  const tabla = construirFrecuencias(ENTEROS);
  assert.ok(tabla.varianzaPoblacional <= tabla.varianzaMuestral);
  assert.ok(tabla.desviacionPoblacional <= tabla.desviacionMuestral);
});

test('percentil: rechaza k fuera de [0, 100] y tablas vacias', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const base = { filas: tabla.filas, n: tabla.n, amplitud: tabla.amplitud, xMin: tabla.xMin };

  assert.equal(percentilAgrupado(base, -1), null);
  assert.equal(percentilAgrupado(base, 101), null);
  assert.equal(percentilAgrupado(base, NaN), null);
  assert.equal(percentilAgrupado(base, '50'), null);
  assert.equal(percentilAgrupado({ filas: [], n: 0, amplitud: 1, xMin: 0 }, 50), null);
});

test('percentil: los extremos se frenan en los limites reales de la primera y ultima clase', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const base = { filas: tabla.filas, n: tabla.n, amplitud: tabla.amplitud };
  const primera = tabla.filas[0];
  const ultima = tabla.filas.at(-1);

  // P0 arranca en Li de la primera clase
  assert.equal(percentilAgrupado(base, 0), primera.limiteInferiorReal);
  assert.equal(percentilAgrupado(base, 0), redondearA4(primera.limiteInferior - 0.5));

  // P100 avanza i desde Li de la ultima clase. Ojo: como el paso es i y no i + 1,
  // el resultado queda medio unidad por debajo de Ls: es la consecuencia de la
  // formula del curso (Li + fraccion * i), no un error de calculo.
  const p100 = percentilAgrupado(base, 100);
  assert.equal(p100, redondearA4(ultima.limiteInferiorReal + tabla.amplitud));
  assert.ok(p100 >= ultima.limiteInferiorReal && p100 <= ultima.limiteSuperiorReal);
});

test('percentil: los cuartiles vienen en orden y la mediana cae en el centro', () => {
  const tabla = construirFrecuencias(ENTEROS);

  assert.ok(tabla.q1 > 0 && tabla.q1 < tabla.xMax, `Q1 = ${tabla.q1}`);
  assert.ok(tabla.q1 <= tabla.mediana, `Q1 ${tabla.q1} > mediana ${tabla.mediana}`);
  assert.ok(tabla.mediana <= tabla.q3, `mediana ${tabla.mediana} > Q3 ${tabla.q3}`);
  assert.ok(tabla.q3 <= tabla.xMax, `Q3 = ${tabla.q3}`);
  assert.ok(Math.abs(tabla.media - tabla.mediana) < 5, 'media y mediana deben ser del mismo orden');
});

test('percentil: Q1, mediana y Q3 usan las posiciones 25, 50 y 75', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const base = { filas: tabla.filas, n: tabla.n, amplitud: tabla.amplitud, xMin: tabla.xMin };

  assert.equal(tabla.q1, percentilAgrupado(base, 25));
  assert.equal(tabla.mediana, percentilAgrupado(base, 50));
  assert.equal(tabla.q3, percentilAgrupado(base, 75));
  assert.equal(tabla.p17, percentilAgrupado(base, 17));
});

test('percentil: P17 queda por debajo de la mediana', () => {
  const tabla = construirFrecuencias(ENTEROS);
  assert.ok(tabla.p17 < tabla.mediana, `P17 ${tabla.p17} vs mediana ${tabla.mediana}`);
  assert.ok(tabla.p17 > tabla.xMin, `P17 = ${tabla.p17}`);
});

test('limites reales: Li = ii - 0.5 y Ls = is + 0.5 con datos enteros', () => {
  const tabla = construirFrecuencias(ENTEROS);
  assert.equal(tabla.desplazamiento, 0.5);
  tabla.filas.forEach((f) => {
    assert.equal(f.limiteInferiorReal, redondearA4(f.limiteInferior - 0.5), `Li de la clase ${f.clase}`);
    assert.equal(f.limiteSuperiorReal, redondearA4(f.limiteSuperior + 0.5), `Ls de la clase ${f.clase}`);
  });
});

test('limites reales: con decimales la extension es media amplitud', () => {
  const tabla = construirFrecuencias(DECIMALES);
  const media = tabla.amplitud / 2;
  assert.equal(tabla.desplazamiento, media);
  tabla.filas.forEach((f) => {
    assert.equal(f.limiteInferiorReal, redondearA4(f.limiteInferior - media));
  });
});

test('frecuencias suavizadas: fs = (f anterior + 2f + f posterior) / 4', () => {
  const filas = [{ frecuencia: 2 }, { frecuencia: 6 }, { frecuencia: 4 }, { frecuencia: 8 }];
  // j=3: anterior=4, 2*8=16, posterior=8 (replicado) -> (4+16+8)/4 = 7
  assert.deepEqual(frecuenciasSuavizadas(filas), [3, 4.5, 5.5, 7]);
});

test('frecuencias suavizadas: en los extremos se replica el vecino', () => {
  // Serie constante: la suavizacion debe devolverla intacta
  const constante = [{ frecuencia: 5 }, { frecuencia: 5 }, { frecuencia: 5 }, { frecuencia: 5 }];
  assert.deepEqual(frecuenciasSuavizadas(constante), [5, 5, 5, 5]);
  // fs del primer intervalo = (5 + 2*5 + 5) / 4 = 5, no 3.75 como daria rellenar con cero
  const conPico = [{ frecuencia: 5 }, { frecuencia: 20 }, { frecuencia: 5 }];
  assert.deepEqual(frecuenciasSuavizadas(conPico), [8.75, 12.5, 8.75]);
});

test('frecuencias suavizadas: se propaga a cada fila de la tabla', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const esperado = frecuenciasSuavizadas(tabla.filas);
  tabla.filas.forEach((f, j) => {
    assert.equal(f.suavizada, esperado[j], `fs de la clase ${f.clase}`);
  });
});

test('(fr)(xm) = fr * xm / 100 fila a fila, con fr en porcentaje', () => {
  const tabla = construirFrecuencias(ENTEROS);

  tabla.filas.forEach((f) => {
    // La formula parte del fr YA redondeado a 2 decimales que produce el motor
    const esperado = redondearA4((f.relativa * f.marcaClase) / 100);
    assert.equal(f.relativaProducto, esperado, `(fr)(xm) de la clase ${f.clase}`);
  });

  // Dividir entre 100 es lo que devuelve la escala de la proporcion: sin esa division
  // el valor seria 100 veces mayor. Se compara con tolerancia porque el motor redondea
  // DESPUES de dividir y este test redondea antes.
  tabla.filas.forEach((f) => {
    const sinDividir = f.relativa * f.marcaClase;
    assert.ok(
      Math.abs(f.relativaProducto - sinDividir / 100) < 0.0001,
      `(fr)(xm) de la clase ${f.clase} no es fr * xm / 100`
    );
    assert.ok(
      Math.abs(f.relativaProducto * 100 - sinDividir) < 0.01,
      `la escala de la clase ${f.clase} no es la proporcion`
    );
  });
});

test('media ponderada: sumatoria(fr * xm) / 100 con fr sin redondear equivale a la media aritmetica', () => {
  // x virgulilla = sumatoria(fr * xm) / 100, que es lo que suma la columna (fr)(xm)
  const tabla = construirFrecuencias(ENTEROS);

  // Se suman los productos SIN redondear y se redondea una sola vez al final
  const aMano = tabla.filas.reduce((s, f) => s + (f.frecuencia / tabla.n) * f.marcaClase, 0);
  assert.equal(tabla.mediaPonderada, redondearA4(aMano));

  // La normalizacion / 100 es la que devuelve la media aritmetica
  assert.equal(tabla.mediaPonderada, tabla.media);

  // La suma de los (fr)(xm) de la tabla ya es la media ponderada
  const sumaCeldas = tabla.filas.reduce((s, f) => s + f.relativaProducto, 0);
  assert.ok(
    Math.abs(sumaCeldas - tabla.mediaPonderada) < 0.01,
    `suma (fr)(xm) = ${sumaCeldas} frente a media ponderada = ${tabla.mediaPonderada}`
  );

  // Y NO debe ser exactamente igual: esa via arrastra el redondeo de cada celda.
  // Este test documenta la diferencia para que no vuelva.
  assert.notEqual(tabla.mediaPonderada, redondearA4(sumaCeldas));
});

test('mediana: se interpola desde el limite inferior real, no desde ii', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const posicion = tabla.n / 2;
  const fila = tabla.filas.find((f) => posicion <= f.acumulada);
  const faAnterior = fila.acumulada - fila.frecuencia;
  const aMano = redondearA4(
    fila.limiteInferiorReal + ((posicion - faAnterior) / fila.frecuencia) * tabla.amplitud
  );
  assert.equal(tabla.mediana, aMano);
  // Usar ii en vez de Li correria el resultado justo 0.5
  const conII = redondearA4(
    fila.limiteInferior + ((posicion - faAnterior) / fila.frecuencia) * tabla.amplitud
  );
  assert.equal(tabla.mediana, redondearA4(conII - 0.5));
});

test('moda: se interpola desde el limite inferior real de la clase modal', () => {
  const tabla = construirFrecuencias(ENTEROS);
  if (tabla.moda === null) return;
  const max = Math.max(...tabla.filas.map((f) => f.frecuencia));
  const j = tabla.filas.findIndex((f) => f.frecuencia === max);
  const f1 = tabla.filas[j].frecuencia;
  const f0 = j > 0 ? tabla.filas[j - 1].frecuencia : 0;
  const f2 = j < tabla.filas.length - 1 ? tabla.filas[j + 1].frecuencia : 0;
  const aMano = redondearA4(
    tabla.filas[j].limiteInferiorReal + ((f1 - f0) / ((f1 - f0) + (f1 - f2))) * tabla.amplitud
  );
  assert.equal(tabla.moda, aMano);
});

test('posicionMediana: es n/2', () => {
  assert.equal(posicionMediana(40), 20);
  assert.equal(posicionMediana(39), 19.5);
  assert.equal(posicionMediana(2), 1);
  assert.equal(posicionMediana(0), null);
  assert.equal(posicionMediana(-5), null);
  assert.equal(posicionMediana(NaN), null);
});

test('moda: se interpola desde la clase modal usando Li', () => {
  // Li de la clase modal = 10 - 0.5 = 9.5
  const filas = [
    { limiteInferior: 0, limiteInferiorReal: -0.5, frecuencia: 1 },
    { limiteInferior: 10, limiteInferiorReal: 9.5, frecuencia: 5 },
    { limiteInferior: 20, limiteInferiorReal: 19.5, frecuencia: 2 },
  ];
  // Mo = 9.5 + (5-1)/((5-1)+(5-2)) * 10 = 9.5 + (4/7)*10
  assert.equal(modaAgrupada({ filas, amplitud: 10 }), redondearA4(9.5 + (4 / 7) * 10));
});

test('moda: la clase modal inicial usa f0 = 0', () => {
  const filas = [
    { limiteInferior: 0, limiteInferiorReal: -0.5, frecuencia: 4 },
    { limiteInferior: 10, limiteInferiorReal: 9.5, frecuencia: 1 },
  ];
  // Mo = -0.5 + (4 - 0)/((4 - 0) + (4 - 1)) * 10
  assert.equal(modaAgrupada({ filas, amplitud: 10 }), redondearA4(-0.5 + (4 / 7) * 10));
});

test('moda: null cuando ninguna clase se repite', () => {
  const filas = [
    { limiteInferior: 0, limiteInferiorReal: -0.5, frecuencia: 1 },
    { limiteInferior: 10, limiteInferiorReal: 9.5, frecuencia: 1 },
    { limiteInferior: 20, limiteInferiorReal: 19.5, frecuencia: 1 },
  ];
  assert.equal(modaAgrupada({ filas, amplitud: 10 }), null);
});

test('moda: el denominador nunca es cero, asi que la moda siempre existe si algo se repite', () => {
  // j es la PRIMERA clase modal, luego f1 > f0 y el denominador es positivo.
  // Con un empate la moda cae en el borde de la primera de las clases empatadas.
  const empate = [
    { limiteInferior: 0, limiteInferiorReal: -0.5, frecuencia: 2 },
    { limiteInferior: 10, limiteInferiorReal: 9.5, frecuencia: 2 },
    { limiteInferior: 20, limiteInferiorReal: 19.5, frecuencia: 2 },
  ];
  // Mo = -0.5 + (2-0)/((2-0)+(2-2)) * 10 = 9.5
  assert.equal(modaAgrupada({ filas: empate, amplitud: 10 }), 9.5);
  assert.notEqual(modaAgrupada({ filas: empate, amplitud: 10 }), null);
});

test('moda: null con entradas invalidas', () => {
  assert.equal(modaAgrupada({ filas: [], amplitud: 10 }), null);
  assert.equal(modaAgrupada({ filas: null, amplitud: 10 }), null);
});

test('moda: null cuando ninguna clase repite un valor', () => {
  // Con 3 datos y k = 6 intervalos cada clase toma un solo valor: no hay moda
  const tabla = construirFrecuencias([1, 2, 3]);
  assert.ok(
    tabla.filas.every((f) => f.frecuencia <= 1),
    'ninguna clase debe repetir'
  );
  assert.equal(tabla.moda, null);
});

test('mediana: sigue siendo el percentil 50 y usa la posicion n/2', () => {
  const tabla = construirFrecuencias([12, 15, 15, 18, 22, 22, 22, 25, 28, 28, 30, 33, 33, 33, 36, 40, 40, 44, 45, 48]);
  const base = { filas: tabla.filas, n: tabla.n, amplitud: tabla.amplitud };
  assert.equal(tabla.mediana, percentilAgrupado(base, 50));
  assert.equal(tabla.posicionMediana, 10);
  // n / 2 debe ser el valor que percentilAgrupado usa como posicion para k = 50
  assert.equal((50 / 100) * tabla.n, tabla.n / 2);
});

test('percentil: con muestra uniforme amplia la mediana agrupada ~= mediana real', () => {
  // 1..60 equiespaciado: la mediana real es 30,5 y la distribucion es uniforme dentro de cada clase
  const uniforme = Array.from({ length: 60 }, (_, i) => i + 1);
  const tabla = construirFrecuencias(uniforme);
  assert.ok(Math.abs(tabla.mediana - 30.5) < 1.5, `mediana agrupada ${tabla.mediana} vs real 30.5`);
  assert.ok(Math.abs(tabla.media - tabla.mediana) < 2, `media ${tabla.media} vs mediana ${tabla.mediana}`);
});

test('percentil:Limitacion conocida con muestra pequena y desigual', () => {
  // La interpolacion agrupada asume distribucion uniforme dentro de cada intervalo.
  // Con pocos datos la mediana interpolada se aleja de la mediana real: es esperado, no un error.
  const desigual = [10, 20, 30, 40, 50, 50, 50, 60, 70, 80, 90];
  const tabla = construirFrecuencias(desigual);
  const medianaReal = 50;
  assert.ok(
    Math.abs(tabla.mediana - medianaReal) > 1,
    'con esta muestra la interpolacion debe desviarse de la mediana real'
  );
  // Lo que si debe cumplirse siempre: el resultado cae dentro del rango de los datos
  assert.ok(tabla.mediana >= Math.min(...desigual) && tabla.mediana <= Math.max(...desigual));
});

test('percentil: el resultado cae dentro de los limites reales de su intervalo', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const base = { filas: tabla.filas, n: tabla.n, amplitud: tabla.amplitud };

  for (const k of [1, 5, 17, 25, 33, 50, 66, 75, 90, 99]) {
    const p = percentilAgrupado(base, k);
    const posicion = (k / 100) * tabla.n;
    const fila = tabla.filas.find((f) => posicion <= f.acumulada);
    // El invariante que si vale: el percentil cae en [Li, Ls] de su clase.
    // Con la formula del curso (Li + fraccion * i) queda hasta medio unidad por debajo
    // de is, asi que no se puede exigir que caiga en [ii, is].
    assert.ok(
      p >= fila.limiteInferiorReal - 0.001 && p <= fila.limiteSuperiorReal + 0.001,
      `P${k} = ${p} fuera de [${fila.limiteInferiorReal}, ${fila.limiteSuperiorReal}]`
    );
    assert.ok(
      p >= fila.limiteInferiorReal && p <= fila.limiteInferiorReal + tabla.amplitud + 0.001,
      `P${k} = ${p} fuera del recorrido [Li, Li + i]`
    );
  }
});

test('el resultado es determinista', () => {
  const a = construirFrecuencias(ENTEROS);
  const b = construirFrecuencias(ENTEROS);
  assert.deepEqual(a, b);
});

test('el orden de entrada no altera el resultado', () => {
  const a = construirFrecuencias(ENTEROS);
  const b = construirFrecuencias([...ENTEROS].reverse());
  assert.deepEqual(a, b);
});

test('MINIMO_DATOS esta definido y es al menos 2', () => {
  assert.equal(MINIMO_DATOS, 2);
});

test('un solo valor no rompe el calculo (caso borde)', () => {
  const tabla = construirFrecuencias([42]);
  assert.equal(tabla.n, 1);
  assert.equal(tabla.rango, 0);
  assert.equal(tabla.amplitud, 1);
  assert.equal(tabla.filas.reduce((s, f) => s + f.frecuencia, 0), 1);
  assert.equal(tabla.varianzaMuestral, 0, 'con n = 1 la varianza muestral no esta definida, debe ser 0');
});

// --- Medidas de variabilidad: varianza, desviacion estandar y coeficiente de variacion ---

test('varianza: sigma al cuadrado = sumatoria((xm - x barra)^2 * f) / n', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const numerador = tabla.filas.reduce((s, f) => s + f.desviacionPonderada, 0);
  assert.equal(tabla.sumaDesviacionPonderada, redondearA4(numerador));
  assert.equal(tabla.varianzaPoblacional, redondearA4(numerador / tabla.n));
  // La tabla trae las dos columnas que exige la formula
  tabla.filas.forEach((f) => {
    const delta = redondearA4(f.marcaClase - tabla.media);
    assert.equal(f.desviacion, redondearA4(delta * delta), '(xm - x)^2 en la clase ' + f.clase);
    assert.equal(f.desviacionPonderada, redondearA4(f.desviacion * f.frecuencia));
  });
});

test('desviacion estandar: sigma es la raiz cuadrada de sigma al cuadrado', () => {
  const tabla = construirFrecuencias(ENTEROS);
  assert.equal(tabla.desviacionPoblacional, redondearA4(Math.sqrt(tabla.varianzaPoblacional)));
  assert.equal(tabla.desviacionMuestral, redondearA4(Math.sqrt(tabla.varianzaMuestral)));
  // Con n > 1 la varianza muestral es mayor: dividir por n - 1 engorda el resultado
  assert.ok(tabla.varianzaMuestral > tabla.varianzaPoblacional);
  assert.ok(tabla.desviacionMuestral > tabla.desviacionPoblacional);
});

test('coeficiente de variacion: Cv = (sigma / x barra) * 100', () => {
  const tabla = construirFrecuencias(ENTEROS);
  // Se deriva de sigma SIN redondear: si se usara la sigma ya redondeada a 4 decimales,
  // el Cv arrastraria ese redondeo y diferiria en el 4to decimal.
  const sigmaExacto = Math.sqrt(tabla.sumaDesviacionPonderada / tabla.n);
  const esperado = redondearA4((sigmaExacto / tabla.media) * 100);
  assert.equal(tabla.coeficienteVariacion, esperado);
  // Se expresa en porcentaje, asi que no debe pasar de 100 con estos datos
  assert.ok(tabla.coeficienteVariacion > 0 && tabla.coeficienteVariacion < 100);
});

test('coeficiente de variacion: sin dispersion es cero', () => {
  const tabla = construirFrecuencias([5, 5, 5, 5]);
  assert.equal(tabla.varianzaPoblacional, 0);
  assert.equal(tabla.desviacionPoblacional, 0);
  assert.equal(tabla.coeficienteVariacion, 0);
});

test('coeficiente de variacion: con media cero no esta definido y se devuelve null', () => {
  // Datos simetricos alrededor de cero: la media agrupada cae exactamente en 0 y Cv seria
  // una division por cero. El modulo devuelve null en vez de Infinity o NaN.
  const tabla = construirFrecuencias([-10, -4, -1, 1, 4, 8]);
  assert.equal(tabla.media, 0);
  assert.ok(tabla.desviacionPoblacional > 0, 'hay dispersion, solo falta la media');
  assert.equal(tabla.coeficienteVariacion, null, 'no se divide por cero, se devuelve null');
});

// --- Modulo interactivo de medidas de posicion: cuartiles, deciles y percentiles ---

test('medidas de posicion: la posicion es k * n / divisor segun la familia', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const base = { filas: tabla.filas, n: tabla.n, amplitud: tabla.amplitud };

  // n = 39: Q3 -> 3*39/4 = 29.25, D3 -> 3*39/10 = 11.7, P90 -> 90*39/100 = 35.1
  assert.equal(medidaDePosicion(base, 'cuartil', 3).posicion, 29.25);
  assert.equal(medidaDePosicion(base, 'decil', 3).posicion, 11.7);
  assert.equal(medidaDePosicion(base, 'percentil', 90).posicion, 35.1);
});

test('medidas de posicion: el valor sale de Li + A * ((posicion - fa anterior) / f)', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const base = { filas: tabla.filas, n: tabla.n, amplitud: tabla.amplitud };

  for (const [tipo, k] of [['cuartil', 2], ['decil', 7], ['percentil', 90]]) {
    const r = medidaDePosicion(base, tipo, k);
    const fila = tabla.filas.find((f) => f.clase === r.clase);
    const faAnterior = fila.acumulada - fila.frecuencia;
    const esperado = redondearA4(
      fila.limiteInferiorReal +
        ((r.posicion - faAnterior) / fila.frecuencia) * tabla.amplitud
    );
    assert.equal(r.valor, esperado, `${tipo} k=${k}`);
    assert.equal(r.clase, fila.clase, `${tipo} k=${k} debe señalar su intervalo`);
  }
});

test('medidas de posicion: Q2, D5 y P50 coinciden porque n/2 es la misma posicion', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const base = { filas: tabla.filas, n: tabla.n, amplitud: tabla.amplitud };

  const q2 = medidaDePosicion(base, 'cuartil', 2);
  const d5 = medidaDePosicion(base, 'decil', 5);
  const p50 = medidaDePosicion(base, 'percentil', 50);
  const mediana = tabla.detalleMediana;

  assert.equal(q2.posicion, d5.posicion);
  assert.equal(d5.posicion, p50.posicion);
  assert.equal(p50.posicion, mediana.posicion);
  assert.equal(q2.valor, d5.valor);
  assert.equal(d5.valor, p50.valor);
  // Y las cuatro son la mediana que ya se reportaba por la via tradicional
  assert.equal(p50.valor, tabla.mediana);
  assert.equal(mediana.valor, tabla.mediana);
});

test('medidas de posicion: k se recorta a su rango y se rechaza lo que no es entero', () => {
  const tabla = construirFrecuencias(ENTEROS);
  const base = { filas: tabla.filas, n: tabla.n, amplitud: tabla.amplitud };

  // k = 0 es la omision y las cotas por encima del limite teorico no existen
  assert.equal(medidaDePosicion(base, 'cuartil', 0), null);
  assert.equal(medidaDePosicion(base, 'cuartil', 5), null);
  assert.equal(medidaDePosicion(base, 'decil', 11), null);
  assert.equal(medidaDePosicion(base, 'percentil', 0), null);
  assert.equal(medidaDePosicion(base, 'percentil', 101), null);
  // Los limites teoricos superiores si son validos: Q4, D10 y P100 caen en la ultima clase
  assert.equal(medidaDePosicion(base, 'cuartil', 4).clase, tabla.k);
  assert.equal(medidaDePosicion(base, 'decil', 10).clase, tabla.k);
  assert.equal(medidaDePosicion(base, 'percentil', 100).clase, tabla.k);
  // No entero
  assert.equal(medidaDePosicion(base, 'cuartil', 1.5), null);
  assert.equal(medidaDePosicion(base, 'percentil', 90.5), null);
  // Tipos inexistentes y entradas degeneradas
  assert.equal(medidaDePosicion(base, 'tercil', 2), null);
  assert.equal(medidaDePosicion(null, 'cuartil', 1), null);
  assert.equal(medidaDePosicion({ filas: [], n: 5, amplitud: 1 }, 'cuartil', 1), null);
});

test('medidas de posicion: el rango de k que expone el motor es el del curso', () => {
  assert.equal(TIPOS_POSICION.cuartil.min, 1);
  assert.equal(TIPOS_POSICION.cuartil.max, 4);
  assert.equal(TIPOS_POSICION.cuartil.divisor, 4);
  assert.equal(TIPOS_POSICION.decil.min, 1);
  assert.equal(TIPOS_POSICION.decil.max, 10);
  assert.equal(TIPOS_POSICION.decil.divisor, 10);
  assert.equal(TIPOS_POSICION.percentil.min, 1);
  assert.equal(TIPOS_POSICION.percentil.max, 100);
  assert.equal(TIPOS_POSICION.percentil.divisor, 100);
  // Los atajos que ofrece la UI caen siempre dentro del rango
  for (const tipo of ['cuartil', 'decil', 'percentil']) {
    const { min, max, atajo } = TIPOS_POSICION[tipo];
    assert.ok(atajo.length > 0, `${tipo} debe ofrecer atajos`);
    atajo.forEach((k) => assert.ok(k >= min && k <= max, `atajo ${tipo} ${k} fuera de rango`));
  }
});

test('medidas de posicion: los valores crecen con k y quedan dentro de su intervalo', () => {
  const datos = [10, 20, 30, 40, 50, 50, 50, 60, 70, 80, 90];
  const tabla = construirFrecuencias(datos);
  const base = { filas: tabla.filas, n: tabla.n, amplitud: tabla.amplitud };

  let anterior = -Infinity;
  for (let k = 1; k <= 100; k++) {
    const r = medidaDePosicion(base, 'percentil', k);
    assert.ok(r.valor >= anterior, `P${k} = ${r.valor} no crece sobre P${k - 1} = ${anterior}`);
    anterior = r.valor;

    // El invariante que si vale: el valor cae dentro de los limites reales del intervalo
    // que la propia medida declara. Ojo: NO se exige que quede dentro del rango de los
    // datos crudos, porque la ultima clase cubre valores que ningun dato ocupa
    // (con esta tabla, is = 94 mientras que Xmax = 90) y ahi es normal que la
    // interpolacion se pase del maximo observado.
    assert.ok(
      r.valor >= r.limiteInferiorReal - 0.001 && r.valor <= r.limiteSuperiorReal + 0.001,
      `P${k} = ${r.valor} fuera de [${r.limiteInferiorReal}, ${r.limiteSuperiorReal}]`
    );
    assert.ok(r.valor <= r.limiteInferiorReal + tabla.amplitud + 0.001, `P${k} se pasa de Li + A`);
  }
});

test('medidas de posicion: los extremos casi siempre caen en la primera y ultima clase', () => {
  const datos = [10, 20, 30, 40, 50, 50, 50, 60, 70, 80, 90];
  const tabla = construirFrecuencias(datos);
  const base = { filas: tabla.filas, n: tabla.n, amplitud: tabla.amplitud };

  assert.equal(medidaDePosicion(base, 'percentil', 1).clase, 1, 'P1 en la primera clase');
  assert.equal(medidaDePosicion(base, 'percentil', 99).clase, tabla.k, 'P99 en la ultima clase');
  assert.equal(medidaDePosicion(base, 'percentil', 100).clase, tabla.k, 'P100 en la ultima clase');
});
