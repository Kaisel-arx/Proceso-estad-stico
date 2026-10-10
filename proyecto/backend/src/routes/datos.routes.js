const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { construirFrecuencias } = require('../stats/frecuencias');
const { validarLote, calcularEstadisticos } = require('../validacion');

// Persiste en SQLite las filas de la tabla de frecuencias, incluidas las columnas de apoyo
function insertarFrecuencias(loteId, filas, done) {
  const insert = `
    INSERT INTO tabla_frecuencias
      (lote_id, clase, limite_inferior, limite_superior,
       limite_inferior_real, limite_superior_real, marca_clase,
       frecuencia, acumulada, relativa, porcentaje, suavizada,
       producto, relativa_producto, desviacion, desviacion_ponderada)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const stmt = db.prepare(insert);
  filas.forEach((f) =>
    stmt.run(
      loteId,
      f.clase,
      f.limiteInferior,
      f.limiteSuperior,
      f.limiteInferiorReal,
      f.limiteSuperiorReal,
      f.marcaClase,
      f.frecuencia,
      f.acumulada,
      f.relativa,
      f.porcentaje,
      f.suavizada,
      f.producto,
      f.relativaProducto,
      f.desviacion,
      f.desviacionPonderada
    )
  );
  stmt.finalize(done);
}

// Persiste las medidas de posicion y de variabilidad
function insertarEstadisticosAvanzados(loteId, tabla, done) {
  const insert = `
    INSERT INTO estadisticos_avanzados
      (lote_id, media, media_ponderada, posicion_mediana, moda,
       suma_producto, suma_desviacion_ponderada,
       varianza_poblacional, desviacion_poblacional, coeficiente_variacion,
       varianza_muestral, desviacion_muestral,
       q1, mediana, q3, p17)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const stmt = db.prepare(insert);
  stmt.run(
    loteId,
    tabla.media,
    tabla.mediaPonderada,
    tabla.posicionMediana,
    tabla.moda,
    tabla.sumaProducto,
    tabla.sumaDesviacionPonderada,
    tabla.varianzaPoblacional,
    tabla.desviacionPoblacional,
    tabla.coeficienteVariacion,
    tabla.varianzaMuestral,
    tabla.desviacionMuestral,
    tabla.q1,
    tabla.mediana,
    tabla.q3,
    tabla.p17
  );
  stmt.finalize(done);
}

// db.all devuelve un arreglo de filas; estos endpoints entregan un unico objeto por lote
// y con los mismos nombres en camelCase que usa el calculo en memoria, para que el
// frontend lea igual un lote recien creado y uno releido de la base.
function primerRegistro(filas) {
  return filas && filas.length > 0 ? filas[0] : null;
}

// Tablas hijas que cuelgan de un lote, en el orden en que se borran.
const TABLAS_HIJAS = ['datos', 'estadisticos_basicos', 'tabla_frecuencias', 'estadisticos_avanzados'];

// Calcula y persiste estadisticos basicos, avanzados y tabla de frecuencias de un lote
// ya creado. Compartido entre POST y PUT para que guardar un lote nuevo y actualizar uno
// existente pasen exactamente por el mismo calculo.
function guardarResultados(loteId, valores, callback) {
  const stats = calcularEstadisticos(valores);
  const frecuencias = construirFrecuencias(valores);

  if (!stats || !frecuencias) {
    return callback(new Error('No fue posible calcular la distribucion con los datos recibidos'));
  }

  db.run(
    'INSERT INTO estadisticos_basicos (lote_id, n, x_min, x_max, rango) VALUES (?, ?, ?, ?, ?)',
    [loteId, stats.n, stats.xMin, stats.xMax, stats.rango],
    (err1) => {
      if (err1) return callback(err1);

      insertarEstadisticosAvanzados(loteId, frecuencias, (err2) => {
        if (err2) return callback(err2);

        insertarFrecuencias(loteId, frecuencias.filas, (err3) => {
          if (err3) return callback(err3);
          callback(null, { stats, frecuencias });
        });
      });
    }
  );
}

