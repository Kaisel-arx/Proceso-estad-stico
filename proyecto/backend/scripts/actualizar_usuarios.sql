-- ==========================================================================
-- StatLab · Actualizacion de la tabla usuarios
--
-- Ubicacion: backend/scripts/actualizar_usuarios.sql
--
-- Flujo de autenticacion por correo electronico:
--   * estado_cuenta    : 'pendiente' al registrarse, 'activo' al verificar.
--   * codigo_verificacion : SHA-256 (64 hex) del codigo de 6 digitos de registro.
--   * expiracion_codigo  : caducidad UTC del ultimo codigo emitido
--                          (verificacion o recuperacion; en la practica solo
--                          uno de los dos flujos esta activo a la vez).
--   * codigo_recuperacion: SHA-256 del codigo de recuperacion de contrasena.
--
-- En la base NUNCA se guarda el codigo en claro: solo su hash, asi que una
-- fuga de la tabla no permite leer los codigos enviados.
--
-- Como usarlo:
--   * Instalacion nueva -> ejecuta el bloque 1 (crea la tabla completa).
--   * Base existente    -> ejecuta el bloque 2 (anade solo las columnas que
--     falten; las cuentas antiguas quedan 'activo' para seguir entrando).
--   * Automatico        -> el backend ejecuta estas mismas migraciones en cada
--     arranque (db.js), asi que el script es opcional pero sirve para revisar
--     o aplicar el cambio a mano desde Workbench / la consola de Railway.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) Instalacion nueva: tabla completa (en base existente no hace nada)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id INT NOT NULL AUTO_INCREMENT,
  usuario VARCHAR(30) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  estado_cuenta ENUM('pendiente','activo') NOT NULL DEFAULT 'activo',
  codigo_verificacion VARCHAR(64) NULL,
  expiracion_codigo DATETIME NULL,
  codigo_recuperacion VARCHAR(64) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_usuario (usuario),
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- 2) Base existente: ALTERs idempotentes.
--    MySQL (a diferencia de MariaDB) no admite "ADD COLUMN IF NOT EXISTS",
--    asi que cada columna se anade solo si information_schema dice que falta.
--    DEFAULT 'activo' rellena las filas existentes: ninguna cuenta antigua
--    queda bloqueada por la migracion.
-- --------------------------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'
             AND COLUMN_NAME = 'estado_cuenta');
SET @s := IF(@c = 0,
  'ALTER TABLE usuarios ADD COLUMN estado_cuenta ENUM(''pendiente'',''activo'') NOT NULL DEFAULT ''activo'' AFTER password_hash',
  'SELECT ''estado_cuenta ya existe, nada que hacer'' AS aviso');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'
             AND COLUMN_NAME = 'codigo_verificacion');
SET @s := IF(@c = 0,
  'ALTER TABLE usuarios ADD COLUMN codigo_verificacion VARCHAR(64) NULL AFTER estado_cuenta',
  'SELECT ''codigo_verificacion ya existe, nada que hacer'' AS aviso');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'
             AND COLUMN_NAME = 'expiracion_codigo');
SET @s := IF(@c = 0,
  'ALTER TABLE usuarios ADD COLUMN expiracion_codigo DATETIME NULL AFTER codigo_verificacion',
  'SELECT ''expiracion_codigo ya existe, nada que hacer'' AS aviso');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'
             AND COLUMN_NAME = 'codigo_recuperacion');
SET @s := IF(@c = 0,
  'ALTER TABLE usuarios ADD COLUMN codigo_recuperacion VARCHAR(64) NULL AFTER expiracion_codigo',
  'SELECT ''codigo_recuperacion ya existe, nada que hacer'' AS aviso');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- --------------------------------------------------------------------------
-- 3) Limpieza opcional de columnas del flujo antiguo (reset_token /
--    token_expiration). El codigo actual ya no las usa: se pueden borrar
--    cuando se confirme que todo el despliegue corre la version nueva.
-- --------------------------------------------------------------------------
-- ALTER TABLE usuarios DROP COLUMN reset_token;
-- ALTER TABLE usuarios DROP COLUMN token_expiration;

-- --------------------------------------------------------------------------
-- 4) Verificacion final
-- --------------------------------------------------------------------------
SHOW COLUMNS FROM usuarios;
SELECT id, usuario, email, estado_cuenta,
       (codigo_verificacion IS NOT NULL)  AS tiene_codigo_verificacion,
       (codigo_recuperacion IS NOT NULL)  AS tiene_codigo_recuperacion,
       expiracion_codigo
FROM usuarios;
