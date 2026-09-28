-- ============================================================================
-- AROMA A CAFÉ CO. — MENÚ DE LA CAFETERÍA
-- ----------------------------------------------------------------------------
-- Ejecutar DESPUÉS de 02_ampliacion_app.sql.
--
-- Deja el catálogo con las 4 categorías (Bebidas, Comidas, Desayunos, Postres)
-- y los 28 productos del menú. En una base que ya se usaba:
--   * elimina las categorías y productos que ya no forman parte del menú
--     (con sus renglones de venta; los pedidos que queden vacíos se borran),
--   * renombra "Latte Frío de Vainilla" → "Latte" y "Agua de Horchata 1L" →
--     "Agua de Horchata" para conservar su historial de ventas,
--   * agrega los productos, ingredientes y recetas que falten.
-- Se puede ejecutar varias veces: no duplica datos, no cambia los precios que
-- ya editaste en el panel y no borra los productos que agregues después.
-- ============================================================================

USE AROMA_CAFE_db;
SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- 1. CATEGORÍAS DEL MENÚ
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS tmp_categorias;
CREATE TABLE tmp_categorias (nombre VARCHAR(50) PRIMARY KEY, descripcion TEXT);
INSERT INTO tmp_categorias VALUES
('Bebidas', 'Café de especialidad, tés, malteadas y bebidas frías'),
('Comidas', 'Platos fuertes y opciones saladas para la comida'),
('Desayunos', 'Desayunos mexicanos y de cafetería'),
('Postres', 'Pan dulce y postres caseros individuales');

INSERT INTO categorias (nombre_categoria, descripcion)
SELECT t.nombre, t.descripcion FROM tmp_categorias t
WHERE NOT EXISTS (SELECT 1 FROM categorias c WHERE c.nombre_categoria = t.nombre);

UPDATE categorias c JOIN tmp_categorias t ON t.nombre = c.nombre_categoria
SET c.descripcion = t.descripcion;

-- ----------------------------------------------------------------------------
-- 2. PRODUCTOS QUE CAMBIAN DE NOMBRE (conservan su historial)
-- ----------------------------------------------------------------------------
UPDATE platillos SET nombre_platillo = 'Latte', precio_unitario = 62.00,
       descripcion = 'Espresso con leche vaporizada y arte latte'
WHERE nombre_platillo = 'Latte Frío de Vainilla'
  AND NOT EXISTS (SELECT 1 FROM (SELECT nombre_platillo FROM platillos) x WHERE x.nombre_platillo = 'Latte');

UPDATE platillos SET nombre_platillo = 'Agua de Horchata', precio_unitario = 45.00,
       descripcion = 'Agua fresca de arroz con canela'
WHERE nombre_platillo = 'Agua de Horchata 1L'
  AND NOT EXISTS (SELECT 1 FROM (SELECT nombre_platillo FROM platillos) x WHERE x.nombre_platillo = 'Agua de Horchata');

-- ----------------------------------------------------------------------------
-- 3. PRODUCTOS Y CATEGORÍAS QUE SALEN DEL MENÚ
-- ----------------------------------------------------------------------------
-- Todo lo que no pertenece a las 4 categorías del menú, más los productos de
-- versiones anteriores que ya no se venden.
DROP TABLE IF EXISTS tmp_platillos_borrar;
CREATE TABLE tmp_platillos_borrar (id_platillo INT PRIMARY KEY);
INSERT INTO tmp_platillos_borrar
SELECT p.id_platillo
FROM platillos p JOIN categorias c ON c.id_categoria = p.id_categoria
WHERE c.nombre_categoria NOT IN (SELECT nombre FROM tmp_categorias)
   OR p.nombre_platillo IN ('Café de Olla', 'Latte Frío de Vainilla', 'Agua de Horchata 1L');

-- Pedidos que tenían alguno de esos productos
DROP TABLE IF EXISTS tmp_pedidos_afectados;
CREATE TABLE tmp_pedidos_afectados (id_pedido INT PRIMARY KEY);
INSERT IGNORE INTO tmp_pedidos_afectados
SELECT d.id_pedido FROM detalle_pedidos d JOIN tmp_platillos_borrar b ON b.id_platillo = d.id_platillo;

-- Ingredientes que usaban esos productos (se revisan al final por si quedan sin uso)
DROP TABLE IF EXISTS tmp_ingredientes_revisar;
CREATE TABLE tmp_ingredientes_revisar (id_ingrediente INT PRIMARY KEY);
INSERT IGNORE INTO tmp_ingredientes_revisar
SELECT r.id_ingrediente FROM receta_platillo r JOIN tmp_platillos_borrar b ON b.id_platillo = r.id_platillo;

