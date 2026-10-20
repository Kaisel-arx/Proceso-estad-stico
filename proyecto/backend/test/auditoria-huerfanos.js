// Auditoria de integridad: lista lotes, conteos por tabla y filas huerfanas
// (hijas sin padre) para verificar el estado de la base MySQL.
const { initDb, consultar, cerrar } = require('../src/db');

const consultas = [
  ['huerfanos estadisticos_basicos', 'SELECT lote_id FROM estadisticos_basicos WHERE lote_id NOT IN (SELECT id FROM lotes_datos)'],
  ['huerfanos estadisticos_avanzados', 'SELECT lote_id FROM estadisticos_avanzados WHERE lote_id NOT IN (SELECT id FROM lotes_datos)'],
  ['huerfanos tabla_frecuencias', 'SELECT lote_id FROM tabla_frecuencias WHERE lote_id NOT IN (SELECT id FROM lotes_datos) GROUP BY lote_id'],
  ['huerfanos datos', 'SELECT lote_id FROM datos WHERE lote_id NOT IN (SELECT id FROM lotes_datos) GROUP BY lote_id'],
  ['lotes', 'SELECT id, nombre, cantidad FROM lotes_datos ORDER BY id'],
  ['datos por lote', 'SELECT lote_id, COUNT(*) AS c FROM datos GROUP BY lote_id'],
  ['stats por lote', 'SELECT lote_id, COUNT(*) AS c FROM estadisticos_basicos GROUP BY lote_id'],
];

(async () => {
  await initDb();

  for (const [titulo, sql] of consultas) {
    const filas = await consultar(sql);
    console.log(`${titulo}: ${JSON.stringify(filas)}`);
  }

  await cerrar();
})().catch(async (err) => {
  console.error(err.message);
  process.exitCode = 1;
  await cerrar().catch(() => {});
});
