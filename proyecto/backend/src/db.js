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

// Esquema: Fase 10% (lotes + datos crudos) + Fase 30% (estadisticos basicos).
const initDb = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS lotes_datos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      cantidad INTEGER NOT NULL,
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
  `;

  db.exec(sql, (err) => {
    if (err) {
      console.error('Error al crear el esquema:', err.message);
    } else {
      console.log('Tablas verificadas/creadas correctamente (lotes_datos, datos, estadisticos_basicos).');
    }
  });
};

module.exports = { db, initDb };