-- Se quitan esos renglones de venta y se recalcula el total de cada pedido
DELETE d FROM detalle_pedidos d JOIN tmp_platillos_borrar b ON b.id_platillo = d.id_platillo;

UPDATE pedidos p JOIN tmp_pedidos_afectados a ON a.id_pedido = p.id_pedido
SET p.total_pedido = fn_calcular_total_pedido(p.id_pedido);

-- Pedidos que se quedaron sin ningún producto (su seguimiento se borra en cascada)
DELETE p FROM pedidos p JOIN tmp_pedidos_afectados a ON a.id_pedido = p.id_pedido
WHERE NOT EXISTS (SELECT 1 FROM detalle_pedidos d WHERE d.id_pedido = p.id_pedido);

-- Productos (sus recetas y descuentos se borran en cascada) y categorías
DELETE p FROM platillos p JOIN tmp_platillos_borrar b ON b.id_platillo = p.id_platillo;
DELETE FROM categorias WHERE nombre_categoria NOT IN (SELECT nombre FROM tmp_categorias);

-- (Los ingredientes que solo usaban los productos retirados se borran en el paso 4)

-- ----------------------------------------------------------------------------
-- 4. INGREDIENTES
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS tmp_ingredientes;
CREATE TABLE tmp_ingredientes (nombre VARCHAR(100) PRIMARY KEY, stock DECIMAL(10,2), unidad VARCHAR(20), costo DECIMAL(10,2));
INSERT INTO tmp_ingredientes VALUES
('Café de Grano',          8.00,  'Kg', 320.00),
('Leche Entera',          40.00,  'L',   26.00),
('Helado de Vainilla',     8.00,  'Kg', 140.00),
('Chocolate Semiamargo',   6.00,  'Kg', 280.00),
('Fresas',                 5.00,  'Kg',  70.00),
('Té Matcha',              0.50,  'Kg', 1600.00),
('Concentrado de Chai',    4.00,  'L',  220.00),
('Jarabe de Frutos Rojos', 3.00,  'L',  180.00),
('Frutos Rojos',           4.00,  'Kg', 160.00),
('Arroz',                 10.00,  'Kg',  28.00),
('Canela',                 1.00,  'Kg', 300.00),
('Tortilla de Maíz',      12.00,  'Kg',  24.00),
('Masa de Maíz',          15.00,  'Kg',  22.00),
('Totopos',               10.00,  'Kg',  60.00),
('Pechuga de Pollo',      15.00,  'Kg', 140.00),
('Huevo',                180.00,  'Pza',  3.50),
('Jitomate',               8.00,  'Kg',  30.00),
('Queso Fresco',           6.00,  'Kg', 130.00),
('Queso Cheddar',          4.00,  'Kg', 180.00),
('Queso Crema',            6.00,  'Kg', 150.00),
('Crema',                  5.00,  'L',   70.00),
('Frijoles',               6.00,  'Kg',  35.00),
('Chorizo',                3.00,  'Kg', 160.00),
('Aguacate',               4.00,  'Kg',  80.00),
('Pan de Caja',            6.00,  'Kg',  60.00),
('Jamón',                  4.00,  'Kg', 150.00),
('Mantequilla',            4.00,  'Kg', 190.00),
('Harina de Trigo',      100.00,  'Kg',  18.00),
('Nuez',                   2.00,  'Kg', 320.00),
('Cajeta',                 3.00,  'Kg', 120.00);

INSERT INTO ingredientes (nombre_ingrediente, stock_actual, unidad_medida, costo_unitario)
SELECT t.nombre, t.stock, t.unidad, t.costo FROM tmp_ingredientes t
WHERE NOT EXISTS (SELECT 1 FROM ingredientes i WHERE i.nombre_ingrediente = t.nombre);

-- Ingredientes que solo usaban los productos retirados y no forman parte del menú
DELETE i FROM ingredientes i
JOIN tmp_ingredientes_revisar x ON x.id_ingrediente = i.id_ingrediente
WHERE i.nombre_ingrediente NOT IN (SELECT nombre FROM tmp_ingredientes)
  AND NOT EXISTS (SELECT 1 FROM receta_platillo r WHERE r.id_ingrediente = i.id_ingrediente);

