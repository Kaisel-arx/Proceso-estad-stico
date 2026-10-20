const express = require('express');
const router = express.Router();
const { consultar, obtener, ejecutar, transaccion } = require('../db');
const { construirFrecuencias } = require('../stats/frecuencias');
const { validarLote, calcularEstadisticos } = require('../validacion');

// Envuelve handlers async: Express 4 no captura las promesas rechazadas y sin esto un
// error inesperado dejaria la peticion colgada en vez de responder con 500.
const envolver = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// Inserts en masa con `VALUES ?` de mysql2: un solo envio para todo el lote en vez de
// un statement por fila como hacia el driver de SQLite.
async function insertarDatos(conn, loteId, valores) {
  await ejecutar(
    'INSERT INTO datos (lote_id, valor) VALUES ?',
    [valores.map((valor) => [loteId, valor])],
    conn
  );
}

// Persiste en MySQL las filas de la tabla de frecuencias, incluidas las columnas de apoyo
async function insertarFrecuencias(conn, loteId, filas) {
  if (filas.length === 0) return;

  await ejecutar(
    `INSERT INTO tabla_frecuencias
       (lote_id, clase, limite_inferior, limite_superior,
        limite_inferior_real, limite_superior_real, marca_clase,
        frecuencia, acumulada, relativa, porcentaje, suavizada,
        producto, relativa_producto, desviacion, desviacion_ponderada)
     VALUES ?`,
    [
      filas.map((f) => [
        loteId,
        f.clase,
        f.limiteInferior,
        f.limiteSuperior,
        f.limiteInferiorReal ?? null,
        f.limiteSuperiorReal ?? null,
        f.marcaClase,
        f.frecuencia,
        f.acumulada,
        f.relativa,
        f.porcentaje,
        f.suavizada ?? null,
        f.producto ?? null,
        f.relativaProducto ?? null,
        f.desviacion ?? null,
        f.desviacionPonderada ?? null,
      ]),
    ],
    conn
  );
}

