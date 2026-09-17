const express = require('express');
const router = express.Router();
const { db } = require('../db');

// Calcula estadisticos basicos a partir de un array numerico
function calcularEstadisticos(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const n = ordenados.length;
  const xMin = ordenados[0];
  const xMax = ordenados[n - 1];
  const rango = xMax - xMin;
  return { n, xMin, xMax, rango };
}

// GET /api/lotes -> listar todos los lotes (metadatos)
router.get('/', (req, res) => {
  db.all(
    'SELECT id, nombre, descripcion, cantidad, creado_en FROM lotes_datos ORDER BY id DESC',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// GET /api/lotes/:id -> obtener un lote con sus datos crudos + estadisticos basicos
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM lotes_datos WHERE id = ?', [req.params.id], (err, lote) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

    db.all('SELECT valor FROM datos WHERE lote_id = ? ORDER BY id', [req.params.id], (err2, filas) => {
      if (err2) return res.status(500).json({ error: err2.message });

      const valores = filas.map((f) => f.valor);

      // Consultar estadisticos ya almacenados
      db.get(
        'SELECT * FROM estadisticos_basicos WHERE lote_id = ?',
        [req.params.id],
        (err3, stats) => {
          if (err3) return res.status(500).json({ error: err3.message });

          res.json({
            ...lote,
            datos: valores,
            estadisticos: stats || null,
          });
        }
      );
    });
  });
});

// GET /api/lotes/:id/stats -> obtener solo los estadisticos de un lote
router.get('/:id/stats', (req, res) => {
  db.get(
    'SELECT * FROM estadisticos_basicos WHERE lote_id = ?',
    [req.params.id],
    (err, stats) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!stats) return res.status(404).json({ error: 'Estadisticos no encontrados para este lote' });
      res.json(stats);
    }
  );
});

// POST /api/lotes -> recibir datos, calcular y almacenar estadisticos basicos
router.post('/', (req, res) => {
  const { nombre, descripcion, datos } = req.body;

  if (!nombre || !Array.isArray(datos) || datos.length === 0) {
    return res.status(400).json({
      error: 'El campo "nombre" es obligatorio y "datos" debe ser un arreglo no vacio de numeros',
    });
  }

  const valores = datos.map(Number);
  if (valores.some((v) => Number.isNaN(v))) {
    return res.status(400).json({ error: 'Todos los elementos de "datos" deben ser numericos' });
  }

  const stats = calcularEstadisticos(valores);

  const insertLote = 'INSERT INTO lotes_datos (nombre, descripcion, cantidad) VALUES (?, ?, ?)';
  db.run(insertLote, [nombre, descripcion || null, valores.length], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    const loteId = this.lastID;

    // Insertar datos crudos
    const insertDato = 'INSERT INTO datos (lote_id, valor) VALUES (?, ?)';
    const stmt = db.prepare(insertDato);
    valores.forEach((valor) => stmt.run(loteId, valor));
    stmt.finalize((err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // Insertar estadisticos basicos calculados
      const insertStats =
        'INSERT INTO estadisticos_basicos (lote_id, n, x_min, x_max, rango) VALUES (?, ?, ?, ?, ?)';
      db.run(insertStats, [loteId, stats.n, stats.xMin, stats.xMax, stats.rango], (err3) => {
        if (err3) return res.status(500).json({ error: err3.message });

        res.status(201).json({
          id: loteId,
          nombre,
          descripcion: descripcion || null,
          cantidad: valores.length,
          estadisticos: stats,
        });
      });
    });
  });
});

module.exports = router;