-- ----------------------------------------------------------------------------
-- 5. PRODUCTOS DEL MENÚ
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS tmp_menu;
CREATE TABLE tmp_menu (
    nombre VARCHAR(100) PRIMARY KEY,
    categoria VARCHAR(50),
    precio DECIMAL(10,2),
    descripcion TEXT,
    imagen VARCHAR(255),       -- NULL: el administrador sube la foto desde el panel
    opciones VARCHAR(255)
);
INSERT INTO tmp_menu VALUES
-- Bebidas
('Expreso',                'Bebidas', 38.00, 'Shot doble de espresso de grano de altura', NULL, NULL),
('Americano',              'Bebidas', 45.00, 'Espresso alargado con agua caliente', NULL, NULL),
('Latte',                  'Bebidas', 62.00, 'Espresso con leche vaporizada y arte latte', NULL, NULL),
('Cappuccino',             'Bebidas', 62.00, 'Espresso, leche y abundante espuma con un toque de canela', NULL, NULL),
('Malteada',               'Bebidas', 85.00, 'Helado batido con leche y crema batida. Elige tu sabor', NULL, 'Vainilla,Chocolate,Fresa'),
('Frappé',                 'Bebidas', 79.00, 'Café frío licuado con hielo, crema batida y caramelo', NULL, NULL),
('Matcha',                 'Bebidas', 72.00, 'Té verde matcha batido con leche', NULL, NULL),
('Chai',                   'Bebidas', 68.00, 'Té negro especiado con canela, cardamomo y leche', NULL, NULL),
('Soda Italiana',          'Bebidas', 65.00, 'Agua mineral con jarabe de frutos rojos y un toque de crema', NULL, NULL),
('Tisana de Frutos Rojos', 'Bebidas', 55.00, 'Infusión caliente de frutos rojos, hibisco y manzana', NULL, NULL),
('Agua de Horchata',       'Bebidas', 45.00, 'Agua fresca de arroz con canela', NULL, NULL),
-- Comidas
('Enchiladas Suizas',      'Comidas', 165.00, 'Tortillas rellenas de pollo bañadas en salsa verde con crema, gratinadas', NULL, NULL),
('Croissant',              'Comidas', 58.00, 'Croissant de mantequilla recién horneado', NULL, NULL),
('Club Sándwich',          'Comidas', 145.00, 'Pan de caja tostado en tres pisos con jamón, pollo, queso, lechuga y jitomate', NULL, NULL),
-- Desayunos
('Chilaquiles Verdes con Pollo', 'Desayunos', 135.00, 'Totopos en salsa verde con crema, queso, cebolla y pollo deshebrado', NULL, NULL),
('Huevos Divorciados',     'Desayunos', 110.00, 'Dos huevos estrellados con salsa roja y salsa verde, con frijoles', NULL, NULL),
('Huevos a la Mexicana',   'Desayunos', 105.00, 'Huevo revuelto con jitomate, cebolla y chile serrano, con frijoles', NULL, NULL),
('Empanadas',              'Desayunos', 90.00, 'Tres empanadas de masa de maíz rellenas de queso, con salsa', NULL, NULL),
('Tostadas',               'Desayunos', 95.00, 'Tres tostadas de tinga de pollo con frijol, lechuga, crema y queso', NULL, NULL),
('Picadas',                'Desayunos', 85.00, 'Cuatro picadas de masa con salsa roja y verde, queso y cebolla', NULL, NULL),
('Picada de la Casa',      'Desayunos', 115.00, 'Picada grande con salsa, huevo estrellado, chorizo y aguacate', NULL, NULL),
-- Postres
('Bomba (Concha)',         'Postres', 35.00, 'Concha rellena de nata con cubierta de vainilla o chocolate', NULL, NULL),
('Pastel de Chocolate',    'Postres', 85.00, 'Rebanada de pastel húmedo de chocolate', NULL, NULL),
('Cheesecake de Frutos Rojos', 'Postres', 79.00, 'Rebanada de pastel de queso con mermelada artesanal de frutos rojos', NULL, NULL),
('Cheesecake Tortuga',     'Postres', 89.00, 'Pastel de queso con chocolate, cajeta y nuez', NULL, NULL),
('Pastel Red Velvet',      'Postres', 89.00, 'Bizcocho de terciopelo rojo con betún de queso crema', NULL, NULL),
('Tiramisú',               'Postres', 92.00, 'Soletas bañadas en café con crema de mascarpone y cacao', NULL, NULL),
('Brownie',                'Postres', 55.00, 'Brownie de chocolate semiamargo con nuez', NULL, NULL);

