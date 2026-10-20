-- 1) Diagnostico: ¿a que instancia te conecta Workbench?
SELECT @@port AS puerto, @@datadir AS datadir;

-- 2) Estado previo del usuario
SELECT user, host, plugin FROM mysql.user WHERE user = 'statlab';

-- 3) Recrear el usuario a la fuerza (DROP + CREATE, no IF NOT EXISTS)
DROP USER IF EXISTS 'statlab'@'localhost';
DROP USER IF EXISTS 'statlab'@'%';
CREATE USER 'statlab'@'localhost' IDENTIFIED BY 'statlab';
CREATE USER 'statlab'@'%' IDENTIFIED BY 'statlab';

-- 4) Base y privilegios
CREATE DATABASE IF NOT EXISTS statlab_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON statlab_db.* TO 'statlab'@'localhost';
GRANT ALL PRIVILEGES ON statlab_db.* TO 'statlab'@'%';
FLUSH PRIVILEGES;

-- 5) Verificacion final
SELECT user, host, plugin FROM mysql.user WHERE user = 'statlab';
SHOW GRANTS FOR 'statlab'@'localhost';
