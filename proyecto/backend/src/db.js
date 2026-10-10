const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'app.sqlite');

// Conexión a la base de datos (se crea el archivo si no existe)
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error al conectar con SQLite:', err.message);
    process.exit(1);
  }
  console.log(`✅ Conectado a SQLite en: ${DB_PATH}`);
});

// SQLite ignora las claves foraneas mientras este PRAGMA siga en OFF: sin el, los
// ON DELETE CASCADE quedan inertes y nada impide filas huerfanas.
db.run('PRAGMA foreign_keys = ON');

// Esquema: Fase 10% (lotes + datos crudos) + Fase 30% (estadisticos basicos)
// + autenticacion (usuarios) e historial propio por usuario.
const initDb = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lotes_datos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      cantidad INTEGER NOT NULL,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS datos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lote_id INTEGER NOT NULL,
      valor REAL NOT NULL,
      FOREIGN KEY (lote_id) REFERENCES lotes_datos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS estadisticos_basicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lote_id INTEGER NOT NULL UNIQUE,
      n INTEGER NOT NULL,
      x_min REAL NOT NULL,
      x_max REAL NOT NULL,
      rango REAL NOT NULL,
      calculado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lote_id) REFERENCES lotes_datos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tabla_frecuencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lote_id INTEGER NOT NULL,
      clase INTEGER NOT NULL,
      limite_inferior REAL NOT NULL,
      limite_superior REAL NOT NULL,
      limite_inferior_real REAL,
      limite_superior_real REAL,
      marca_clase REAL NOT NULL,
      frecuencia REAL NOT NULL,
      acumulada REAL NOT NULL,
      relativa REAL NOT NULL,
      porcentaje REAL NOT NULL,
      suavizada REAL,
      FOREIGN KEY (lote_id) REFERENCES lotes_datos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS estadisticos_avanzados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lote_id INTEGER NOT NULL UNIQUE,
      media REAL NOT NULL,
      suma_producto REAL NOT NULL,
      suma_desviacion_ponderada REAL NOT NULL,
      varianza_poblacional REAL NOT NULL,
      desviacion_poblacional REAL NOT NULL,
      varianza_muestral REAL NOT NULL,
      desviacion_muestral REAL NOT NULL,
      q1 REAL,
      mediana REAL,
      q3 REAL,
      p17 REAL,
      calculado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lote_id) REFERENCES lotes_datos(id) ON DELETE CASCADE
    );
  `;

  db.exec(sql, (err) => {
    if (err) {
      console.error('Error al crear el esquema:', err.message);
      return;
    }
    console.log(
      'Tablas verificadas/creadas correctamente (lotes_datos, datos, estadisticos_basicos, tabla_frecuencias, estadisticos_avanzados).'
    );
    migrar();
  });
};

// Columnas anadidas despues del esquema inicial, por tabla.
// CREATE TABLE IF NOT EXISTS no modifica una tabla ya creada, asi que se inspecciona el esquema
// y se agrega lo que falte con ALTER TABLE. Es idempotente: se puede ejecutar en cada arranque.
const COLUMNAS_NUEVAS_POR_TABLA = {
  //(usuario_id): la columna se agrego al llegar la autenticacion. SQLite no permite
  // NOT NULL en un ALTER, asi que los lotes previos quedan con NULL (sin duenio) y las
  // consultas del historial, que filtran por usuario, simplemente no los devuelven.
  lotes_datos: [['usuario_id', 'INTEGER REFERENCES usuarios(id) ON DELETE CASCADE']],
  tabla_frecuencias: [
    ['producto', 'REAL'],
    ['relativa_producto', 'REAL'],
    ['desviacion', 'REAL'],
    ['desviacion_ponderada', 'REAL'],
    ['limite_inferior_real', 'REAL'],
    ['limite_superior_real', 'REAL'],
    ['suavizada', 'REAL'],
  ],
  estadisticos_avanzados: [
    ['media_ponderada', 'REAL'],
    ['posicion_mediana', 'REAL'],
    ['moda', 'REAL'],
    ['coeficiente_variacion', 'REAL'],
  ],
};

const inspeccionar = (tabla) =>
  new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tabla})`, [], (err, columnas) => {
      if (err) return reject(err);
      resolve(new Set(columnas.map((c) => c.name)));
    });
  });

const agregar = (sql) =>
  new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });

const migrar = async () => {
  for (const [tabla, columnas] of Object.entries(COLUMNAS_NUEVAS_POR_TABLA)) {
    try {
      const existentes = await inspeccionar(tabla);
      const pendientes = columnas.filter(([nombre]) => !existentes.has(nombre));

      if (pendientes.length === 0) {
        console.log(`Esquema ${tabla} al dia.`);
        continue;
      }

      const alters = pendientes
        .map(([nombre, tipo]) => `ALTER TABLE ${tabla} ADD COLUMN ${nombre} ${tipo};`)
        .join('\n');
      await agregar(alters);
      console.log(`Migracion aplicada en ${tabla}: +${pendientes.map(([n]) => n).join(', +')}.`);
    } catch (err) {
      console.error(`Error migrando ${tabla}:`, err.message);
    }
  }

  // El indice va despues del ALTER: en una base ya creada la columna no existia al
  // arrancar el esquema, y crear el indice antes habria fallado el db.exec completo.
  try {
    await agregar('CREATE INDEX IF NOT EXISTS idx_lotes_usuario ON lotes_datos(usuario_id);');
  } catch (err) {
    console.error('Error creando indice de historial:', err.message);
  }
};

module.exports = { db, initDb };