-- Agrega los que faltan
INSERT INTO platillos (nombre_platillo, descripcion, precio_unitario, id_categoria, disponible, imagen_url, opciones)
SELECT m.nombre, m.descripcion, m.precio, c.id_categoria, TRUE, m.imagen, m.opciones
FROM tmp_menu m JOIN categorias c ON c.nombre_categoria = m.categoria
WHERE NOT EXISTS (SELECT 1 FROM platillos p WHERE p.nombre_platillo = m.nombre);

-- Actualiza los que ya existían: categoría, opciones y visibles en el menú.
-- Las fotos las sube el administrador desde el panel (quedan en /uploads/...);
-- las imágenes de ejemplo de versiones anteriores (/img/...) se quitan y el
-- producto muestra el ícono de su categoría hasta que se le suba una foto.
UPDATE platillos p
JOIN tmp_menu m ON m.nombre = p.nombre_platillo
JOIN categorias c ON c.nombre_categoria = m.categoria
SET p.id_categoria = c.id_categoria,
    p.opciones = m.opciones,
    p.disponible = TRUE,
    p.eliminado = FALSE,
    p.descripcion = IFNULL(p.descripcion, m.descripcion),
    p.imagen_url = CASE WHEN p.imagen_url IS NULL OR p.imagen_url LIKE '/img/%' THEN m.imagen ELSE p.imagen_url END;

-- ----------------------------------------------------------------------------
-- 6. RECETAS (cantidad por porción; se descuentan del inventario al vender)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS tmp_recetas;
CREATE TABLE tmp_recetas (
    platillo VARCHAR(100),
    ingrediente VARCHAR(100),
    cantidad DECIMAL(10,3)
);
INSERT INTO tmp_recetas VALUES
('Expreso', 'Café de Grano', 0.018),
('Americano', 'Café de Grano', 0.018),
('Latte', 'Café de Grano', 0.018), ('Latte', 'Leche Entera', 0.250),
('Cappuccino', 'Café de Grano', 0.018), ('Cappuccino', 'Leche Entera', 0.180), ('Cappuccino', 'Canela', 0.001),
('Malteada', 'Helado de Vainilla', 0.200), ('Malteada', 'Leche Entera', 0.200),
('Frappé', 'Café de Grano', 0.020), ('Frappé', 'Leche Entera', 0.200), ('Frappé', 'Cajeta', 0.020),
('Matcha', 'Té Matcha', 0.004), ('Matcha', 'Leche Entera', 0.250),
('Chai', 'Concentrado de Chai', 0.080), ('Chai', 'Leche Entera', 0.200),
('Soda Italiana', 'Jarabe de Frutos Rojos', 0.040), ('Soda Italiana', 'Crema', 0.020),
('Tisana de Frutos Rojos', 'Frutos Rojos', 0.050),
('Agua de Horchata', 'Arroz', 0.050), ('Agua de Horchata', 'Leche Entera', 0.100), ('Agua de Horchata', 'Canela', 0.002),
('Enchiladas Suizas', 'Tortilla de Maíz', 0.120), ('Enchiladas Suizas', 'Pechuga de Pollo', 0.150), ('Enchiladas Suizas', 'Crema', 0.040),
('Croissant', 'Harina de Trigo', 0.080), ('Croissant', 'Mantequilla', 0.030),
('Club Sándwich', 'Pan de Caja', 0.120), ('Club Sándwich', 'Jamón', 0.060), ('Club Sándwich', 'Pechuga de Pollo', 0.060),
('Club Sándwich', 'Queso Cheddar', 0.030), ('Club Sándwich', 'Jitomate', 0.040),
('Chilaquiles Verdes con Pollo', 'Totopos', 0.150), ('Chilaquiles Verdes con Pollo', 'Pechuga de Pollo', 0.120),
('Chilaquiles Verdes con Pollo', 'Crema', 0.030), ('Chilaquiles Verdes con Pollo', 'Queso Fresco', 0.030),
('Huevos Divorciados', 'Huevo', 2), ('Huevos Divorciados', 'Tortilla de Maíz', 0.060), ('Huevos Divorciados', 'Frijoles', 0.080),
('Huevos a la Mexicana', 'Huevo', 2), ('Huevos a la Mexicana', 'Jitomate', 0.060), ('Huevos a la Mexicana', 'Frijoles', 0.080),
('Empanadas', 'Masa de Maíz', 0.150), ('Empanadas', 'Queso Fresco', 0.060),
('Tostadas', 'Tortilla de Maíz', 0.090), ('Tostadas', 'Pechuga de Pollo', 0.090), ('Tostadas', 'Frijoles', 0.060), ('Tostadas', 'Crema', 0.030),
('Picadas', 'Masa de Maíz', 0.160), ('Picadas', 'Queso Fresco', 0.040),
('Picada de la Casa', 'Masa de Maíz', 0.100), ('Picada de la Casa', 'Huevo', 1), ('Picada de la Casa', 'Chorizo', 0.040), ('Picada de la Casa', 'Aguacate', 0.050),
('Bomba (Concha)', 'Harina de Trigo', 0.080), ('Bomba (Concha)', 'Mantequilla', 0.015), ('Bomba (Concha)', 'Crema', 0.030),
('Pastel de Chocolate', 'Chocolate Semiamargo', 0.060), ('Pastel de Chocolate', 'Harina de Trigo', 0.080), ('Pastel de Chocolate', 'Huevo', 1),
('Cheesecake de Frutos Rojos', 'Queso Crema', 0.100), ('Cheesecake de Frutos Rojos', 'Frutos Rojos', 0.030), ('Cheesecake de Frutos Rojos', 'Harina de Trigo', 0.040),
('Cheesecake Tortuga', 'Queso Crema', 0.100), ('Cheesecake Tortuga', 'Chocolate Semiamargo', 0.030), ('Cheesecake Tortuga', 'Cajeta', 0.030), ('Cheesecake Tortuga', 'Nuez', 0.015),
('Pastel Red Velvet', 'Harina de Trigo', 0.080), ('Pastel Red Velvet', 'Queso Crema', 0.050), ('Pastel Red Velvet', 'Huevo', 1),
('Tiramisú', 'Queso Crema', 0.080), ('Tiramisú', 'Café de Grano', 0.010), ('Tiramisú', 'Harina de Trigo', 0.040),
('Brownie', 'Chocolate Semiamargo', 0.050), ('Brownie', 'Harina de Trigo', 0.040), ('Brownie', 'Nuez', 0.010);

