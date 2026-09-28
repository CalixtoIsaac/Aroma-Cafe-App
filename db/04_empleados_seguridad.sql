-- ============================================================================
-- AROMA A CAFÉ CO. — EMPLEADOS Y SEGURIDAD DE CUENTAS
-- ----------------------------------------------------------------------------
-- Ejecutar DESPUÉS de 03_menu_cafeteria.sql. Se puede ejecutar varias veces.
--
--  * COCINEROS: datos del personal de cocina (los repartidores ya tienen su
--    propia tabla). Cada empleado tiene una cuenta en USUARIOS.
--  * Contratar = crear su registro + su cuenta. Despedir = borrar su cuenta
--    (pierde el acceso al instante) y marcar la fecha de baja; su historial
--    de pedidos se conserva.
--  * USUARIOS.password_cifrada: copia CIFRADA (AES-256, la llave vive en el
--    servidor, no en la base) de la contraseña de los empleados, para que el
--    administrador pueda consultarla. Los clientes y el administrador NUNCA
--    tienen esa copia: sus contraseñas solo existen como hash SHA-256 con sal,
--    que no se puede revertir. Un trigger lo garantiza a nivel de base.
-- ============================================================================

USE AROMA_CAFE_db;
SET NAMES utf8mb4;

-- Procedimiento auxiliar (por si 02 se ejecutó con una versión que no lo dejó)
DROP PROCEDURE IF EXISTS sp_aux_agregar_columna;
DELIMITER //
CREATE PROCEDURE sp_aux_agregar_columna(IN p_tabla VARCHAR(64), IN p_columna VARCHAR(64), IN p_definicion TEXT)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tabla AND COLUMN_NAME = p_columna
    ) THEN
        SET @sql_aux = CONCAT('ALTER TABLE ', p_tabla, ' ADD COLUMN ', p_columna, ' ', p_definicion);
        PREPARE stmt_aux FROM @sql_aux;
        EXECUTE stmt_aux;
        DEALLOCATE PREPARE stmt_aux;
    END IF;
END //
DELIMITER ;

-- ----------------------------------------------------------------------------
-- 1. TABLA COCINEROS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cocineros (
    id_cocinero INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(15) NULL,
    email VARCHAR(100) NULL UNIQUE,
    fecha_contratacion DATE NOT NULL DEFAULT (CURRENT_DATE),
    fecha_baja DATE NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. COLUMNAS NUEVAS
-- ----------------------------------------------------------------------------
CALL sp_aux_agregar_columna('repartidores', 'email', 'VARCHAR(100) NULL');
CALL sp_aux_agregar_columna('repartidores', 'fecha_contratacion', 'DATE NULL');
CALL sp_aux_agregar_columna('repartidores', 'fecha_baja', 'DATE NULL');
UPDATE repartidores SET fecha_contratacion = '2026-01-15' WHERE fecha_contratacion IS NULL;

CALL sp_aux_agregar_columna('usuarios', 'id_cocinero', 'INT NULL UNIQUE');
CALL sp_aux_agregar_columna('usuarios', 'password_cifrada', 'VARCHAR(255) NULL');
CALL sp_aux_agregar_columna('usuarios', 'ultimo_acceso', 'DATETIME NULL');

-- Llave foránea usuarios → cocineros (solo si aún no existe)
DELIMITER //
DROP PROCEDURE IF EXISTS sp_aux_fk_cocinero //
CREATE PROCEDURE sp_aux_fk_cocinero()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND CONSTRAINT_NAME = 'fk_usuarios_cocineros'
    ) THEN
        ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_cocineros FOREIGN KEY (id_cocinero)
            REFERENCES cocineros(id_cocinero) ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END //
DELIMITER ;
CALL sp_aux_fk_cocinero();
DROP PROCEDURE sp_aux_fk_cocinero;

-- ----------------------------------------------------------------------------
-- 3. TRIGGERS: solo los empleados pueden tener contraseña consultable
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_usuarios_proteger_insert;
DROP TRIGGER IF EXISTS trg_usuarios_proteger_update;
DELIMITER //
CREATE TRIGGER trg_usuarios_proteger_insert
BEFORE INSERT ON usuarios
FOR EACH ROW
BEGIN
    IF NEW.rol NOT IN ('cocina', 'repartidor') THEN
        SET NEW.password_cifrada = NULL;
    END IF;
END //
CREATE TRIGGER trg_usuarios_proteger_update
BEFORE UPDATE ON usuarios
FOR EACH ROW
BEGIN
    IF NEW.rol NOT IN ('cocina', 'repartidor') THEN
        SET NEW.password_cifrada = NULL;
    END IF;
END //
DELIMITER ;

-- Limpia cualquier copia que existiera en cuentas que no son de empleados
UPDATE usuarios SET password_cifrada = NULL WHERE rol NOT IN ('cocina', 'repartidor') AND password_cifrada IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. DATOS: la cuenta "cocina" de ejemplo queda ligada a un cocinero
-- ----------------------------------------------------------------------------
INSERT INTO cocineros (nombre, telefono, email, fecha_contratacion)
SELECT 'Laura Méndez', '5553219876', 'laura.mendez@aromacafe.mx', '2026-01-15'
FROM usuarios u
WHERE u.usuario = 'cocina' AND u.id_cocinero IS NULL
  AND NOT EXISTS (SELECT 1 FROM cocineros WHERE email = 'laura.mendez@aromacafe.mx');

UPDATE usuarios u
JOIN cocineros c ON c.email = 'laura.mendez@aromacafe.mx'
SET u.id_cocinero = c.id_cocinero
WHERE u.usuario = 'cocina' AND u.id_cocinero IS NULL;

-- Correos de los repartidores de ejemplo
UPDATE repartidores SET email = CONCAT(
    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(SUBSTRING_INDEX(nombre_repartidor, ' ', 1), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o')),
    '@aromacafe.mx')
WHERE email IS NULL;

-- ----------------------------------------------------------------------------
-- 5. VISTA DE EMPLEADOS ACTIVOS (cocina y repartidores con cuenta)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_empleados AS
SELECT u.id_usuario, u.usuario, u.rol AS puesto, c.nombre, c.telefono, c.email,
       NULL AS plataforma, c.fecha_contratacion, u.ultimo_acceso
FROM usuarios u JOIN cocineros c ON c.id_cocinero = u.id_cocinero
WHERE u.rol = 'cocina' AND c.fecha_baja IS NULL
UNION ALL
SELECT u.id_usuario, u.usuario, u.rol, r.nombre_repartidor, r.telefono, r.email,
       r.plataforma, r.fecha_contratacion, u.ultimo_acceso
FROM usuarios u JOIN repartidores r ON r.id_repartidor = u.id_repartidor
WHERE u.rol = 'repartidor' AND r.fecha_baja IS NULL;

-- ----------------------------------------------------------------------------
-- 6. VERIFICACIÓN
-- ----------------------------------------------------------------------------
SELECT id_usuario, usuario, puesto, nombre, email FROM vw_empleados ORDER BY puesto, nombre;
SELECT rol, COUNT(*) AS cuentas, SUM(password_cifrada IS NOT NULL) AS con_copia_cifrada
FROM usuarios GROUP BY rol;
