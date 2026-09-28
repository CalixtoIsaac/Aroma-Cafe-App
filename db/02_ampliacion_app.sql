-- ============================================================================
-- AROMA A CAFÉ CO. — AMPLIACIÓN DE LA BASE DE DATOS PARA LA APLICACIÓN WEB
-- ----------------------------------------------------------------------------
-- Ejecutar DESPUÉS de 01_AvanceProyecto_1.sql y ANTES de 03_menu_cafeteria.sql.
-- No borra nada de lo existente: agrega tablas, columnas, funciones,
-- procedimientos, triggers, vistas y las cuentas de acceso de ejemplo.
-- Puede ejecutarse más de una vez sin duplicar datos.
-- ============================================================================

USE AROMA_CAFE_db;
SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- 0. Procedimiento auxiliar: agrega una columna solo si no existe
-- ----------------------------------------------------------------------------
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
-- 1. COLUMNAS NUEVAS EN TABLAS EXISTENTES
-- ----------------------------------------------------------------------------
-- Platillos: imagen y borrado lógico (un platillo con ventas no se puede borrar
-- físicamente porque detalle_pedidos lo referencia con ON DELETE RESTRICT)
CALL sp_aux_agregar_columna('platillos', 'imagen_url', 'VARCHAR(255) NULL');
CALL sp_aux_agregar_columna('platillos', 'eliminado', 'BOOLEAN NOT NULL DEFAULT FALSE');
-- Opciones o sabores que el cliente elige (ej. 'Vainilla,Chocolate,Fresa'); NULL = sin opciones
CALL sp_aux_agregar_columna('platillos', 'opciones', 'VARCHAR(255) NULL');

-- Pedidos: datos de entrega capturados en el momento de la compra
CALL sp_aux_agregar_columna('pedidos', 'direccion_entrega', 'TEXT NULL');
CALL sp_aux_agregar_columna('pedidos', 'telefono_contacto', 'VARCHAR(15) NULL');
CALL sp_aux_agregar_columna('pedidos', 'notas', 'VARCHAR(255) NULL');