// Borra en cascada las tablas hijas dentro de una transaccion ya abierta.
function borrarResultados(loteId, indice, callback) {
  if (indice >= TABLAS_HIJAS.length) return callback(null);
  db.run(`DELETE FROM ${TABLAS_HIJAS[indice]} WHERE lote_id = ?`, [loteId], (err) => {
    if (err) return callback(err);
    borrarResultados(loteId, indice + 1, callback);
  });
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
router.get('/', (req, res) => {
  db.all(
    `SELECT id, nombre, descripcion, cantidad, creado_en
       FROM lotes_datos
      WHERE usuario_id = ?
      ORDER BY id DESC`,
    [req.usuario.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// GET /api/lotes/:id -> obtener un lote con sus datos crudos + estadisticos + tabla de frecuencias
// El filtro por duenio va en la propia consulta: un lote ajeno responde 404, igual que uno
// inexistente, para que la API no delate que ese id existe en otra cuenta.
router.get('/:id', (req, res) => {
  db.get(
    'SELECT * FROM lotes_datos WHERE id = ? AND usuario_id = ?',
    [req.params.id, req.usuario.id],
    (err, lote) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

    db.all('SELECT valor FROM datos WHERE lote_id = ? ORDER BY id', [req.params.id], (err2, filas) => {
      if (err2) return res.status(500).json({ error: err2.message });

      const valores = filas.map((f) => f.valor);
      if (valores.length === 0) {
        return res.json({ ...lote, datos: [], estadisticos: null, frecuencias: null, estadisticosAvanzados: null });
      }

      db.all('SELECT * FROM estadisticos_basicos WHERE lote_id = ?', [req.params.id], (err3, stats) => {
        if (err3) return res.status(500).json({ error: err3.message });
        db.all('SELECT * FROM estadisticos_avanzados WHERE lote_id = ?', [req.params.id], (err4, avanzados) => {
          if (err4) return res.status(500).json({ error: err4.message });

          res.json({
            ...lote,
            datos: valores,
            estadisticos: estadisticosBasicosEnCampos(primerRegistro(stats)),
            estadisticosAvanzados: estadisticosAvanzadosEnCampos(primerRegistro(avanzados)),
            frecuencias: construirFrecuencias(valores),
          });
        });
      });
    });
  });
});

// GET /api/lotes/:id/stats -> obtener solo los estadisticos de un lote
router.get('/:id/stats', (req, res) => {
  db.all(SELECT_ESTADISTICOS, [req.usuario.id, req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const fila = primerRegistro(rows);
    if (!fila) {
      return res.status(404).json({ error: 'Estadisticos no encontrados para este lote' });
    }
    res.json({
      ...estadisticosBasicosEnCampos(fila),
      ...estadisticosAvanzadosEnCampos(fila),
    });
  });
});

// GET /api/lotes/:id/frecuencias -> obtener solo la tabla de frecuencias
router.get('/:id/frecuencias', (req, res) => {
  db.get(
    'SELECT id FROM lotes_datos WHERE id = ? AND usuario_id = ?',
    [req.params.id, req.usuario.id],
    (errDuenio, lote) => {
      if (errDuenio) return res.status(500).json({ error: errDuenio.message });
      if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

      db.all('SELECT valor FROM datos WHERE lote_id = ? ORDER BY id', [req.params.id], (err, filas) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!filas || filas.length === 0) {
          return res.status(404).json({ error: 'Lote sin datos para calcular frecuencias' });
        }
        const tabla = construirFrecuencias(filas.map((f) => f.valor));
        res.json(tabla);
      });
    }
  );
});

// POST /api/lotes -> recibir datos, validar, calcular y almacenar a nombre del usuario
router.post('/', (req, res) => {
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

  db.run(
    'INSERT INTO lotes_datos (nombre, descripcion, cantidad, usuario_id) VALUES (?, ?, ?, ?)',
    [nombre, descripcion, valores.length, req.usuario.id],
    function (err) {
    if (err) return res.status(500).json({ error: err.message });

    const loteId = this.lastID;

    const insertDato = 'INSERT INTO datos (lote_id, valor) VALUES (?, ?)';
    const stmt = db.prepare(insertDato);
    valores.forEach((valor) => stmt.run(loteId, valor));

    stmt.finalize((err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      guardarResultados(loteId, valores, (err3, resultados) => {
        if (err3) return res.status(500).json({ error: err3.message });

        res.status(201).json({
          id: loteId,
          nombre,
          descripcion,
          cantidad: valores.length,
          estadisticos: resultados.stats,
          frecuencias: resultados.frecuencias,
        });
      });
    });
  });
});

// PUT /api/lotes/:id -> reemplaza nombre, descripcion y datos de un lote propio y
// recalcula todos los resultados. Es lo que usa el frontend al volver a guardar un
// trabajo abierto desde el historial, para que no se duplique en la lista.
router.put('/:id', (req, res) => {
  const loteId = req.params.id;

  db.get(
    'SELECT id FROM lotes_datos WHERE id = ? AND usuario_id = ?',
    [loteId, req.usuario.id],
    (err, lote) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

      const validacion = validarLote(req.body);
      if (validacion.error) {
        return res.status(400).json({ error: validacion.error, rechazados: validacion.rechazados });
      }

      const { nombre, descripcion, valores } = validacion;

      db.run('BEGIN TRANSACTION', (err1) => {
        if (err1) return res.status(500).json({ error: err1.message });

        const fallo = (e) => db.run('ROLLBACK', () => res.status(500).json({ error: e.message }));

        borrarResultados(loteId, 0, (err2) => {
          if (err2) return fallo(err2);

          db.run(
            'UPDATE lotes_datos SET nombre = ?, descripcion = ?, cantidad = ? WHERE id = ?',
            [nombre, descripcion, valores.length, loteId],
            (err3) => {
              if (err3) return fallo(err3);

              const stmt = db.prepare('INSERT INTO datos (lote_id, valor) VALUES (?, ?)');
              valores.forEach((valor) => stmt.run(loteId, valor));

              stmt.finalize((err4) => {
                if (err4) return fallo(err4);

                guardarResultados(loteId, valores, (err5, resultados) => {
                  if (err5) return fallo(err5);

                  db.run('COMMIT', (err6) => {
                    if (err6) return fallo(err6);
                    res.json({
                      id: Number(loteId),
                      nombre,
                      descripcion,
                      cantidad: valores.length,
                      estadisticos: resultados.stats,
                      frecuencias: resultados.frecuencias,
                    });
                  });
                });
              });
            }
          );
        });
      });
    }
  );
});

// DELETE /api/lotes/:id -> eliminar el lote y todo lo que cuelga de el.
// Las cuatro tablas hijas tienen ON DELETE CASCADE, pero se borran de forma explicita
// dentro de una transaccion para que el borrado sea atomico y no dependa del PRAGMA.
router.delete('/:id', (req, res) => {
  const loteId = req.params.id;

  db.get(
    'SELECT id FROM lotes_datos WHERE id = ? AND usuario_id = ?',
    [loteId, req.usuario.id],
    (err, lote) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

      db.run('BEGIN TRANSACTION', (err1) => {
        if (err1) return res.status(500).json({ error: err1.message });

        borrarResultados(loteId, 0, (err2) => {
          if (err2) {
            return db.run('ROLLBACK', () => res.status(500).json({ error: err2.message }));
          }
          db.run('DELETE FROM lotes_datos WHERE id = ?', [loteId], (err3) => {
            if (err3) {
              return db.run('ROLLBACK', () => res.status(500).json({ error: err3.message }));
            }
            db.run('COMMIT', (err4) => {
              if (err4) return res.status(500).json({ error: err4.message });
              res.json({ mensaje: `Lote ${loteId} eliminado`, id: Number(loteId) });
            });
          });
        });
      });
    }
  );
});

module.exports = router;
