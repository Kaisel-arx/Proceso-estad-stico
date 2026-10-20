const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Capa de persistencia sobre MySQL remoto (mysql2/promise).
 *
 * - El pool mantiene conexiones vivas con keep-alive y descarta las caidas: ante una
 *   cortada de red la siguiente consulta agarra una conexion nueva sin reiniciar.
 * - Las consultas de nivel app (consultar/ejecutar) reintentan UNA vez ante errores
 *   transitorios de red; los errores SQL (sintaxis, duplicados) no se reintentan.
 * - dateStrings + timezone 'Z' devuelven los TIMESTAMP como "YYYY-MM-DD HH:MM:SS" en
 *   UTC, la misma forma que entregaba SQLite, de modo que el frontend no cambia.
 *
 * Variables de entorno (.env): DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT.
 * Cada una acepta el alias MYSQLx que inyectan ciertos servicios en la nube
 * (el plugin de Railway usa MYSQLHOST/MYSQLUSER/...), y si faltan ambas se
 * cae a un valor local razonable para desarrollo:
 *
 *   DB_HOST     -> MYSQLHOST     -> 'localhost'
 *   DB_USER     -> MYSQLUSER     -> 'root'
 *   DB_PASSWORD -> MYSQLPASSWORD -> ''
 *   DB_NAME     -> MYSQLDATABASE -> 'statlab_db'
 *   DB_PORT     -> MYSQLPORT     -> 3306
 */

const CONFIG = {
  host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'statlab_db',
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT) || 3306,
  // Pool: conexiones reutilizadas y reposicionadas al morir una.
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL) || 10,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 10000,
  // Fechas en la misma forma que SQLite: cadena "YYYY-MM-DD HH:MM:SS" en UTC.
  dateStrings: true,
  timezone: 'Z',
};

// Errores de transporte: la conexion se perdio pero el servidor puede seguir ahi.
// Cualquier otro error (ER_DUP_ENTRY, ER_NO_SUCH_TABLE...) es de aplicacion y se
// propaga tal cual al manejador de errores de Express.
const ERRORES_TRANSITORIOS = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'PROTOCOL_ENQUEUE_AFTER_QUIT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
]);
const ERRNOS_TRANSITORIOS = new Set([
  1053, // ER_SERVER_SHUTDOWN en medio de la consulta
  2002, // no puede conectar al socket/hosts
  2003, // no puede conectarse al servidor
  2006, // el servidor perdio la conexion
  2013, // consulta perdida durante la espera de respuesta
]);

