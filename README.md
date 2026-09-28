# ☕ Aroma a Café Co. — Dark Kitchen

Aplicación web de pedidos en línea para la *dark kitchen* **Aroma a Café Co.** Los clientes piden
desde el celular. La cocina prepara, el repartidor entrega y el administrador controla menú,
precios, descuentos, inventario y ventas. Todas las pantallas se actualizan **en tiempo real**
sobre una base de datos **MySQL** (`AROMA_CAFE_db`).

> Proyecto escolar de la materia de Bases de Datos. Está pensado para una demostración en clase:
> los compañeros actúan como clientes, cocina y repartidor desde sus propios dispositivos.

---

## Contenido

1. [Funciones por rol](#1-funciones-por-rol)
2. [Tecnologías](#2-tecnologías)
3. [Requisitos](#3-requisitos)
4. [Instalación](#4-instalación)
5. [Ejecución](#5-ejecución)
6. [Inicio de sesión, roles y seguridad](#6-inicio-de-sesión-roles-y-seguridad)
7. [Menú actual](#7-menú-actual)
8. [Cómo agregar o modificar productos](#8-cómo-agregar-o-modificar-productos)
9. [Estructura del proyecto](#9-estructura-del-proyecto)
10. [Base de datos](#10-base-de-datos)
11. [API REST y tiempo real](#11-api-rest-y-tiempo-real)
12. [Demostración en clase](#12-demostración-en-clase)
13. [Guía para desarrolladores](#13-guía-para-desarrolladores)
14. [Solución de problemas](#14-solución-de-problemas)

---

## 1. Funciones por rol

| Rol | Ruta | Qué puede hacer |
|---|---|---|
| **Visitante** | `/` | Ver el menú completo, buscar, filtrar y armar su carrito **sin cuenta**. Al pagar se le pide iniciar sesión o registrarse |
| **Cliente** | `/` | Todo lo del visitante · enviar pedidos · ver el catálogo con búsqueda, filtro por categoría y por rango de precio · elegir sabor (ej. Malteada) · carrito · capturar dirección, teléfono y notas · seguir su pedido en vivo en el *ticket rail* · ver su número de pedido e historial |
| **Cocina** | `/cocina` | Ver solo los pedidos *Pendiente* y *En Preparación* (con aviso sonoro al llegar uno nuevo) · marcar *Iniciar preparación* y *Listo para repartir*. No ve ni edita precios ni catálogo |
| **Repartidor** | `/repartidor` | Ver los pedidos listos y los suyos · dirección (abre Google Maps), teléfono y artículos · aceptar (pasa a *En Camino*) · confirmar la entrega escribiendo el número que le muestra el cliente |
| **Administrador** | `/admin` | Ganancias de hoy, semana y mes con comparación y utilidad · productos más vendidos · crecimiento del día · ventas de 30 días · exportar ventas a **PDF** y **Excel** · pedidos en vivo · alta, edición y baja de productos con foto, sabores y receta · edición rápida de precios · descuentos por fechas, días u horario · inventario de ingredientes · **empleados**: contratar, despedir, ver y restablecer las contraseñas de cocina y repartidores · **clientes**: solo datos básicos · supervisar las pantallas de cocina y repartidor (solo lectura) |

**Flujo de un pedido**

```
Pendiente → En Preparación → Listo → En Camino → Entregado
 (cliente)      (cocina)      (cocina) (repartidor) (repartidor valida el número)
```

La base de datos valida cada transición (`sp_cambiar_estado_pedido`). Si dos repartidores intentan
tomar el mismo pedido, solo uno lo consigue.

---

## 2. Tecnologías

| Capa | Tecnología |
|---|---|
| Interfaz | **React 19**, **TanStack Start / Router** (rutas por archivo), **TanStack Query** (datos y caché), **Tailwind CSS 4**, componentes shadcn/ui (Radix), íconos Lucide, notificaciones Sonner |
| Gráficas | Recharts |
| Servidor | **Node.js** + **Express 5** |
| Tiempo real | **Socket.IO 4** |
| Base de datos | **MySQL 8** con el driver `mysql2` (pool de conexiones y transacciones) |
| Reportes | `pdfkit` (PDF) y `exceljs` (Excel) |
| Subida de fotos | `multer` |
| Herramientas | Vite 8, TypeScript 5, ESLint, Prettier, `concurrently` |

**Estilo visual:** modo oscuro cálido tipo barra de café nocturna. Usa las tipografías **Fraunces**
(títulos y precios) y **Space Grotesk** (texto), con acento ámbar. Los colores están en `oklch` en
`src/styles.css`.

---

## 3. Requisitos

- **Node.js 20 o superior** — <https://nodejs.org> (versión LTS)
- **MySQL Server 8** (y opcionalmente MySQL Workbench)
- Un navegador moderno (Chrome, Edge, Firefox o Safari)

---

## 4. Instalación

```bash
# 1. Instalar dependencias (dentro de la carpeta del proyecto)
npm install

# 2. Configurar la conexión a MySQL
copy .env.example .env        # Windows (en macOS/Linux: cp .env.example .env)
```

Edita `.env` con tu contraseña de MySQL:

```ini
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_contraseña
DB_NAME=AROMA_CAFE_db
API_PORT=3001
```

**3. Preparar la base de datos.** Elige una opción:

| Situación | Comando | Qué hace |
|---|---|---|
| Ya tienes `AROMA_CAFE_db` y quieres conservar tus datos | `npm run db:setup` | Ejecuta `02`, `03` y `04` |
| Quieres empezar desde cero | `npm run db:reset` | ⚠ Borra la base y ejecuta `01`, `02`, `03` y `04` |

También puedes abrir los archivos de `db/` en MySQL Workbench y ejecutarlos en orden (01 → 02 → 03 → 04).

> La primera vez que arranca, el servidor genera la llave `APP_SECRET` y la guarda en `.env`.
> Sirve para cifrar las contraseñas de los empleados. **No la borres ni la cambies**: si se pierde,
> esas contraseñas ya no se podrán consultar (habría que restablecerlas desde el panel).

---

## 5. Ejecución

```bash
npm run dev
```

Este comando arranca **dos procesos** a la vez:

| Proceso | Puerto | Descripción |
|---|---|---|
| `web` (Vite) | **8080** | La página. Reenvía `/api`, `/uploads` y `/socket.io` a la API |
| `api` (Express) | 3001 | API REST + Socket.IO. Se reinicia sola al editar `server/` |

Abre **<http://localhost:8080>**.

Otros scripts:

| Script | Descripción |
|---|---|
| `npm run web` / `npm run api` | Arranca solo la página o solo la API |
| `npm run db:setup` / `npm run db:reset` | Prepara la base de datos (ver arriba) |
| `npm run build` | Compila la página (carpeta `.output/`) |
| `npm run lint` | Revisa el código con ESLint |
| `npm run format` | Da formato con Prettier |

---

## 6. Inicio de sesión, roles y seguridad

### Cuentas de prueba

Todas entran por **<http://localhost:8080/login>**. Después de iniciar sesión, cada cuenta llega sola a su sección.

| Rol | Usuario | Contraseña | Llega a |
|---|---|---|---|
| Administrador | `admin` (o botón *"¿Eres el dueño?"* y solo la contraseña maestra) | `AromaAdmin2026` | `/admin` |
| Cocina | `cocina` | `cocina123` | `/cocina` |
| Repartidor | `roberto`, `david` o `elena` | `reparto123` | `/repartidor` |
| Cliente | `carlos` o `ana` (o crear una cuenta) | `cliente123` | `/` |

### Flujo de autenticación

1. **Visitante:** cualquiera puede ver el menú y armar su carrito sin cuenta. La barra superior solo muestra *Menú* e *Iniciar sesión*.
2. **Al pagar:** si no hay sesión, el carrito ofrece *Iniciar sesión para pedir* o *Crear cuenta*. Después de entrar regresa al menú con el carrito abierto para confirmar.
3. **Login único** (`/login`): el rol lo decide la cuenta, no la página. El servidor entrega un token de sesión (7 días) que **solo sirve para ese rol**.
4. **Una sola sesión por navegador.** El dispositivo guarda solo el token. Quién es el usuario y su rol se preguntan siempre al servidor (`/auth/yo`), así que editar el almacenamiento del navegador no da acceso a otra sección.
5. **Cerrar sesión** borra la sesión en el servidor y en el navegador, y recarga la app como visitante.

### Control de acceso por rol

| Rol | Puede ver y usar | Si intenta entrar a otra sección |
|---|---|---|
| Visitante | Menú y carrito | `/cocina`, `/repartidor`, `/admin` → pantalla de inicio de sesión |
| Cliente | Menú, carrito y sus pedidos | Pantalla *Acceso restringido* (debe cerrar sesión para cambiar de cuenta) |
| Cocina | Solo `/cocina` | Si abre `/` regresa a `/cocina`; las demás → *Acceso restringido* |
| Repartidor | Solo `/repartidor` | Si abre `/` regresa a `/repartidor`; las demás → *Acceso restringido* |
| Administrador | Todo: panel, menú (consulta), y cocina y repartidor en **modo supervisión** (solo lectura) | — |

La interfaz solo oculta lo que no te corresponde. **Quien realmente decide es la API:** cada ruta
exige el rol correcto (`requiere("cocina")`, `requiere("admin")`…) y responde **401** sin sesión o
**403** con otro rol. Por ejemplo, el administrador puede *ver* la pantalla de cocina, pero no
cambiar pedidos, porque esa ruta solo acepta a la cocina.

### Contraseñas

| Cuenta | Cómo se guarda | ¿El administrador la puede ver? |
|---|---|---|
| Clientes | Solo hash **SHA-256 con sal** (`password_hash` + `salt`), irreversible | **No.** No existe en forma legible y ninguna ruta la envía |
| Administrador | Solo hash SHA-256 con sal | No |
| Cocina y repartidores | Hash SHA-256 con sal (para iniciar sesión) **y** una copia cifrada con **AES-256-GCM** en `usuarios.password_cifrada` | **Sí**, desde *Panel → Empleados* (se descifra solo cuando la pides) |

- La llave de cifrado (`APP_SECRET`) vive en el `.env` del servidor, **no en la base de datos**: una copia de la base no basta para leer esas contraseñas.
- Los triggers `trg_usuarios_proteger_insert/update` borran cualquier copia cifrada en cuentas que no sean de cocina o repartidor, así que un cliente nunca puede tener una.

### Otras protecciones

- **Límite de intentos:** 5 contraseñas incorrectas seguidas bloquean ese usuario 5 minutos (responde 429).
- **Despedir o restablecer** a un empleado cierra al instante sus sesiones abiertas: su pantalla recibe un aviso por Socket.IO y vuelve al inicio de sesión.
- **Redirección segura:** después del login solo se permite ir a rutas internas que tu rol puede ver.
- Los nombres `admin`, `cocina` y `repartidor` no se pueden usar para registrar clientes.

### Gestión de empleados (Panel → Empleados)

- **Contratar:** nombre, puesto (cocina o repartidor), teléfono, correo, plataforma (repartidores), usuario y contraseña. La contraseña se genera sola y se puede cambiar. Se crea el registro en `cocineros` o `repartidores` y su cuenta en `usuarios`.
- **Ver contraseña:** con el ícono del ojo, y copiar usuario y contraseña para entregárselos al empleado.
- **Restablecer:** asigna una contraseña nueva y cierra sus sesiones.
- **Despedir:** borra su cuenta (pierde el acceso al instante) y marca la fecha de baja. Su historial de pedidos se conserva. No se puede despedir a un repartidor con pedidos en camino.

Para cambiar la contraseña maestra del administrador:

```sql
UPDATE usuarios
SET salt = 'nuevaSal123', password_hash = fn_hash_password('MiNuevaClave', 'nuevaSal123')
WHERE usuario = 'admin';
```

---

## 7. Menú actual

El menú tiene 4 categorías y 28 productos. Todos los precios están en MXN y se pueden cambiar desde el panel.

| Categoría | Productos |
|---|---|
| **Bebidas** (11) | Expreso · Americano · Latte · Cappuccino · Malteada *(Vainilla, Chocolate o Fresa)* · Frappé · Matcha · Chai · Soda Italiana · Tisana de Frutos Rojos · Agua de Horchata |
| **Comidas** (3) | Enchiladas Suizas · Croissant · Club Sándwich |
| **Desayunos** (7) | Chilaquiles Verdes con Pollo · Huevos Divorciados · Huevos a la Mexicana · Empanadas · Tostadas · Picadas · Picada de la Casa |
| **Postres** (7) | Bomba (Concha) · Pastel de Chocolate · Cheesecake de Frutos Rojos · Cheesecake Tortuga · Pastel Red Velvet · Tiramisú · Brownie |

**Imágenes:** el proyecto no trae fotos de productos. Mientras un producto no tenga foto, el menú
muestra el **ícono de su categoría** (taza para Bebidas, sándwich para Comidas, huevo para
Desayunos y rebanada de pastel para Postres). El administrador sube las fotos reales de cada
producto desde *Panel → Platillos → Editar → Foto*.

La lista completa con precios, descripciones, imágenes y recetas está en `db/03_menu_cafeteria.sql`.

---

## 8. Cómo agregar o modificar productos

### Opción A — Desde el panel del administrador (recomendado)

1. Entra a **`/admin`** → pestaña **Platillos**.
2. **Nuevo platillo** abre un formulario con:
   - **Nombre, precio, categoría y descripción.**
   - **Foto:** súbela con el botón **Foto** (JPG, PNG o WEBP de hasta 5 MB; se guarda en la carpeta `uploads/`) o pega una URL `https://...`. Aparece al instante en el menú de los clientes. Sin foto, se muestra el ícono de la categoría.
   - **Sabores u opciones** *(opcional)*: separados por comas, por ejemplo `Vainilla, Chocolate, Fresa`. El cliente elige uno al agregarlo y la cocina lo ve como "Malteada (Fresa)".
   - **Receta** *(opcional)*: ingredientes y cantidad por porción. Con receta, cada venta descuenta el inventario y el producto aparece como *Agotado* cuando no alcanzan los ingredientes. Sin receta, no tiene límite.
   - **Visible en el menú**: para ocultarlo temporalmente sin borrarlo.
3. El **precio** también se puede cambiar directamente en la tabla (escribe y pulsa *Guardar*).
4. **Eliminar**: si el producto ya tiene ventas, se retira del menú pero se conserva en el historial (*borrado lógico*, columna `eliminado`). Así los reportes no se rompen.
5. Para una promoción usa la pestaña **Descuentos**: porcentaje por producto, por categoría o para todo el menú, entre fechas, ciertos días y/o un horario.

Todos los cambios aparecen **al instante** en los celulares de los clientes.

### Opción B — Por SQL

```sql
-- Nuevo producto
INSERT INTO platillos (nombre_platillo, descripcion, precio_unitario, id_categoria, imagen_url, opciones)
SELECT 'Mocha', 'Espresso con chocolate y leche vaporizada', 68.00, id_categoria,
       NULL, NULL   -- sin foto: se muestra el ícono de Bebidas
FROM categorias WHERE nombre_categoria = 'Bebidas';

-- Su receta (cantidad por porción, en la unidad del ingrediente)
INSERT INTO receta_platillo (id_platillo, id_ingrediente, cantidad_requerida)
SELECT p.id_platillo, i.id_ingrediente, 0.018
FROM platillos p, ingredientes i
WHERE p.nombre_platillo = 'Mocha' AND i.nombre_ingrediente = 'Café de Grano';

-- Cambiar precio o sabores
UPDATE platillos SET precio_unitario = 90 WHERE nombre_platillo = 'Malteada';
UPDATE platillos SET opciones = 'Vainilla,Chocolate,Fresa,Oreo' WHERE nombre_platillo = 'Malteada';
```

Si agregas un producto que debe venir en toda instalación nueva, añádelo también a la tabla
`tmp_menu` (y a `tmp_recetas`) de `db/03_menu_cafeteria.sql`.

### Imágenes de productos

| Dónde | Ruta en la BD | Uso |
|---|---|---|
| `uploads/` | `/uploads/...` | Fotos subidas desde el panel |
| Internet | `https://...` | Foto alojada en otro sitio (se pega la URL en el formulario) |
| — | `NULL` | Sin foto: se muestra el ícono de la categoría |

- Formatos: JPG, PNG, WEBP o SVG, idealmente **cuadradas** (se muestran en proporción 1:1), de hasta 5 MB.
- Para quitar una foto, borra la URL en el formulario del producto y guarda: vuelve a mostrarse el ícono.
- Como las fotos están en la base de datos, se respaldan y migran junto con ella.
- Si un producto no tiene imagen o el archivo falla, se muestra automáticamente un ícono de su categoría (`src/components/ImagenPlatillo.tsx`).

### Categorías

Las categorías son **Bebidas, Comidas, Desayunos y Postres** (tabla `categorias`). Para agregar una:

```sql
INSERT INTO categorias (nombre_categoria, descripcion) VALUES ('Temporada', 'Productos de temporada');
```

Aparece sola en los filtros del catálogo. Para darle un ícono propio, agrégala al objeto `iconos` en `src/components/ImagenPlatillo.tsx`.

---

## 9. Estructura del proyecto

```
aroma-cafe/
├── db/                          Scripts SQL (se ejecutan en orden)
│   ├── 01_AvanceProyecto_1.sql    Esquema base + datos de muestra (avance 1)
│   ├── 02_ampliacion_app.sql      Usuarios, sesiones, descuentos, seguimiento, funciones,
│   │                              procedimientos, triggers y vistas
│   ├── 03_menu_cafeteria.sql      Menú, ingredientes, recetas, descuentos e historial
│   └── 04_empleados_seguridad.sql Cocineros, contraseñas cifradas de empleados y triggers
├── public/
│   ├── favicon.svg / .ico         Ícono de la taza
│   └── apple-touch-icon.png
├── server/                      API (Node + Express)
│   ├── index.js                   Rutas REST, autenticación por rol y Socket.IO
│   ├── cifrado.js                 Cifrado AES-256-GCM de contraseñas de empleados
│   ├── db.js                      Pool de MySQL, transacciones y hash de contraseñas
│   ├── reportes.js                Reportes PDF y Excel
│   └── setup-db.js                Ejecuta los scripts de db/ (npm run db:setup / db:reset)
├── src/                         Interfaz (React + TanStack)
│   ├── routes/
│   │   ├── __root.tsx             Documento HTML, fuentes, íconos y notificaciones
│   │   ├── index.tsx              Menú público, carrito y seguimiento del cliente
│   │   ├── login.tsx              Inicio de sesión y registro
│   │   ├── cocina.tsx             Cola de boletas de cocina
│   │   ├── repartidor.tsx         Entregas
│   │   └── admin.tsx              Panel de administrador (pestañas)
│   ├── components/
│   │   ├── AppShell.tsx           Encabezado, navegación y estilos compartidos
│   │   ├── Acceso.tsx             Guarda por rol, acceso denegado, login y registro
│   │   ├── ImagenPlatillo.tsx     Foto del producto o ícono de su categoría
│   │   ├── admin/                 Resumen, Pedidos, Platillos, Descuentos, Inventario,
│   │   │                          Empleados y Clientes
│   │   └── ui/                    Componentes base shadcn/ui
│   ├── lib/
│   │   ├── api.ts                 Cliente HTTP y sesión única verificada por el servidor
│   │   ├── live.ts                Tiempo real (Socket.IO + React Query) y aviso sonoro
│   │   └── tipos.ts               Tipos compartidos y formato de moneda y hora
│   └── styles.css                 Paleta oklch, tipografías y animaciones
├── .env.example                 Plantilla de configuración
├── package.json
└── vite.config.ts               Puerto 8080 y proxy hacia la API
```

---

## 10. Base de datos

**Tablas**

| Tabla | Descripción |
|---|---|
| `categorias` | Bebidas, Comidas, Desayunos y Postres |
| `platillos` | Productos: precio, categoría, `imagen_url`, `opciones` (sabores), `disponible`, `eliminado` |
| `ingredientes` | Inventario: stock, unidad y costo |
| `receta_platillo` | Relación N:M producto–ingrediente con cantidad por porción |
| `clientes` | Datos de los clientes |
| `repartidores` / `cocineros` | Datos de los empleados: contacto, fecha de contratación y de baja |
| `usuarios` | Cuentas de acceso con rol (`admin`, `cocina`, `repartidor`, `cliente`): hash SHA-256 con sal, `password_cifrada` (solo empleados) y último acceso |
| `sesiones` | Tokens de inicio de sesión (7 días) |
| `pedidos` | Encabezado: estado, total, dirección, teléfono y notas |
| `detalle_pedidos` | Renglones: cantidad, precio histórico, descuento, `opcion` elegida y costo de insumos |
| `descuentos` | Porcentaje por producto, categoría o todo el menú, con fechas, días y horario |
| `seguimiento_pedidos` | Bitácora con la hora de cada cambio de estado |

**Funciones:** `fn_calcular_total_pedido`, `fn_descuento_vigente`, `fn_precio_final`,
`fn_costo_platillo`, `fn_porciones_disponibles`, `fn_hash_password`.

**Procedimientos:**
- `sp_agregar_detalle_pedido`: aplica el descuento, valida el sabor y el inventario, y guarda el costo.
- `sp_cambiar_estado_pedido`: solo permite el flujo válido de estados.
- `sp_crear_usuario`: crea una cuenta con sal aleatoria.
- `sp_prueba_conectividad_integridad`: verifica la conexión y cuenta los registros.

**Triggers:**
- `trg_detalle_descuenta_inventario`: cada venta descuenta los ingredientes de la receta.
- `trg_pedidos_seguimiento_insert` y `trg_pedidos_seguimiento_update`: registran cada estado en la bitácora.

- `trg_usuarios_proteger_insert` y `trg_usuarios_proteger_update`: solo las cuentas de cocina y repartidor pueden tener contraseña consultable.

**Vistas:** `vw_pedidos_detalle`, `vw_ventas_diarias`, `vw_platillos_mas_vendidos`, `vw_empleados`.

**Consultas útiles para mostrar en Workbench durante la demo**

```sql
USE AROMA_CAFE_db;
SELECT * FROM vw_pedidos_detalle ORDER BY id_pedido DESC LIMIT 10;
SELECT * FROM seguimiento_pedidos ORDER BY id_seguimiento DESC LIMIT 15;
SELECT nombre_ingrediente, stock_actual, unidad_medida FROM ingredientes ORDER BY stock_actual;
SELECT * FROM vw_ventas_diarias ORDER BY dia DESC LIMIT 7;
SELECT * FROM vw_platillos_mas_vendidos ORDER BY unidades DESC LIMIT 10;
```

---

## 11. API REST y tiempo real

Todas las rutas están bajo `/api` y responden JSON. Las rutas protegidas reciben el token en el
encabezado `Authorization: Bearer <token>`. Si algo falla responden `{ "error": "mensaje" }`.

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/auth/login` | — | Inicio de sesión único (`usuario`, `password`); el rol lo define la cuenta |
| POST | `/auth/admin` | — | Acceso con la contraseña maestra |
| POST | `/auth/registro` | — | Registro de cliente |
| GET | `/auth/yo` · POST `/auth/logout` | cualquiera | Sesión actual · cerrar sesión |
| GET | `/catalogo` · `/categorias` | — | Menú visible con precio final, descuento, porciones y opciones |
| POST | `/pedidos` | cliente | Crea un pedido: `items[{ id_platillo, cantidad, opcion }]`, `direccion`, `telefono`, `notas` |
| GET | `/mis-pedidos` · PUT `/mi-perfil` | cliente | Historial con seguimiento · actualizar dirección y teléfono |
| GET | `/cocina/pedidos` | cocina | Cola de pedidos |
| POST | `/cocina/pedidos/:n/estado` | cocina | `En Preparación` o `Listo` |
| GET | `/repartidor/pedidos` | repartidor | Disponibles, en camino y entregados hoy |
| POST | `/repartidor/pedidos/:n/aceptar` · `/entregar` | repartidor | Aceptar · entregar (con `numero`) |
| GET | `/admin/resumen` · `/admin/pedidos` | admin | Métricas y gráficas · pedidos en vivo |
| GET/POST/PUT/DELETE | `/admin/platillos[/:id]` | admin | CRUD de productos (incluye `opciones` y `receta`) |
| PATCH | `/admin/platillos/:id/precio` | admin | Cambio rápido de precio |
| POST | `/admin/imagen` | admin | Subir foto (campo `imagen`); se guarda en `uploads/` y devuelve `/uploads/<archivo>` |
| GET/POST/PUT/DELETE | `/admin/descuentos[/:id]` | admin | CRUD de descuentos |
| GET/POST/PUT | `/admin/ingredientes[/:id]` | admin | Inventario |
| GET | `/admin/reporte.pdf` · `.xlsx?periodo=hoy\|semana\|mes` | admin | Reportes de ventas |
| GET | `/admin/empleados` | admin | Empleados activos (sin contraseñas) |
| GET | `/admin/empleados/:id/password` | admin | Descifra y devuelve la contraseña de **un** empleado |
| POST | `/admin/empleados` | admin | Contratar (`nombre`, `puesto`, `usuario`, `password`, `telefono`, `email`, `plataforma`) |
| PUT | `/admin/empleados/:id/password` | admin | Restablecer contraseña (cierra sus sesiones) |
| DELETE | `/admin/empleados/:id` | admin | Despedir |
| GET | `/admin/clientes` | admin | Clientes: solo datos básicos |
| GET | `/salud` | — | Estado del servidor y la base |

**Eventos de Socket.IO** (servidor → todas las pantallas):

| Evento | Cuándo | Qué hace la interfaz |
|---|---|---|
| `pedidos` | Pedido nuevo o cambio de estado (`{ numero, estado, nuevo? }`) | Refresca cocina, repartidor, cliente y admin; muestra aviso |
| `catalogo` | Cambio de producto, precio, descuento o inventario | Refresca catálogo y panel |
| `empleados` | Alta, baja o cambio de contraseña de un empleado | Refresca *Panel → Empleados* |
| `sesion-revocada` | Un empleado fue despedido o se le cambió la contraseña (`{ id_usuario }`) | Esa pantalla cierra su sesión y vuelve al login |

---

## 12. Demostración en clase

1. Conecta la laptop y los celulares a la **misma red Wi-Fi** (o comparte internet desde tu celular).
2. Ejecuta `npm run dev`. En la terminal aparece la dirección de red, por ejemplo `Network: http://192.168.1.50:8080`. También la puedes ver con `ipconfig` → *Dirección IPv4*.
3. Comparte las direcciones:
   - Público y jueces → `http://192.168.1.50:8080/`
   - Repartidor → `http://192.168.1.50:8080/repartidor`
   - Cocina → `http://192.168.1.50:8080/cocina`
   - Presentador → `/login` con la contraseña maestra, en el proyector, con MySQL Workbench a un lado.
   - Cada compañero inicia sesión en `/login` con la cuenta que le corresponde. Puedes contratarlos en vivo desde *Panel → Empleados* y dictarles su usuario y contraseña.
4. La primera vez, Windows pregunta si Node.js puede usar la red: permite **Redes privadas**.

Si la red de la escuela no deja que los dispositivos se vean entre sí, usa un túnel:
`npx cloudflared tunnel --url http://localhost:8080` y comparte la URL `https://…trycloudflare.com`.

---

## 13. Guía para desarrolladores

- **Rutas nuevas:** crea un archivo en `src/routes/`. TanStack Router genera `src/routeTree.gen.ts` automáticamente (no lo edites a mano).
- **Datos:** usa `api()` de `src/lib/api.ts` (envía el token de la sesión automáticamente) dentro de `useQuery` / `useMutation` de React Query.
- **Pantallas protegidas:** envuelve el contenido en `<Protegido roles={["cocina", "admin"]}>` y protege también la ruta de la API con `requiere(...)`. La guarda de la interfaz es solo para la experiencia; la seguridad real está en el servidor.
- **Sesión en componentes:** `useSesion()` devuelve `{ estado: "cargando" | "visitante" | "activa", usuario, salir }`.
- **Tiempo real:** después de un cambio en el servidor llama a `avisar("pedidos" | "catalogo", datos)`. En la pantalla usa `useEnVivo({ pedidos: [["clave-de-consulta"]] })` para refrescar esas consultas.
- **Nuevas rutas de API:** agrégalas en `server/index.js` con `requiere("rol")` para protegerlas. Los errores de negocio se lanzan con `falla(status, "mensaje")`. Los `SIGNAL SQLSTATE '45000'` de MySQL se convierten en mensajes para el usuario.
- **Reglas de negocio en la base:** los precios con descuento, la validación de inventario y el flujo de estados viven en funciones y procedimientos de MySQL, así que se cumplen aunque se use otra interfaz.
- **Cambios de esquema:** agrégalos en `db/02_ampliacion_app.sql` (usa `sp_aux_agregar_columna` para que el script se pueda repetir). Los datos del menú van en `db/03_menu_cafeteria.sql`.
- **Estilo:** reutiliza las clases `campo`, `botonPrimario`, `botonSecundario` y `etiqueta` de `AppShell.tsx`, y los colores semánticos de Tailwind (`bg-card`, `text-accent`, `bg-ticket`, etc.). Las utilidades `snap-in`, `live-dot` y `text-flame` están en `styles.css`.
- **Calidad:** ejecuta `npm run lint` y `npx tsc --noEmit` antes de entregar.
- La interfaz se renderiza en el navegador (`defaultSsr: false` en `src/start.ts`) porque depende de la sesión guardada en el dispositivo.

---

## 14. Solución de problemas

| Síntoma | Solución |
|---|---|
| "No hay conexión con MySQL" | Revisa usuario y contraseña en `.env` y que el servicio **MySQL80** esté iniciado |
| `Unknown database 'AROMA_CAFE_db'` | Ejecuta `npm run db:reset` |
| El catálogo sale vacío o con productos viejos | Ejecuta `npm run db:setup` |
| "Elige una opción válida para…" | El producto tiene sabores: selecciona uno antes de añadirlo |
| Los celulares no cargan la página | Misma red Wi-Fi, permiso del firewall o usa el túnel |
| Sigue apareciendo el ícono anterior en la pestaña | Recarga con **Ctrl + F5** |
| "Demasiados intentos" | Se equivocaron 5 veces de contraseña: espera 5 minutos o restablécela desde *Panel → Empleados* |
| "La contraseña de esta cuenta no se puede consultar" | Se creó fuera del panel o cambió `APP_SECRET`: usa *Restablecer* |
| Quiero entrar con otra cuenta | Cierra la sesión actual (botón junto a tu nombre) y vuelve a entrar en `/login` |
| Las fuentes se ven distintas | Fraunces y Space Grotesk se cargan de Google Fonts (requiere internet) |
