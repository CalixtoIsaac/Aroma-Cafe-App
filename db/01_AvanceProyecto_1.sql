-- ============================================================================
-- PROYECTO BASE DE DATOS: DARK KITCHEN "AROMA A CAFÉ CO."
-- ============================================================================

DROP DATABASE IF EXISTS AROMA_CAFE_db;
CREATE DATABASE AROMA_CAFE_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE AROMA_CAFE_db;

-- ----------------------------------------------------------------------------
-- 1. ESTRUCTURA DDL (TABLAS, CLAVES Y RESTRICCIONES)
-- ----------------------------------------------------------------------------

-- Tabla: CATEGORIAS
CREATE TABLE categorias (
    id_categoria INT AUTO_INCREMENT PRIMARY KEY,
    nombre_categoria VARCHAR(50) NOT NULL,
    descripcion TEXT
) ENGINE=InnoDB;

-- Tabla: PLATILLOS
CREATE TABLE platillos (
    id_platillo INT AUTO_INCREMENT PRIMARY KEY,
    nombre_platillo VARCHAR(100) NOT NULL,
    descripcion TEXT,
    precio_unitario DECIMAL(10, 2) NOT NULL CHECK (precio_unitario > 0),
    id_categoria INT NOT NULL,
    disponible BOOLEAN DEFAULT TRUE,
    CONSTRAINT fk_platillos_categorias FOREIGN KEY (id_categoria) 
        REFERENCES categorias(id_categoria) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Tabla: INGREDIENTES
CREATE TABLE ingredientes (
    id_ingrediente INT AUTO_INCREMENT PRIMARY KEY,
    nombre_ingrediente VARCHAR(100) NOT NULL,
    stock_actual DECIMAL(10, 2) NOT NULL CHECK (stock_actual >= 0),
    unidad_medida VARCHAR(20) NOT NULL,
    costo_unitario DECIMAL(10, 2) NOT NULL CHECK (costo_unitario >= 0)
) ENGINE=InnoDB;

-- Tabla: RECETA_PLATILLO (Relación N:M)
CREATE TABLE receta_platillo (
    id_platillo INT NOT NULL,
    id_ingrediente INT NOT NULL,
    cantidad_requerida DECIMAL(10, 2) NOT NULL CHECK (cantidad_requerida > 0),
    PRIMARY KEY (id_platillo, id_ingrediente),
    CONSTRAINT fk_receta_platillo FOREIGN KEY (id_platillo) 
        REFERENCES platillos(id_platillo) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_receta_ingrediente FOREIGN KEY (id_ingrediente) 
        REFERENCES ingredientes(id_ingrediente) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Tabla: CLIENTES
CREATE TABLE clientes (
    id_cliente INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    ap_paterno VARCHAR(50) NOT NULL,
    ap_materno VARCHAR(50),
    telefono VARCHAR(15) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    direccion_entrega TEXT NOT NULL,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tabla: REPARTIDORES
CREATE TABLE repartidores (
    id_repartidor INT AUTO_INCREMENT PRIMARY KEY,
    nombre_repartidor VARCHAR(100) NOT NULL,
    telefono VARCHAR(15) NOT NULL,
    plataforma VARCHAR(50) NOT NULL,
    estado VARCHAR(20) DEFAULT 'Disponible'
) ENGINE=InnoDB;

-- Tabla: PEDIDOS
CREATE TABLE pedidos (
    id_pedido INT AUTO_INCREMENT PRIMARY KEY,
    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
    id_cliente INT NOT NULL,
    id_repartidor INT,
    estado_pedido VARCHAR(30) DEFAULT 'Pendiente',
    total_pedido DECIMAL(10, 2) DEFAULT 0.00 CHECK (total_pedido >= 0),
    CONSTRAINT fk_pedidos_clientes FOREIGN KEY (id_cliente) 
        REFERENCES clientes(id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_pedidos_repartidores FOREIGN KEY (id_repartidor) 
        REFERENCES repartidores(id_repartidor) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Tabla: DETALLE_PEDIDOS (Relación N:M)
CREATE TABLE detalle_pedidos (
    id_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido INT NOT NULL,
    id_platillo INT NOT NULL,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    precio_historico DECIMAL(10, 2) NOT NULL CHECK (precio_historico > 0),
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
    CONSTRAINT fk_detalle_pedidos FOREIGN KEY (id_pedido) 
        REFERENCES pedidos(id_pedido) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_detalle_platillos FOREIGN KEY (id_platillo) 
        REFERENCES platillos(id_platillo) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. DML: INSERCIÓN DE DATOS DE MUESTRA (MÍNIMO 5 REGISTROS POR TABLA)
-- ----------------------------------------------------------------------------

-- Inserción en CATEGORIAS (las 4 categorías del menú de la cafetería)
INSERT INTO categorias (nombre_categoria, descripcion) VALUES
('Bebidas', 'Café de especialidad, tés, malteadas y bebidas frías'),
('Comidas', 'Platos fuertes y opciones saladas para la comida'),
('Desayunos', 'Desayunos mexicanos y de cafetería'),
('Postres', 'Pan dulce y postres caseros individuales');

-- Inserción en PLATILLOS (5 registros)
INSERT INTO platillos (nombre_platillo, descripcion, precio_unitario, id_categoria, disponible) VALUES
('Americano', 'Espresso alargado con agua caliente', 45.00, 1, TRUE),
('Latte', 'Espresso con leche vaporizada y arte latte', 62.00, 1, TRUE),
('Chilaquiles Verdes con Pollo', 'Totopos en salsa verde con crema, queso, cebolla y pollo deshebrado', 135.00, 3, TRUE),
('Agua de Horchata', 'Agua fresca de arroz con canela', 45.00, 1, TRUE),
('Cheesecake de Frutos Rojos', 'Rebanada de pastel de queso con mermelada artesanal de frutos rojos', 79.00, 4, TRUE);

-- Inserción en INGREDIENTES (5 registros)
INSERT INTO ingredientes (nombre_ingrediente, stock_actual, unidad_medida, costo_unitario) VALUES
('Café de Grano', 8.00, 'Kg', 320.00),
('Leche Entera', 40.00, 'L', 26.00),
('Totopos', 10.00, 'Kg', 60.00),
('Queso Crema', 6.00, 'Kg', 150.00),
('Harina de Trigo', 100.00, 'Kg', 18.00);

-- Inserción en RECETA_PLATILLO (Relación N:M completa para los 5 platillos)
INSERT INTO receta_platillo (id_platillo, id_ingrediente, cantidad_requerida) VALUES
(1, 1, 0.018), -- Platillo 1 (Americano) usa 18 g de Café de Grano
(2, 1, 0.018), -- Platillo 2 (Latte) usa 18 g de Café de Grano
(2, 2, 0.250), -- Platillo 2 (Latte) usa 250 ml de Leche
(3, 3, 0.150), -- Platillo 3 (Chilaquiles) usa 150 g de Totopos
(4, 2, 0.100), -- Platillo 4 (Agua de Horchata) usa 100 ml de Leche
(5, 4, 0.100), -- Platillo 5 (Cheesecake) usa 100 g de Queso Crema
(5, 5, 0.080); -- Platillo 5 (Cheesecake) usa 80 g de Harina (base de galleta)

-- Inserción en CLIENTES (5 registros)
INSERT INTO clientes (nombre, ap_paterno, ap_materno, telefono, email, direccion_entrega) VALUES
('Carlos', 'Mendoza', 'López', '5551234567', 'carlos.mendoza@email.com', 'Av. Insurgentes Sur 123, CDMX'),
('Ana', 'García', 'Hernández', '5559876543', 'ana.garcia@email.com', 'Calle Reforma 45, Apt 3B, CDMX'),
('Luis', 'Martínez', 'Torres', '5554567890', 'luis.martinez@email.com', 'Colonia Del Valle, C. Fresnos 12, CDMX'),
('María', 'Fernández', 'Gómez', '5553332211', 'maria.fer@email.com', 'Av. Revolución 890, CDMX'),
('Jorge', 'Sánchez', 'Pérez', '5556667788', 'jorge.sanchez@email.com', 'Calle Roma Norte 202, CDMX');

-- Inserción en REPARTIDORES (5 registros)
INSERT INTO repartidores (nombre_repartidor, telefono, plataforma, estado) VALUES
('Roberto Gómez', '5551112233', 'UberEats', 'Disponible'),
('Sofía Ramírez', '5554445566', 'Rappi', 'Ocupado'),
('David López', '5557778899', 'DidiFood', 'Disponible'),
('Elena Torres', '5552223344', 'Propio', 'Disponible'),
('Miguel Ángel', '5558889900', 'UberEats', 'Inactivo');

-- Inserción en PEDIDOS (5 registros)
INSERT INTO pedidos (fecha_hora, id_cliente, id_repartidor, estado_pedido, total_pedido) VALUES
('2026-03-01 14:30:00', 1, 1, 'Entregado', 169.00),
('2026-03-01 15:10:00', 2, 2, 'En Camino', 135.00),
('2026-03-01 15:45:00', 3, 3, 'En Preparacion', 141.00),
('2026-03-01 16:00:00', 4, 4, 'Pendiente', 124.00),
('2026-03-01 16:20:00', 5, 1, 'Entregado', 62.00);

-- Inserción en DETALLE_PEDIDOS (Detalles completos para los 5 pedidos)
INSERT INTO detalle_pedidos (id_pedido, id_platillo, cantidad, precio_historico, subtotal) VALUES
(1, 1, 2, 45.00, 90.00),   -- Pedido 1: 2x Americano ($90.00)
(1, 5, 1, 79.00, 79.00),   -- Pedido 1: 1x Cheesecake ($79.00) -> Total = $169.00
(2, 3, 1, 135.00, 135.00), -- Pedido 2: 1x Chilaquiles ($135.00) -> Total = $135.00
(3, 2, 1, 62.00, 62.00),   -- Pedido 3: 1x Latte ($62.00)
(3, 5, 1, 79.00, 79.00),   -- Pedido 3: 1x Cheesecake ($79.00) -> Total = $141.00
(4, 4, 1, 45.00, 45.00),   -- Pedido 4: 1x Agua de Horchata ($45.00)
(4, 5, 1, 79.00, 79.00),   -- Pedido 4: 1x Cheesecake ($79.00) -> Total = $124.00
(5, 2, 1, 62.00, 62.00);   -- Pedido 5: 1x Latte ($62.00) -> Total = $62.00

-- ----------------------------------------------------------------------------
-- Consultar tablas
-- ----------------------------------------------------------------------------
SELECT * FROM categorias;
SELECT * FROM clientes;
SELECT * FROM detalle_pedidos;
SELECT * FROM ingredientes;
SELECT * FROM pedidos;
SELECT * FROM platillos;
SELECT * FROM receta_platillo;
SELECT * FROM repartidores;

-- ----------------------------------------------------------------------------
-- 3. FUNCIONES Y PROCEDIMIENTOS ALMACENADOS
-- ----------------------------------------------------------------------------

DELIMITER //

-- Función para calcular el valor total del pedido
CREATE FUNCTION fn_calcular_total_pedido(p_id_pedido INT)
RETURNS DECIMAL(10,2)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_total DECIMAL(10,2);
    SELECT IFNULL(SUM(subtotal), 0.00) INTO v_total
    FROM detalle_pedidos
    WHERE id_pedido = p_id_pedido;
    RETURN v_total;
END //

-- Procedimiento para registrar detalles de pedido y actualizar total
CREATE PROCEDURE sp_agregar_detalle_pedido(
    IN p_id_pedido INT,
    IN p_id_platillo INT,
    IN p_cantidad INT
)
BEGIN
    DECLARE v_precio DECIMAL(10,2);
    DECLARE v_subtotal DECIMAL(10,2);
    
    -- Obtener el precio actual del platillo
    SELECT precio_unitario INTO v_precio 
    FROM platillos 
    WHERE id_platillo = p_id_platillo;
    
    SET v_subtotal = v_precio * p_cantidad;
    
    -- Insertar en detalle
    INSERT INTO detalle_pedidos (id_pedido, id_platillo, cantidad, precio_historico, subtotal)
    VALUES (p_id_pedido, p_id_platillo, p_cantidad, v_precio, v_subtotal);
    
    -- Actualizar encabezado del pedido utilizando la función definida
    UPDATE pedidos 
    SET total_pedido = fn_calcular_total_pedido(p_id_pedido)
    WHERE id_pedido = p_id_pedido;
END //

-- Procedimiento de verificación de conectividad e integridad de datos
CREATE PROCEDURE sp_prueba_conectividad_integridad()
BEGIN
    SELECT 'Conectividad MySQL exitosa. Resumen de registros cargados:' AS Estado_Sistema;
    
    SELECT 
        (SELECT COUNT(*) FROM categorias) AS Total_Categorias,
        (SELECT COUNT(*) FROM platillos) AS Total_Platillos,
        (SELECT COUNT(*) FROM ingredientes) AS Total_Ingredientes,
        (SELECT COUNT(*) FROM receta_platillo) AS Total_Recetas,
        (SELECT COUNT(*) FROM clientes) AS Total_Clientes,
        (SELECT COUNT(*) FROM repartidores) AS Total_Repartidores,
        (SELECT COUNT(*) FROM pedidos) AS Total_Pedidos,
        (SELECT COUNT(*) FROM detalle_pedidos) AS Total_Detalles;
END //

DELIMITER ;

-- ----------------------------------------------------------------------------
-- 4. CONSULTAS DE PRUEBA Y VERIFICACIÓN DE INTEGRIDAD
-- ----------------------------------------------------------------------------

-- Ejecutar prueba de conectividad y verificación del total de registros
CALL sp_prueba_conectividad_integridad();

-- Consulta de verificación para validar que la suma de subtotales por pedido coincide con el total_pedido
SELECT 
    p.id_pedido,
    p.total_pedido AS total_registrado_pedido,
    SUM(dp.subtotal) AS suma_subtotales_detalle,
    CASE 
        WHEN p.total_pedido = SUM(dp.subtotal) THEN 'INTEGRIDAD CORRECTA'
        ELSE 'ERROR EN SUMA'
    END AS estado_integridad
FROM pedidos p
INNER JOIN detalle_pedidos dp ON p.id_pedido = dp.id_pedido
GROUP BY p.id_pedido, p.total_pedido;

-- Consulta completa con JOINs para verificar el funcionamiento lógico
SELECT 
    p.id_pedido,
    p.fecha_hora,
    CONCAT(c.nombre, ' ', c.ap_paterno) AS cliente,
    c.telefono,
    r.nombre_repartidor,
    r.plataforma,
    pl.nombre_platillo,
    dp.cantidad,
    dp.precio_historico,
    dp.subtotal,
    p.total_pedido
FROM pedidos p
INNER JOIN clientes c ON p.id_cliente = c.id_cliente
LEFT JOIN repartidores r ON p.id_repartidor = r.id_repartidor
INNER JOIN detalle_pedidos dp ON p.id_pedido = dp.id_pedido
INNER JOIN platillos pl ON dp.id_platillo = pl.id_platillo
ORDER BY p.id_pedido ASC;