INSERT IGNORE INTO receta_platillo (id_platillo, id_ingrediente, cantidad_requerida)
SELECT p.id_platillo, i.id_ingrediente, r.cantidad
FROM tmp_recetas r
JOIN platillos p ON p.nombre_platillo = r.platillo
JOIN ingredientes i ON i.nombre_ingrediente = r.ingrediente;

-- ----------------------------------------------------------------------------
-- 7. DESCUENTOS DE EJEMPLO (solo si no hay ninguno)
-- ----------------------------------------------------------------------------
INSERT INTO descuentos (nombre, porcentaje, id_categoria, fecha_inicio, fecha_fin, dias_semana, hora_inicio, hora_fin)
SELECT 'Mañanas de café', 15, c.id_categoria, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 60 DAY), '2,3,4,5,6', '07:00:00', '11:00:00'
FROM categorias c
WHERE c.nombre_categoria = 'Bebidas' AND NOT EXISTS (SELECT 1 FROM descuentos);

INSERT INTO descuentos (nombre, porcentaje, id_platillo, fecha_inicio, fecha_fin)
SELECT 'Semana del chocolate', 10, p.id_platillo, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY)
FROM platillos p
WHERE p.nombre_platillo = 'Pastel de Chocolate' AND (SELECT COUNT(*) FROM descuentos) = 1;