-- Detalle: descuento aplicado y costo de insumos al momento de la venta
CALL sp_aux_agregar_columna('detalle_pedidos', 'descuento_aplicado', 'DECIMAL(5,2) NOT NULL DEFAULT 0');
CALL sp_aux_agregar_columna('detalle_pedidos', 'costo_insumos', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
-- Sabor u opción elegida por el cliente (ej. 'Fresa' en una Malteada)
CALL sp_aux_agregar_columna('detalle_pedidos', 'opcion', 'VARCHAR(50) NULL');

-- Estados de pedido homologados (el script original usa 'En Preparacion' sin acento)
UPDATE pedidos SET estado_pedido = 'En Preparación' WHERE estado_pedido = 'En Preparacion';
UPDATE pedidos SET direccion_entrega = (SELECT c.direccion_entrega FROM clientes c WHERE c.id_cliente = pedidos.id_cliente)
WHERE direccion_entrega IS NULL;
UPDATE pedidos SET telefono_contacto = (SELECT c.telefono FROM clientes c WHERE c.id_cliente = pedidos.id_cliente)
WHERE telefono_contacto IS NULL;

-- Números de pedido "de ticket" a partir del 2480 para los nuevos pedidos
ALTER TABLE pedidos AUTO_INCREMENT = 2480;

-- ----------------------------------------------------------------------------
-- 2. TABLAS NUEVAS
-- ----------------------------------------------------------------------------

-- USUARIOS: cuentas de acceso con rol. Un cliente o repartidor tiene su fila
-- en su tabla de negocio y aquí su cuenta de acceso (relación 1:1 opcional).
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    password_hash CHAR(64) NOT NULL,          -- SHA-256 en hexadecimal
    salt VARCHAR(32) NOT NULL,
    rol ENUM('admin', 'cocina', 'repartidor', 'cliente') NOT NULL,
    id_cliente INT NULL UNIQUE,
    id_repartidor INT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_usuarios_clientes FOREIGN KEY (id_cliente)
        REFERENCES clientes(id_cliente) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_usuarios_repartidores FOREIGN KEY (id_repartidor)
        REFERENCES repartidores(id_repartidor) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- SESIONES: token de acceso emitido al iniciar sesión
CREATE TABLE IF NOT EXISTS sesiones (
    token CHAR(64) PRIMARY KEY,
    id_usuario INT NOT NULL,
    fecha_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_expira DATETIME NOT NULL,
    CONSTRAINT fk_sesiones_usuarios FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

-- DESCUENTOS: porcentaje por platillo, por categoría o general (ambos NULL),
-- válido entre dos fechas, opcionalmente solo ciertos días y/o un horario.
CREATE TABLE IF NOT EXISTS descuentos (
    id_descuento INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    porcentaje DECIMAL(5,2) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 90),
    id_platillo INT NULL,
    id_categoria INT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    dias_semana VARCHAR(20) NULL,     -- números DAYOFWEEK separados por coma (1=Dom … 7=Sáb); NULL = todos
    hora_inicio TIME NULL,
    hora_fin TIME NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_descuentos_platillos FOREIGN KEY (id_platillo)
        REFERENCES platillos(id_platillo) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_descuentos_categorias FOREIGN KEY (id_categoria)
        REFERENCES categorias(id_categoria) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_descuentos_fechas CHECK (fecha_fin >= fecha_inicio)
) ENGINE=InnoDB;

-- SEGUIMIENTO_PEDIDOS: bitácora de cada cambio de estado (la llena un trigger)
CREATE TABLE IF NOT EXISTS seguimiento_pedidos (
    id_seguimiento INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido INT NOT NULL,
    estado VARCHAR(30) NOT NULL,
    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
    id_repartidor INT NULL,
    CONSTRAINT fk_seguimiento_pedidos FOREIGN KEY (id_pedido)
        REFERENCES pedidos(id_pedido) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 3. FUNCIONES
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_descuento_vigente;
DROP FUNCTION IF EXISTS fn_precio_final;
DROP FUNCTION IF EXISTS fn_costo_platillo;
DROP FUNCTION IF EXISTS fn_porciones_disponibles;
DROP FUNCTION IF EXISTS fn_hash_password;

DELIMITER //

-- Mayor descuento vigente en este momento para un platillo
CREATE FUNCTION fn_descuento_vigente(p_id_platillo INT)
RETURNS DECIMAL(5,2)
NOT DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_desc DECIMAL(5,2);
    SELECT IFNULL(MAX(d.porcentaje), 0) INTO v_desc
    FROM descuentos d
    JOIN platillos p ON p.id_platillo = p_id_platillo
    WHERE d.activo = TRUE
      AND (d.id_platillo = p.id_platillo
           OR d.id_categoria = p.id_categoria
           OR (d.id_platillo IS NULL AND d.id_categoria IS NULL))
      AND CURDATE() BETWEEN d.fecha_inicio AND d.fecha_fin
      AND (d.dias_semana IS NULL OR d.dias_semana = ''
           OR FIND_IN_SET(DAYOFWEEK(CURDATE()), d.dias_semana) > 0)
      AND (d.hora_inicio IS NULL OR d.hora_fin IS NULL
           OR CURTIME() BETWEEN d.hora_inicio AND d.hora_fin);
    RETURN v_desc;
END //

-- Precio con el descuento vigente aplicado
CREATE FUNCTION fn_precio_final(p_id_platillo INT)
RETURNS DECIMAL(10,2)
NOT DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_precio DECIMAL(10,2);
    SELECT precio_unitario INTO v_precio FROM platillos WHERE id_platillo = p_id_platillo;
    RETURN ROUND(v_precio * (1 - fn_descuento_vigente(p_id_platillo) / 100), 2);
END //

-- Costo de insumos de una porción según su receta
CREATE FUNCTION fn_costo_platillo(p_id_platillo INT)
RETURNS DECIMAL(10,2)
NOT DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_costo DECIMAL(10,2);
    SELECT IFNULL(SUM(r.cantidad_requerida * i.costo_unitario), 0) INTO v_costo
    FROM receta_platillo r JOIN ingredientes i ON i.id_ingrediente = r.id_ingrediente
    WHERE r.id_platillo = p_id_platillo;
    RETURN v_costo;
END //

-- Porciones que se pueden preparar con el inventario actual (NULL = sin receta / sin límite)
CREATE FUNCTION fn_porciones_disponibles(p_id_platillo INT)
RETURNS INT
NOT DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_porciones INT;
    SELECT MIN(FLOOR(i.stock_actual / r.cantidad_requerida)) INTO v_porciones
    FROM receta_platillo r JOIN ingredientes i ON i.id_ingrediente = r.id_ingrediente
    WHERE r.id_platillo = p_id_platillo;
    RETURN v_porciones;
END //

-- Hash de contraseña (SHA-256 con sal). El servidor usa exactamente el mismo cálculo.
CREATE FUNCTION fn_hash_password(p_password VARCHAR(100), p_salt VARCHAR(32))
RETURNS CHAR(64)
DETERMINISTIC
NO SQL
BEGIN
    RETURN SHA2(CONCAT(p_salt, p_password), 256);
END //

DELIMITER ;

-- ----------------------------------------------------------------------------
-- 4. PROCEDIMIENTOS
-- ----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_agregar_detalle_pedido;
DROP PROCEDURE IF EXISTS sp_cambiar_estado_pedido;
DROP PROCEDURE IF EXISTS sp_crear_usuario;

DELIMITER //

-- Reemplaza la versión del avance 1: ahora aplica el descuento vigente,
-- valida inventario y la opción elegida (sabor), y guarda el costo de insumos.
-- El trigger trg_detalle_descuenta_inventario descuenta el stock.
CREATE PROCEDURE sp_agregar_detalle_pedido(
    IN p_id_pedido INT,
    IN p_id_platillo INT,
    IN p_cantidad INT,
    IN p_opcion VARCHAR(50)
)
BEGIN
    DECLARE v_opciones VARCHAR(255);
    DECLARE v_precio_lista DECIMAL(10,2);
    DECLARE v_desc DECIMAL(5,2);
    DECLARE v_precio DECIMAL(10,2);
    DECLARE v_porciones INT;
    DECLARE v_disponible BOOLEAN;
    DECLARE v_nombre VARCHAR(100);
    DECLARE v_msg VARCHAR(200);

    SELECT precio_unitario, disponible AND NOT eliminado, nombre_platillo, NULLIF(TRIM(opciones), '')
      INTO v_precio_lista, v_disponible, v_nombre, v_opciones
    FROM platillos WHERE id_platillo = p_id_platillo;

    IF v_precio_lista IS NULL OR v_disponible = FALSE THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Un platillo del carrito ya no está disponible';
    END IF;

    IF v_opciones IS NULL THEN
        SET p_opcion = NULL;
    ELSEIF p_opcion IS NULL OR FIND_IN_SET(p_opcion, REPLACE(v_opciones, ', ', ',')) = 0 THEN
        SET v_msg = CONCAT('Elige una opción válida para ', v_nombre, ' (', v_opciones, ')');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;

    SET v_porciones = fn_porciones_disponibles(p_id_platillo);
    IF v_porciones IS NOT NULL AND v_porciones < p_cantidad THEN
        SET v_msg = CONCAT('Inventario insuficiente para ', v_nombre, ' (quedan ', v_porciones, ')');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;

    SET v_desc = fn_descuento_vigente(p_id_platillo);
    SET v_precio = ROUND(v_precio_lista * (1 - v_desc / 100), 2);

    INSERT INTO detalle_pedidos
        (id_pedido, id_platillo, cantidad, precio_historico, subtotal, descuento_aplicado, costo_insumos, opcion)
    VALUES
        (p_id_pedido, p_id_platillo, p_cantidad, v_precio, v_precio * p_cantidad, v_desc,
         fn_costo_platillo(p_id_platillo) * p_cantidad, p_opcion);

    UPDATE pedidos SET total_pedido = fn_calcular_total_pedido(p_id_pedido)
    WHERE id_pedido = p_id_pedido;
END //

-- Cambia el estado validando el flujo:
-- Pendiente → En Preparación → Listo → En Camino → Entregado
CREATE PROCEDURE sp_cambiar_estado_pedido(
    IN p_id_pedido INT,
    IN p_nuevo_estado VARCHAR(30),
    IN p_id_repartidor INT
)
BEGIN
    DECLARE v_actual VARCHAR(30);
    SELECT estado_pedido INTO v_actual FROM pedidos WHERE id_pedido = p_id_pedido FOR UPDATE;

    IF v_actual IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El pedido no existe';
    END IF;

    IF NOT (
        (v_actual = 'Pendiente'      AND p_nuevo_estado = 'En Preparación') OR
        (v_actual = 'En Preparación' AND p_nuevo_estado = 'Listo') OR
        (v_actual = 'Listo'          AND p_nuevo_estado = 'En Camino') OR
        (v_actual = 'En Camino'      AND p_nuevo_estado = 'Entregado')
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ese cambio de estado no es válido (quizá otra persona ya lo tomó)';
    END IF;

    IF p_nuevo_estado = 'En Camino' THEN
        UPDATE pedidos SET estado_pedido = p_nuevo_estado, id_repartidor = p_id_repartidor
        WHERE id_pedido = p_id_pedido;
        UPDATE repartidores SET estado = 'Ocupado' WHERE id_repartidor = p_id_repartidor;
    ELSEIF p_nuevo_estado = 'Entregado' THEN
        UPDATE pedidos SET estado_pedido = p_nuevo_estado WHERE id_pedido = p_id_pedido;
        UPDATE repartidores r SET r.estado = 'Disponible'
        WHERE r.id_repartidor = p_id_repartidor
          AND NOT EXISTS (SELECT 1 FROM pedidos x WHERE x.id_repartidor = r.id_repartidor AND x.estado_pedido = 'En Camino');
    ELSE
        UPDATE pedidos SET estado_pedido = p_nuevo_estado WHERE id_pedido = p_id_pedido;
    END IF;
END //

-- Crea una cuenta de acceso con sal aleatoria
CREATE PROCEDURE sp_crear_usuario(
    IN p_usuario VARCHAR(50),
    IN p_password VARCHAR(100),
    IN p_rol VARCHAR(20),
    IN p_id_cliente INT,
    IN p_id_repartidor INT
)
BEGIN
    DECLARE v_salt VARCHAR(32);
    SET v_salt = SUBSTRING(MD5(RAND()), 1, 16);
    INSERT INTO usuarios (usuario, password_hash, salt, rol, id_cliente, id_repartidor)
    VALUES (p_usuario, fn_hash_password(p_password, v_salt), v_salt, p_rol, p_id_cliente, p_id_repartidor);
END //

DELIMITER ;

-- ----------------------------------------------------------------------------
-- 5. TRIGGERS
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_detalle_descuenta_inventario;
DROP TRIGGER IF EXISTS trg_pedidos_seguimiento_insert;
DROP TRIGGER IF EXISTS trg_pedidos_seguimiento_update;

DELIMITER //

-- Al vender un platillo se descuentan sus ingredientes del inventario.
-- (@omitir_inventario = 1 permite cargar historial sin afectar el stock)
CREATE TRIGGER trg_detalle_descuenta_inventario
AFTER INSERT ON detalle_pedidos
FOR EACH ROW
BEGIN
    IF IFNULL(@omitir_inventario, 0) = 0 THEN
        UPDATE ingredientes i
        JOIN receta_platillo r ON r.id_ingrediente = i.id_ingrediente
        SET i.stock_actual = GREATEST(i.stock_actual - r.cantidad_requerida * NEW.cantidad, 0)
        WHERE r.id_platillo = NEW.id_platillo;
    END IF;
END //

-- Cada pedido nuevo y cada cambio de estado queda registrado en la bitácora
CREATE TRIGGER trg_pedidos_seguimiento_insert
AFTER INSERT ON pedidos
FOR EACH ROW
BEGIN
    INSERT INTO seguimiento_pedidos (id_pedido, estado, fecha_hora, id_repartidor)
    VALUES (NEW.id_pedido, NEW.estado_pedido, NEW.fecha_hora, NEW.id_repartidor);
END //

CREATE TRIGGER trg_pedidos_seguimiento_update
AFTER UPDATE ON pedidos
FOR EACH ROW
BEGIN
    IF NEW.estado_pedido <> OLD.estado_pedido THEN
        INSERT INTO seguimiento_pedidos (id_pedido, estado, id_repartidor)
        VALUES (NEW.id_pedido, NEW.estado_pedido, NEW.id_repartidor);
    END IF;
END //

DELIMITER ;

-- ----------------------------------------------------------------------------
-- 6. VISTAS PARA REPORTES
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_pedidos_detalle AS
SELECT
    p.id_pedido,
    p.fecha_hora,
    p.estado_pedido,
    p.total_pedido,
    CONCAT(c.nombre, ' ', c.ap_paterno) AS cliente,
    IFNULL(p.telefono_contacto, c.telefono) AS telefono,
    IFNULL(p.direccion_entrega, c.direccion_entrega) AS direccion,
    r.nombre_repartidor AS repartidor
FROM pedidos p
JOIN clientes c ON c.id_cliente = p.id_cliente
LEFT JOIN repartidores r ON r.id_repartidor = p.id_repartidor;

CREATE OR REPLACE VIEW vw_ventas_diarias AS
SELECT
    DATE(p.fecha_hora) AS dia,
    COUNT(DISTINCT p.id_pedido) AS pedidos,
    SUM(d.subtotal) AS ventas,
    SUM(d.costo_insumos) AS costo_insumos,
    SUM(d.subtotal) - SUM(d.costo_insumos) AS utilidad
FROM pedidos p
JOIN detalle_pedidos d ON d.id_pedido = p.id_pedido
WHERE p.estado_pedido = 'Entregado'
GROUP BY DATE(p.fecha_hora);

CREATE OR REPLACE VIEW vw_platillos_mas_vendidos AS
SELECT
    pl.id_platillo,
    pl.nombre_platillo,
    c.nombre_categoria,
    SUM(d.cantidad) AS unidades,
    SUM(d.subtotal) AS ventas
FROM detalle_pedidos d
JOIN pedidos p ON p.id_pedido = d.id_pedido
JOIN platillos pl ON pl.id_platillo = d.id_platillo
JOIN categorias c ON c.id_categoria = pl.id_categoria
WHERE p.estado_pedido = 'Entregado'
GROUP BY pl.id_platillo, pl.nombre_platillo, c.nombre_categoria;

-- ----------------------------------------------------------------------------
-- 7. CUENTAS DE ACCESO Y LIMPIEZA (el menú está en 03_menu_cafeteria.sql)
-- ----------------------------------------------------------------------------

-- Cuentas de acceso de ejemplo (contraseñas en el README)
--   admin / AromaAdmin2026   (contraseña maestra del administrador)
--   cocina / cocina123
--   roberto, david, elena / reparto123   (repartidores 1, 3 y 4)
--   carlos, ana / cliente123              (clientes 1 y 2)
DELIMITER //
DROP PROCEDURE IF EXISTS sp_aux_semilla_usuarios //
CREATE PROCEDURE sp_aux_semilla_usuarios()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE usuario = 'admin') THEN
        CALL sp_crear_usuario('admin',   'AromaAdmin2026', 'admin',      NULL, NULL);
        CALL sp_crear_usuario('cocina',  'cocina123',      'cocina',     NULL, NULL);
        CALL sp_crear_usuario('roberto', 'reparto123',     'repartidor', NULL, 1);
        CALL sp_crear_usuario('david',   'reparto123',     'repartidor', NULL, 3);
        CALL sp_crear_usuario('elena',   'reparto123',     'repartidor', NULL, 4);
        CALL sp_crear_usuario('carlos',  'cliente123',     'cliente',    1,    NULL);
        CALL sp_crear_usuario('ana',     'cliente123',     'cliente',    2,    NULL);
    END IF;
END //
DELIMITER ;
CALL sp_aux_semilla_usuarios();
DROP PROCEDURE sp_aux_semilla_usuarios;

-- Los pedidos de ejemplo del avance 1 (marzo) que quedaron abiertos se cierran,
-- para que la cocina y el repartidor empiecen la demostración con la cola limpia.
UPDATE pedidos SET estado_pedido = 'Entregado'
WHERE estado_pedido <> 'Entregado' AND fecha_hora < DATE_SUB(CURDATE(), INTERVAL 1 DAY);
UPDATE repartidores SET estado = 'Disponible' WHERE estado = 'Ocupado';

-- Costo de insumos para los detalles del avance 1
UPDATE detalle_pedidos SET costo_insumos = fn_costo_platillo(id_platillo) * cantidad WHERE costo_insumos = 0;

-- ----------------------------------------------------------------------------
-- 8. VERIFICACIÓN
-- ----------------------------------------------------------------------------
SELECT usuario, rol, id_cliente, id_repartidor FROM usuarios;
-- El menú, las recetas, los descuentos y el historial de ventas se cargan en 03_menu_cafeteria.sql