// Persiste las medidas de posicion y de variabilidad
async function insertarEstadisticosAvanzados(conn, loteId, tabla) {
  await ejecutar(
    `INSERT INTO estadisticos_avanzados
       (lote_id, media, media_ponderada, posicion_mediana, moda,
        suma_producto, suma_desviacion_ponderada,
        varianza_poblacional, desviacion_poblacional, coeficiente_variacion,
        varianza_muestral, desviacion_muestral,
        q1, mediana, q3, p17)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      loteId,
      tabla.media,
      tabla.mediaPonderada ?? null,
      tabla.posicionMediana ?? null,
      tabla.moda ?? null,
      tabla.sumaProducto,
      tabla.sumaDesviacionPonderada,
      tabla.varianzaPoblacional,
      tabla.desviacionPoblacional,
      tabla.coeficienteVariacion ?? null,
      tabla.varianzaMuestral,
      tabla.desviacionMuestral,
      tabla.q1 ?? null,
      tabla.mediana ?? null,
      tabla.q3 ?? null,
      tabla.p17 ?? null,
    ],
    conn
  );
}

// Tablas hijas que cuelgan de un lote, en el orden en que se borran.
const TABLAS_HIJAS = ['datos', 'estadisticos_basicos', 'tabla_frecuencias', 'estadisticos_avanzados'];

// Borra en cascada las tablas hijas dentro de la transaccion abierta. El ON DELETE CASCADE
// de InnoDB ya lo haria solo, pero se borra de forma explicita para no depender de ella.
async function borrarResultados(conn, loteId) {
  for (const tabla of TABLAS_HIJAS) {
    await ejecutar(`DELETE FROM ${tabla} WHERE lote_id = ?`, [loteId], conn);
  }
}

// Calcula y persiste estadisticos basicos, avanzados y tabla de frecuencias de un lote
// ya creado. Compartido entre POST y PUT para que guardar un lote nuevo y actualizar uno
// existente pasen exactamente por el mismo calculo, siempre dentro de la transaccion.
async function guardarResultados(conn, loteId, stats, frecuencias) {
  await ejecutar(
    'INSERT INTO estadisticos_basicos (lote_id, n, x_min, x_max, rango) VALUES (?, ?, ?, ?, ?)',
    [loteId, stats.n, stats.xMin, stats.xMax, stats.rango],
    conn
  );
  await insertarEstadisticosAvanzados(conn, loteId, frecuencias);
  await insertarFrecuencias(conn, loteId, frecuencias.filas);
}

function estadisticosBasicosEnCampos(fila) {
  if (!fila) return null;
  const { n, x_min: xMin, x_max: xMax, rango } = fila;
  return { n, xMin, xMax, rango };
}

function estadisticosAvanzadosEnCampos(fila) {
  if (!fila) return null;
  const {
    media,
    media_ponderada: mediaPonderada,
    posicion_mediana: posicionMediana,
    moda,
    suma_producto: sumaProducto,
    suma_desviacion_ponderada: sumaDesviacionPonderada,
    varianza_poblacional: varianzaPoblacional,
    desviacion_poblacional: desviacionPoblacional,
    coeficiente_variacion: coeficienteVariacion,
    varianza_muestral: varianzaMuestral,
    desviacion_muestral: desviacionMuestral,
    q1,
    mediana,
    q3,
    p17,
  } = fila;
  return {
    media,
    mediaPonderada,
    posicionMediana,
    moda,
    sumaProducto,
    sumaDesviacionPonderada,
    varianzaPoblacional,
    desviacionPoblacional,
    coeficienteVariacion,
    varianzaMuestral,
    desviacionMuestral,
    q1,
    mediana,
    q3,
    p17,
  };
}

// Columnas de estadisticos_basicos + estadisticos_avanzados, en una sola lectura.
// El JOIN con lotes_datos es el que aplica el filtro de duenio: sin el, cualquier
// usuario autenticado podria leer estadisticos de un lote ajeno por id.
const SELECT_ESTADISTICOS = `
  SELECT s.*, a.media, a.media_ponderada, a.posicion_mediana, a.moda,
         a.suma_producto, a.suma_desviacion_ponderada,
         a.varianza_poblacional, a.desviacion_poblacional, a.coeficiente_variacion,
         a.varianza_muestral, a.desviacion_muestral,
         a.q1, a.mediana, a.q3, a.p17
  FROM estadisticos_basicos s
  JOIN lotes_datos l ON l.id = s.lote_id AND l.usuario_id = ?
  LEFT JOIN estadisticos_avanzados a ON a.lote_id = s.lote_id
  WHERE s.lote_id = ?
`;

// GET /api/lotes -> historial propio: solo los lotes del usuario autenticado
router.get(
  '/',
  envolver(async (req, res) => {
    const rows = await consultar(
      `SELECT id, nombre, descripcion, cantidad, creado_en
         FROM lotes_datos
        WHERE usuario_id = ?
        ORDER BY id DESC`,
      [req.usuario.id]
    );
    res.json(rows);
  })
);

// GET /api/lotes/:id -> obtener un lote con sus datos crudos + estadisticos + tabla de frecuencias
// El filtro por duenio va en la propia consulta: un lote ajeno responde 404, igual que uno
// inexistente, para que la API no delate que ese id existe en otra cuenta.
router.get(
  '/:id',
  envolver(async (req, res) => {
    const lote = await obtener('SELECT * FROM lotes_datos WHERE id = ? AND usuario_id = ?', [
      req.params.id,
      req.usuario.id,
    ]);
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

    const filas = await consultar('SELECT valor FROM datos WHERE lote_id = ? ORDER BY id', [req.params.id]);
    const valores = filas.map((f) => f.valor);
    if (valores.length === 0) {
      return res.json({ ...lote, datos: [], estadisticos: null, frecuencias: null, estadisticosAvanzados: null });
    }

    const [stats, avanzados] = await Promise.all([
      obtener('SELECT * FROM estadisticos_basicos WHERE lote_id = ?', [req.params.id]),
      obtener('SELECT * FROM estadisticos_avanzados WHERE lote_id = ?', [req.params.id]),
    ]);

    res.json({
      ...lote,
      datos: valores,
      estadisticos: estadisticosBasicosEnCampos(stats),
      estadisticosAvanzados: estadisticosAvanzadosEnCampos(avanzados),
      frecuencias: construirFrecuencias(valores),
    });
  })
);

// GET /api/lotes/:id/stats -> obtener solo los estadisticos de un lote
router.get(
  '/:id/stats',
  envolver(async (req, res) => {
    const fila = await obtener(SELECT_ESTADISTICOS, [req.usuario.id, req.params.id]);
    if (!fila) {
      return res.status(404).json({ error: 'Estadisticos no encontrados para este lote' });
    }
    res.json({
      ...estadisticosBasicosEnCampos(fila),
      ...estadisticosAvanzadosEnCampos(fila),
    });
  })
);

// GET /api/lotes/:id/frecuencias -> obtener solo la tabla de frecuencias
router.get(
  '/:id/frecuencias',
  envolver(async (req, res) => {
    const lote = await obtener('SELECT id FROM lotes_datos WHERE id = ? AND usuario_id = ?', [
      req.params.id,
      req.usuario.id,
    ]);
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

    const filas = await consultar('SELECT valor FROM datos WHERE lote_id = ? ORDER BY id', [req.params.id]);
    if (filas.length === 0) {
      return res.status(404).json({ error: 'Lote sin datos para calcular frecuencias' });
    }
    const tabla = construirFrecuencias(filas.map((f) => f.valor));
    res.json(tabla);
  })
);

// POST /api/lotes -> recibir datos, validar, calcular y almacenar a nombre del usuario
router.post(
  '/',
  envolver(async (req, res) => {
    const validacion = validarLote(req.body);

    if (validacion.error) {
      return res.status(400).json({ error: validacion.error, rechazados: validacion.rechazados });
    }

    const { nombre, descripcion, valores } = validacion;

    const stats = calcularEstadisticos(valores);
    const frecuencias = construirFrecuencias(valores);

    if (!stats || !frecuencias) {
      return res.status(400).json({ error: 'No fue posible calcular la distribucion con los datos recibidos' });
    }

    // Todo el lote (cabecera, datos crudos y resultados) entra y sale en una sola
    // transaccion: o se persiste completo o no se persiste nada.
    const id = await transaccion(async (conn) => {
      const creado = await ejecutar(
        'INSERT INTO lotes_datos (nombre, descripcion, cantidad, usuario_id) VALUES (?, ?, ?, ?)',
        [nombre, descripcion, valores.length, req.usuario.id],
        conn
      );
      const loteId = creado.insertId;

      await insertarDatos(conn, loteId, valores);
      await guardarResultados(conn, loteId, stats, frecuencias);

      return loteId;
    });

    res.status(201).json({
      id,
      nombre,
      descripcion,
      cantidad: valores.length,
      estadisticos: stats,
      frecuencias,
    });
  })
);

// PUT /api/lotes/:id -> reemplaza nombre, descripcion y datos de un lote propio y
// recalcula todos los resultados. Es lo que usa el frontend al volver a guardar un
// trabajo abierto desde el historial, para que no se duplique en la lista.
router.put(
  '/:id',
  envolver(async (req, res) => {
    const loteId = req.params.id;

    const lote = await obtener('SELECT id FROM lotes_datos WHERE id = ? AND usuario_id = ?', [
      loteId,
      req.usuario.id,
    ]);
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

    const validacion = validarLote(req.body);
    if (validacion.error) {
      return res.status(400).json({ error: validacion.error, rechazados: validacion.rechazados });
    }

    const { nombre, descripcion, valores } = validacion;

    const stats = calcularEstadisticos(valores);
    const frecuencias = construirFrecuencias(valores);
    if (!stats || !frecuencias) {
      return res.status(400).json({ error: 'No fue posible calcular la distribucion con los datos recibidos' });
    }

    await transaccion(async (conn) => {
      await borrarResultados(conn, loteId);
      await ejecutar(
        'UPDATE lotes_datos SET nombre = ?, descripcion = ?, cantidad = ? WHERE id = ?',
        [nombre, descripcion, valores.length, loteId],
        conn
      );
      await insertarDatos(conn, loteId, valores);
      await guardarResultados(conn, loteId, stats, frecuencias);
    });

    res.json({
      id: Number(loteId),
      nombre,
      descripcion,
      cantidad: valores.length,
      estadisticos: stats,
      frecuencias,
    });
  })
);

// DELETE /api/lotes/:id -> eliminar el lote y todo lo que cuelga de el.
router.delete(
  '/:id',
  envolver(async (req, res) => {
    const loteId = req.params.id;

    const lote = await obtener('SELECT id FROM lotes_datos WHERE id = ? AND usuario_id = ?', [
      loteId,
      req.usuario.id,
    ]);
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

    await transaccion(async (conn) => {
      await borrarResultados(conn, loteId);
      await ejecutar('DELETE FROM lotes_datos WHERE id = ?', [loteId], conn);
    });

    res.json({ mensaje: `Lote ${loteId} eliminado`, id: Number(loteId) });
  })
);

module.exports = router;