function esTransitorio(err) {
  if (!err) return false;
  return ERRORES_TRANSITORIOS.has(err.code) || ERRNOS_TRANSITORIOS.has(err.errno);
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

function validarConfiguracion() {
  const faltan = ['DB_HOST', 'DB_USER', 'DB_NAME'].filter((v) => !process.env[v]);
  if (faltan.length > 0) {
    throw new Error(
      `Faltan variables de entorno para MySQL: ${faltan.join(', ')}. Copia .env.example a .env y rellena DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (y DB_PORT si no es 3306).`
    );
  }
}

let pool = null;

/**
 * Crea el pool y, si la base aun no existe en el servidor externo, la crea en el
 * primer arranque (si el usuario tiene privilegio; si no, se avisa y se sigue, por
 * si la base ya esta provisionada a mano).
 */
async function crearPool() {
  validarConfiguracion();

  const adminConfig = {
    host: CONFIG.host,
    user: CONFIG.user,
    password: CONFIG.password,
    port: CONFIG.port,
    connectTimeout: CONFIG.connectTimeout,
  };

  let admin = null;
  try {
    admin = await mysql.createConnection(adminConfig);
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${CONFIG.database}\`
         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (err) {
    console.warn(
      `⚠️  No se pudo verificar/crear la base "${CONFIG.database}" (${err.message}). Si ya existe creada, continua normal.`
    );
  } finally {
    if (admin) await admin.end().catch(() => {});
  }

  pool = mysql.createPool(CONFIG);
  return pool;
}

/**
 * Conecta con reintentos en cadena (backoff exponencial) para que un servidor externo
 * que arranque tarde o una caida breve de red no tumbe el proceso a la primera.
 */
async function conectarConReintentos(intentos = 5) {
  let ultimoError;
  for (let i = 0; i < intentos; i += 1) {
    try {
      await crearPool();
      await pool.query('SELECT 1'); // valida la conexion real del pool
      return pool;
    } catch (err) {
      // Credenciales o permisos: reintentar no arregla nada, se avisa ya.
      if (err.errno === 1045 || err.errno === 1044) {
        throw new Error(
          `MySQL rechazo el acceso (usuario "${CONFIG.user}") en ${CONFIG.host}:${CONFIG.port}: ${err.message}. Revisa DB_USER/DB_PASSWORD en el .env.`
        );
      }
      ultimoError = err;
      const espera = 500 * 2 ** i;
      console.warn(
        `⚠️  MySQL no responde (intento ${i + 1}/${intentos}): ${err.message}. Reintento en ${espera} ms...`
      );
      if (pool) {
        await pool.end().catch(() => {});
        pool = null;
      }
      await esperar(espera);
    }
  }
  throw new Error(`No se pudo conectar a MySQL tras ${intentos} intentos: ${ultimoError.message}`);
}

// `destino` es la conexion de una transaccion cuando la hay; sin ella se usa el pool
// (cada consulta toma y devuelve su conexion). Solo el pool reintenta: una transaccion
// interrumpida por la red se revierte y repropaga, que es lo correcto.
async function consultar(sql, params = [], destino = null, intento = 0) {
  const esPool = !destino;
  try {
    const [filas] = await (destino || pool).query(sql, params);
    return filas;
  } catch (err) {
    if (esPool && esTransitorio(err) && intento < 1) {
      await esperar(300);
      return consultar(sql, params, null, intento + 1);
    }
    throw err;
  }
}

// Devuelve la primera fila de la consulta o undefined.
async function obtener(sql, params = [], destino = null) {
  const filas = await consultar(sql, params, destino);
  return filas.length > 0 ? filas[0] : undefined;
}

// Ejecuta INSERT/UPDATE/DELETE y devuelve el ResultSetHeader (insertId, affectedRows).
async function ejecutar(sql, params = [], destino = null, intento = 0) {
  const esPool = !destino;
  try {
    const [resultado] = await (destino || pool).query(sql, params);
    return resultado;
  } catch (err) {
    if (esPool && esTransitorio(err) && intento < 1) {
      await esperar(300);
      return ejecutar(sql, params, null, intento + 1);
    }
    throw err;
  }
}

/**
 * Ejecuta la funcion dentro de una transaccion: commit si termina bien, rollback si
 * lanza. La conexion (con BEGIN/COMMIT/ROLLBACK) no se reintenta nunca: ante una
 * perdida de red el rollback local falla y la base revierte sola al desconectar.
 */
async function transaccion(funcion) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await funcion(conexion);
    await conexion.commit();
    return resultado;
  } catch (err) {
    try {
      await conexion.rollback();
    } catch {
      /* la base ya revirtio al caer la conexion */
    }
    throw err;
  } finally {
    conexion.release();
  }
}

// DDL de las seis tablas del dominio, traducido de SQLite a MySQL 8 / MariaDB:
// InnoDB para claves foraneas reales, utf8mb4 para acentos en nombres y descripciones,
// AUTO_INCREMENT para las identidades y TIMESTAMP con UTC para fechas.
const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS usuarios (
     id INT NOT NULL AUTO_INCREMENT,
     usuario VARCHAR(30) NOT NULL,
     email VARCHAR(254) NOT NULL,
     password_hash VARCHAR(255) NOT NULL,
     reset_token VARCHAR(64) NULL,
     token_expiration DATETIME NULL,
     creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (id),
     UNIQUE KEY uq_usuarios_usuario (usuario),
     UNIQUE KEY uq_usuarios_email (email)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS lotes_datos (
     id INT NOT NULL AUTO_INCREMENT,
     nombre VARCHAR(120) NOT NULL,
     descripcion TEXT NULL,
     cantidad INT NOT NULL,
     usuario_id INT NULL,
     creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (id),
     KEY idx_lotes_usuario (usuario_id),
     CONSTRAINT fk_lotes_usuario FOREIGN KEY (usuario_id)
       REFERENCES usuarios(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS datos (
     id INT NOT NULL AUTO_INCREMENT,
     lote_id INT NOT NULL,
     valor DOUBLE NOT NULL,
     PRIMARY KEY (id),
     KEY idx_datos_lote (lote_id),
     CONSTRAINT fk_datos_lote FOREIGN KEY (lote_id)
       REFERENCES lotes_datos(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS estadisticos_basicos (
     id INT NOT NULL AUTO_INCREMENT,
     lote_id INT NOT NULL,
     n INT NOT NULL,
     x_min DOUBLE NOT NULL,
     x_max DOUBLE NOT NULL,
     rango DOUBLE NOT NULL,
     calculado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (id),
     UNIQUE KEY uq_basicos_lote (lote_id),
     CONSTRAINT fk_basicos_lote FOREIGN KEY (lote_id)
       REFERENCES lotes_datos(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS tabla_frecuencias (
     id INT NOT NULL AUTO_INCREMENT,
     lote_id INT NOT NULL,
     clase INT NOT NULL,
     limite_inferior DOUBLE NOT NULL,
     limite_superior DOUBLE NOT NULL,
     limite_inferior_real DOUBLE NULL,
     limite_superior_real DOUBLE NULL,
     marca_clase DOUBLE NOT NULL,
     frecuencia DOUBLE NOT NULL,
     acumulada DOUBLE NOT NULL,
     relativa DOUBLE NOT NULL,
     porcentaje DOUBLE NOT NULL,
     suavizada DOUBLE NULL,
     producto DOUBLE NULL,
     relativa_producto DOUBLE NULL,
     desviacion DOUBLE NULL,
     desviacion_ponderada DOUBLE NULL,
     PRIMARY KEY (id),
     KEY idx_frecuencias_lote (lote_id),
     CONSTRAINT fk_frecuencias_lote FOREIGN KEY (lote_id)
       REFERENCES lotes_datos(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS estadisticos_avanzados (
     id INT NOT NULL AUTO_INCREMENT,
     lote_id INT NOT NULL,
     media DOUBLE NOT NULL,
     suma_producto DOUBLE NOT NULL,
     suma_desviacion_ponderada DOUBLE NOT NULL,
     varianza_poblacional DOUBLE NOT NULL,
     desviacion_poblacional DOUBLE NOT NULL,
     varianza_muestral DOUBLE NOT NULL,
     desviacion_muestral DOUBLE NOT NULL,
     q1 DOUBLE NULL,
     mediana DOUBLE NULL,
     q3 DOUBLE NULL,
     p17 DOUBLE NULL,
     media_ponderada DOUBLE NULL,
     posicion_mediana DOUBLE NULL,
     moda DOUBLE NULL,
     coeficiente_variacion DOUBLE NULL,
     calculado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (id),
     UNIQUE KEY uq_avanzados_lote (lote_id),
     CONSTRAINT fk_avanzados_lote FOREIGN KEY (lote_id)
       REFERENCES lotes_datos(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// Columnas anadidas despues del esquema inicial, por tabla. CREATE TABLE IF NOT EXISTS
// no modifica una tabla ya creada, asi que se inspecciona el esquema con SHOW COLUMNS y
// se agrega lo que falte con ALTER TABLE. Es idempotente: se ejecuta en cada arranque.
// usuario_id queda NULLABLE porque MySQL solo permite valores nulos al agregar una
// columna y los lotes previos quedarian sin duenio (las consultas filtran por usuario).
const COLUMNAS_NUEVAS_POR_TABLA = {
  usuarios: [
    // Recuperacion de contrasena: se guarda el SHA-256 del codigo de 6 digitos
    // (64 hex, por eso VARCHAR(64)), nunca el codigo en claro, y su caducidad.
    ['reset_token', 'VARCHAR(64) NULL'],
    ['token_expiration', 'DATETIME NULL'],
  ],
  lotes_datos: [['usuario_id', 'INT NULL']],
  tabla_frecuencias: [
    ['producto', 'DOUBLE NULL'],
    ['relativa_producto', 'DOUBLE NULL'],
    ['desviacion', 'DOUBLE NULL'],
    ['desviacion_ponderada', 'DOUBLE NULL'],
    ['limite_inferior_real', 'DOUBLE NULL'],
    ['limite_superior_real', 'DOUBLE NULL'],
    ['suavizada', 'DOUBLE NULL'],
  ],
  estadisticos_avanzados: [
    ['media_ponderada', 'DOUBLE NULL'],
    ['posicion_mediana', 'DOUBLE NULL'],
    ['moda', 'DOUBLE NULL'],
    ['coeficiente_variacion', 'DOUBLE NULL'],
  ],
};

async function columnasDe(tabla) {
  const filas = await consultar(`SHOW COLUMNS FROM \`${tabla}\``);
  return new Set(filas.map((c) => c.Field));
}

async function migrar() {
  for (const [tabla, columnas] of Object.entries(COLUMNAS_NUEVAS_POR_TABLA)) {
    try {
      const existentes = await columnasDe(tabla);
      const pendientes = columnas.filter(([nombre]) => !existentes.has(nombre));

      if (pendientes.length === 0) continue;

      for (const [nombre, tipo] of pendientes) {
        await ejecutar(`ALTER TABLE \`${tabla}\` ADD COLUMN \`${nombre}\` ${tipo}`);
      }
      console.log(`Migracion aplicada en ${tabla}: +${pendientes.map(([n]) => n).join(', +')}.`);
    } catch (err) {
      console.error(`Error migrando ${tabla}:`, err.message);
    }
  }

  // La clave foranea de usuario_id solo es necesaria si la columna acaba de llegar:
  // el DDL de arranque ya la trae en una base fresca.
  try {
    const [fk] = await consultar(
      `SELECT COUNT(*) AS c
         FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'lotes_datos'
          AND CONSTRAINT_NAME = 'fk_lotes_usuario'`
    );
    if (fk.c === 0) {
      await ejecutar(
        `ALTER TABLE lotes_datos
           ADD CONSTRAINT fk_lotes_usuario FOREIGN KEY (usuario_id)
           REFERENCES usuarios(id) ON DELETE CASCADE`
      );
      console.log('Clave foranea fk_lotes_usuario creada.');
    }
  } catch (err) {
    console.error('Error creando clave foranea de historial:', err.message);
  }

  // CREATE INDEX IF NOT EXISTS no existe en MySQL: se comprueba en information_schema.
  try {
    const [idx] = await consultar(
      `SELECT COUNT(*) AS c
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'lotes_datos'
          AND INDEX_NAME = 'idx_lotes_usuario'`
    );
    if (idx.c === 0) await ejecutar('CREATE INDEX idx_lotes_usuario ON lotes_datos (usuario_id)');
  } catch (err) {
    console.error('Error creando indice de historial:', err.message);
  }
}

/**
 * Arranque completo: pool con reintentos + esquema. server.js la espera antes de
 * escuchar peticiones, de modo que ninguna consulta se emite contra una base caida.
 */
async function initDb() {
  await conectarConReintentos();

  for (const ddl of ESQUEMA) {
    await ejecutar(ddl);
  }
  await migrar();

  console.log(
    `✅ MySQL listo: ${CONFIG.host}:${CONFIG.port}/${CONFIG.database} (pool de ${CONFIG.connectionLimit})`
  );
}

// Cierra el pool (fin de procesos largos: scripts, tests).
async function cerrar() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { initDb, consultar, obtener, ejecutar, transaccion, cerrar };