-- ----------------------------------------------------------------------------
-- 8. HISTORIAL DE VENTAS DE LOS ÚLTIMOS 45 DÍAS
--    Solo si la base no tiene ventas recientes, para que el panel del
--    administrador muestre gráficas desde el inicio. No afecta el inventario.
-- ----------------------------------------------------------------------------
DELIMITER //
DROP PROCEDURE IF EXISTS sp_aux_generar_historial //
CREATE PROCEDURE sp_aux_generar_historial()
BEGIN
    DECLARE v_dia INT DEFAULT 45;
    DECLARE v_n INT;
    DECLARE v_i INT;
    DECLARE v_j INT;
    DECLARE v_items INT;
    DECLARE v_pedido INT;
    DECLARE v_platillo INT;
    DECLARE v_precio DECIMAL(10,2);
    DECLARE v_opciones VARCHAR(255);
    DECLARE v_opcion VARCHAR(50);
    DECLARE v_cant INT;
    DECLARE v_fecha DATETIME;

    IF (SELECT COUNT(*) FROM pedidos WHERE fecha_hora >= DATE_SUB(CURDATE(), INTERVAL 45 DAY)) = 0 THEN
        SET @omitir_inventario = 1;
        WHILE v_dia >= 1 DO
            SET v_n = 4 + FLOOR(RAND() * 7);
            SET v_i = 0;
            WHILE v_i < v_n DO
                SET v_fecha = DATE_ADD(DATE_SUB(CURDATE(), INTERVAL v_dia DAY),
                                       INTERVAL (8 * 60 + FLOOR(RAND() * 13 * 60)) MINUTE);
                INSERT INTO pedidos (fecha_hora, id_cliente, id_repartidor, estado_pedido, total_pedido,
                                     direccion_entrega, telefono_contacto)
                SELECT v_fecha, c.id_cliente, (SELECT id_repartidor FROM repartidores ORDER BY RAND() LIMIT 1),
                       'Entregado', 0, c.direccion_entrega, c.telefono
                FROM clientes c ORDER BY RAND() LIMIT 1;
                SET v_pedido = LAST_INSERT_ID();
                SET v_items = 1 + FLOOR(RAND() * 3);
                SET v_j = 0;
                WHILE v_j < v_items DO
                    SELECT id_platillo, precio_unitario, NULLIF(opciones, '') INTO v_platillo, v_precio, v_opciones
                    FROM platillos WHERE eliminado = FALSE ORDER BY RAND() LIMIT 1;
                    SET v_opcion = NULL;
                    IF v_opciones IS NOT NULL THEN
                        SET v_opcion = TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(v_opciones, ',',
                            1 + FLOOR(RAND() * (1 + LENGTH(v_opciones) - LENGTH(REPLACE(v_opciones, ',', ''))))), ',', -1));
                    END IF;
                    SET v_cant = 1 + FLOOR(RAND() * 2);
                    IF NOT EXISTS (SELECT 1 FROM detalle_pedidos WHERE id_pedido = v_pedido AND id_platillo = v_platillo) THEN
                        INSERT INTO detalle_pedidos (id_pedido, id_platillo, cantidad, precio_historico, subtotal, costo_insumos, opcion)
                        VALUES (v_pedido, v_platillo, v_cant, v_precio, v_precio * v_cant, fn_costo_platillo(v_platillo) * v_cant, v_opcion);
                    END IF;
                    SET v_j = v_j + 1;
                END WHILE;
                UPDATE pedidos SET total_pedido = fn_calcular_total_pedido(v_pedido) WHERE id_pedido = v_pedido;
                SET v_i = v_i + 1;
            END WHILE;
            SET v_dia = v_dia - 1;
        END WHILE;
        SET @omitir_inventario = 0;
    END IF;
END //
DELIMITER ;
CALL sp_aux_generar_historial();
DROP PROCEDURE sp_aux_generar_historial;

-- Costo de insumos de los renglones que aún no lo tengan
UPDATE detalle_pedidos SET costo_insumos = fn_costo_platillo(id_platillo) * cantidad WHERE costo_insumos = 0;

-- ----------------------------------------------------------------------------
-- 9. LIMPIEZA DE TABLAS AUXILIARES
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS tmp_categorias;
DROP TABLE IF EXISTS tmp_platillos_borrar;
DROP TABLE IF EXISTS tmp_pedidos_afectados;
DROP TABLE IF EXISTS tmp_ingredientes_revisar;
DROP TABLE IF EXISTS tmp_ingredientes;
DROP TABLE IF EXISTS tmp_menu;
DROP TABLE IF EXISTS tmp_recetas;

-- ----------------------------------------------------------------------------
-- 10. VERIFICACIÓN
-- ----------------------------------------------------------------------------
SELECT c.nombre_categoria AS categoria, COUNT(p.id_platillo) AS productos
FROM categorias c LEFT JOIN platillos p ON p.id_categoria = c.id_categoria AND p.eliminado = FALSE
GROUP BY c.nombre_categoria ORDER BY c.nombre_categoria;

SELECT c.nombre_categoria AS categoria, p.nombre_platillo, p.precio_unitario,
       fn_precio_final(p.id_platillo) AS precio_final, p.opciones, p.imagen_url
FROM platillos p JOIN categorias c ON c.id_categoria = p.id_categoria
WHERE p.eliminado = FALSE
ORDER BY c.nombre_categoria, p.nombre_platillo;
