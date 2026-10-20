const test = require('node:test');
const assert = require('node:assert/strict');

const { validarLote, calcularEstadisticos } = require('../src/validacion');

test('validarLote: rechaza cuerpos que no son objeto', () => {
  assert.match(validarLote(null).error, /objeto JSON/);
  assert.match(validarLote(undefined).error, /objeto JSON/);
  assert.match(validarLote('texto').error, /objeto JSON/);
  assert.match(validarLote([1, 2, 3]).error, /objeto JSON/);
});

test('validarLote: nombre es obligatorio y no puede ir vacio', () => {
  assert.match(validarLote({ datos: [1, 2] }).error, /"nombre" es obligatorio/);
  assert.match(validarLote({ nombre: '   ', datos: [1, 2] }).error, /"nombre" es obligatorio/);
  assert.match(validarLote({ nombre: 123, datos: [1, 2] }).error, /"nombre" es obligatorio/);
});

test('validarLote: datos debe ser un arreglo', () => {
  assert.match(validarLote({ nombre: 'x' }).error, /arreglo de numeros/);
  assert.match(validarLote({ nombre: 'x', datos: '1,2,3' }).error, /arreglo de numeros/);
  assert.match(validarLote({ nombre: 'x', datos: null }).error, /arreglo de numeros/);
  assert.match(validarLote({ nombre: 'x', datos: 42 }).error, /arreglo de numeros/);
});

test('validarLote: exige el minimo de elementos', () => {
  assert.match(validarLote({ nombre: 'x', datos: [] }).error, /al menos 2 valores/);
  assert.match(validarLote({ nombre: 'x', datos: [5] }).error, /al menos 2 valores/);
  assert.equal(validarLote({ nombre: 'x', datos: [5, 6] }).error, undefined);
});

test('validarLote: rechaza letras y valores no numericos, indicando la posicion', () => {
  const r = validarLote({ nombre: 'x', datos: [10, 'abc', 30, 'def'] });
  assert.match(r.error, /posicion\(es\) 1, 3/);
  assert.deepEqual(r.rechazados, [
    { indice: 1, valor: 'abc' },
    { indice: 3, valor: 'def' },
  ]);
});

test('validarLote: no acepta NaN, Infinity ni null como 0', () => {
  // Number(null) es 0 y Number('') es 0: estos casos deben rechazarse, no colarse como cero
  assert.match(validarLote({ nombre: 'x', datos: [10, null, 30] }).error, /posicion\(es\) 1/);
  assert.match(validarLote({ nombre: 'x', datos: [10, '', 30] }).error, /posicion\(es\) 1/);
  assert.match(validarLote({ nombre: 'x', datos: [10, true, 30] }).error, /posicion\(es\) 1/);
  assert.match(validarLote({ nombre: 'x', datos: [10, 'Infinity', 30] }).error, /posicion\(es\) 1/);
});

test('validarLote: acepta negativos, decimales y notacion numerica', () => {
  const r = validarLote({ nombre: 'x', datos: [-5, 3.75, '12', 0] });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.valores, [-5, 3.75, 12, 0]);
});

test('validarLote: normaliza nombre y descripcion', () => {
  const r = validarLote({ nombre: '  Lote A  ', datos: [1, 2], descripcion: 'nota' });
  assert.equal(r.nombre, 'Lote A');
  assert.equal(r.descripcion, 'nota');
  assert.equal(validarLote({ nombre: 'x', datos: [1, 2] }).descripcion, null);
  assert.match(validarLote({ nombre: 'x', datos: [1, 2], descripcion: 9 }).error, /"descripcion" debe ser texto/);
});

test('validarLote: si la mayoria es invalida, reporta las posiciones en vez de contar validos', () => {
  const r = validarLote({ nombre: 'x', datos: ['a', 'b', 3] });
  assert.match(r.error, /posicion\(es\) 0, 1/);
  assert.equal(r.rechazados.length, 2);
  assert.equal(r.valores, undefined, 'un lote con elementos invalidos no debe devolver valores parciales');
});

test('validarLote: nunca devuelve un lote partially validado', () => {
  // El error de elementos no numericos tiene prioridad sobre cualquier conteo
  for (const datos of [[10, 'x'], ['a', 'b'], [1, 2, 'z', 4]]) {
    const r = validarLote({ nombre: 'x', datos });
    assert.ok(r.error, `debio fallar con ${JSON.stringify(datos)}`);
    assert.equal(r.valores, undefined);
  }
});

test('calcularEstadisticos: devuelve n, extremos y rango', () => {
  assert.deepEqual(calcularEstadisticos([30, 10, 20]), { n: 3, xMin: 10, xMax: 30, rango: 20 });
  assert.equal(calcularEstadisticos([]), null);
});
