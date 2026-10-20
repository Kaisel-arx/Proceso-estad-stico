// Elimina filas huerfanas: registros de las tablas hijas cuyo lote_id ya no existe
// en lotes_datos. Las claves foraneas de MySQL ya lo impiden, pero sirve para bases
// heredadas de la etapa SQLite o importadas a mano.
// dry-run por defecto: hay que pasar --aplicar para que borre de verdad.
const { initDb, consultar, ejecutar, transaccion, cerrar } = require('../src/db');

const APLICAR = process.argv.includes('--aplicar');

const HIJAS = ['datos', 'estadisticos_basicos', 'tabla_frecuencias', 'estadisticos_avanzados'];
const SIN_PADRE = 'WHERE lote_id NOT IN (SELECT id FROM lotes_datos)';

(async () => {
  await initDb();

  console.log(APLICAR ? 'MODO APLICAR: se borrara de verdad' : 'MODO SIMULACION (dry-run): nada se borra');
  console.log('');

  const planes = [];
  for (const tabla of HIJAS) {
    const huerfanos = await consultar(`SELECT DISTINCT lote_id FROM ${tabla} ${SIN_PADRE}`);
    if (huerfanos.length > 0) {
      const conteo = await consultar(`SELECT COUNT(*) AS c FROM ${tabla} ${SIN_PADRE}`);
      planes.push({
        tabla,
        loteIds: huerfanos.map((f) => f.lote_id),
        filas: Number(conteo[0].c),
      });
    }
  }

  if (planes.length === 0) {
    console.log('No hay filas huerfanas. La base esta limpia.');
    await cerrar();
    return;
  }

  let total = 0;
  for (const plan of planes) {
    console.log(`${plan.tabla}: ${plan.filas} fila(s) con lote_id ${plan.loteIds.join(', ')}`);
    total += plan.filas;
  }
  console.log(`\nTotal a eliminar: ${total} fila(s)`);

  if (!APLICAR) {
    console.log('\nNo se borro nada. Usa --aplicar para ejecutarlo.');
    await cerrar();
    return;
  }

  try {
    await transaccion(async (conn) => {
      for (const plan of planes) {
        await ejecutar(`DELETE FROM ${plan.tabla} ${SIN_PADRE}`, [], conn);
      }
    });
    console.log('\nPurgado completado dentro de una transaccion.');
  } catch (err) {
    console.error('\nError, se revirtio la transaccion:', err.message);
    process.exitCode = 1;
  }

  await cerrar();
})().catch(async (err) => {
  console.error(err.message);
  process.exitCode = 1;
  await cerrar().catch(() => {});
});
