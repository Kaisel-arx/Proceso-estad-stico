const { MINIMO_DATOS } = require('./stats/frecuencias');

// Estadisticos basicos de un arreglo numerico ya validado
function calcularEstadisticos(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const n = ordenados.length;
  if (n === 0) return null;
  const xMin = ordenados[0];
  const xMax = ordenados[n - 1];
  const rango = xMax - xMin;
  return { n, xMin, xMax, rango };
}

/**
 * Valida el cuerpo del POST /api/lotes.
 * Devuelve { valores, nombre, descripcion } si todo es correcto,
 * o { error, rechazados } describiendo el problema.
 * Vive aparte de las rutas para poder probarse sin abrir la base de datos.
 */
function validarLote(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return { error: 'El cuerpo de la peticion debe ser un objeto JSON' };
  }

  const { nombre, descripcion, datos } = cuerpo;

  if (typeof nombre !== 'string' || nombre.trim() === '') {
    return { error: 'El campo "nombre" es obligatorio' };
  }

  if (!Array.isArray(datos)) {
    return { error: 'El campo "datos" debe ser un arreglo de numeros' };
  }

  if (datos.length < MINIMO_DATOS) {
    return {
      error: `Se requieren al menos ${MINIMO_DATOS} valores para calcular la distribucion, se recibieron ${datos.length}`,
    };
  }

  if (descripcion !== undefined && descripcion !== null && typeof descripcion !== 'string') {
    return { error: 'El campo "descripcion" debe ser texto' };
  }

  const rechazados = [];
  const valores = [];

  datos.forEach((crudo, indice) => {
    // Number(null), Number('') y Number(true) dan valores numericos: hay que descartarlos antes
    const vacio =
      crudo === null ||
      crudo === undefined ||
      typeof crudo === 'boolean' ||
      (typeof crudo === 'string' && crudo.trim() === '');

    const numero = vacio ? NaN : Number(crudo);

    if (!Number.isFinite(numero)) {
      rechazados.push({ indice, valor: crudo });
      return;
    }
    valores.push(numero);
  });

  if (rechazados.length > 0) {
    return {
      error: `Elementos no numericos en "datos" en la(s) posicion(es) ${rechazados
        .map((r) => r.indice)
        .join(', ')}`,
      rechazados,
    };
  }

  return { valores, nombre: nombre.trim(), descripcion: descripcion || null };
}

module.exports = { validarLote, calcularEstadisticos, MINIMO_DATOS };
