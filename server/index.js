// ============================================================================
// Aroma a Café Co. — API (Express + MySQL + Socket.IO)
// ----------------------------------------------------------------------------
// Toda la información vive en MySQL (AROMA_CAFE_db). Cada vez que un pedido,
// platillo o descuento cambia, el servidor avisa por Socket.IO a todas las
// pantallas conectadas para que se actualicen al instante.
// ============================================================================
import "dotenv/config";
import express from "express";
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { Server } from "socket.io";
import { q, transaccion, hashPassword, nuevaSal, pool } from "./db.js";
import { generarExcel, generarPdf, datosReporte } from "./reportes.js";
import { cifrar, descifrar } from "./cifrado.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.API_PORT ?? 3001);
// Fotos subidas desde el panel. Van en /uploads (raíz del proyecto), FUERA de
// server/: así el reinicio automático de la API no se dispara al subir una foto.
const UPLOADS = path.join(__dirname, "..", "uploads");
const UPLOADS_ANTERIOR = path.join(__dirname, "uploads"); // versiones anteriores
fs.mkdirSync(UPLOADS, { recursive: true });

const app = express();
// Detrás del proxy de Vite: toma la IP real del cliente (para el límite de intentos)
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(UPLOADS, { maxAge: "7d" }));
app.use("/uploads", express.static(UPLOADS_ANTERIOR, { maxAge: "7d" }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

/** Avisa a todas las pantallas que algo cambió. */
function avisar(evento, datos = {}) {
  io.emit(evento, datos);
}

io.on("connection", (socket) => {
  socket.emit("hola", { conectados: io.engine.clientsCount });
});

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class ErrorApp extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const falla = (status, msg) => {
  throw new ErrorApp(status, msg);
};

const texto = (v, max = 255) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---------------------------------------------------------------------------
// Sesiones y roles
// ---------------------------------------------------------------------------
async function crearSesion(idUsuario) {
  const token = crypto.randomBytes(32).toString("hex");
  await q(
    "INSERT INTO sesiones (token, id_usuario, fecha_expira) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))",
    [token, idUsuario],
  );
  return token;
}

/** Datos de la cuenta que se envían al navegador (nunca incluye contraseñas ni hashes). */
async function usuarioPublico(idUsuario) {
  const [u] = await q(
    `SELECT u.id_usuario, u.usuario, u.rol, u.id_cliente, u.id_repartidor, u.id_cocinero,
            c.nombre, c.ap_paterno, c.ap_materno, c.telefono, c.email, c.direccion_entrega AS direccion,
            r.nombre_repartidor, k.nombre AS nombre_cocinero
     FROM usuarios u
     LEFT JOIN clientes c ON c.id_cliente = u.id_cliente
     LEFT JOIN repartidores r ON r.id_repartidor = u.id_repartidor
     LEFT JOIN cocineros k ON k.id_cocinero = u.id_cocinero
     WHERE u.id_usuario = ?`,
    [idUsuario],
  );
  if (!u) return null;
  const { nombre_repartidor, nombre_cocinero, ...resto } = u;
  const nombreMostrado =
    u.rol === "cliente"
      ? `${u.nombre} ${u.ap_paterno}`
      : u.rol === "repartidor"
        ? nombre_repartidor
        : u.rol === "cocina"
          ? (nombre_cocinero ?? "Cocina")
          : "Administrador";
  return { ...resto, nombreMostrado };
}

// ---------------------------------------------------------------------------
// Protección contra adivinar contraseñas: 5 intentos fallidos por usuario/IP
// bloquean ese usuario 5 minutos.
// ---------------------------------------------------------------------------
const intentos = new Map();
const VENTANA_MS = 5 * 60 * 1000;
function claveIntento(req, usuario) {
  return `${req.ip}|${usuario}`;
}
function revisarBloqueo(req, usuario) {
  const r = intentos.get(claveIntento(req, usuario));
  if (r && r.fallos >= 5 && Date.now() - r.desde < VENTANA_MS) {
    const min = Math.ceil((VENTANA_MS - (Date.now() - r.desde)) / 60000);
    falla(429, `Demasiados intentos. Espera ${min} min e inténtalo de nuevo.`);
  }
}
function registrarFallo(req, usuario) {
  const k = claveIntento(req, usuario);
  const r = intentos.get(k);
  if (!r || Date.now() - r.desde > VENTANA_MS) intentos.set(k, { fallos: 1, desde: Date.now() });
  else r.fallos += 1;
}

async function iniciarSesion(u, res) {
  await q("UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?", [u.id_usuario]);
  res.json({ token: await crearSesion(u.id_usuario), usuario: await usuarioPublico(u.id_usuario) });
}

function requiere(...roles) {
  return h(async (req, _res, next) => {
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : String(req.query.token ?? "");
    if (!token) falla(401, "Inicia sesión para continuar");
    const [s] = await q(
      `SELECT u.id_usuario, u.rol, u.id_cliente, u.id_repartidor
       FROM sesiones s JOIN usuarios u ON u.id_usuario = s.id_usuario
       WHERE s.token = ? AND s.fecha_expira > NOW() AND u.activo = TRUE`,
      [token],
    );
    if (!s) falla(401, "Tu sesión expiró, vuelve a iniciar sesión");
    if (roles.length && !roles.includes(s.rol)) falla(403, "No tienes permiso para esta sección");
    req.usuario = s;
    req.token = token;
    next();
  });
}

// ---------------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------------
// Un solo inicio de sesión para todos los roles: el rol lo decide la cuenta,
// no el navegador. El token que se entrega solo sirve para ese rol.
app.post(
  "/api/auth/login",
  h(async (req, res) => {
    const usuario = texto(req.body.usuario, 50).toLowerCase();
    const password = String(req.body.password ?? "");
    if (!usuario || !password) falla(400, "Escribe tu usuario y contraseña");
    revisarBloqueo(req, usuario);
    const [u] = await q("SELECT * FROM usuarios WHERE usuario = ? AND activo = TRUE", [usuario]);
    if (!u || hashPassword(password, u.salt) !== u.password_hash) {
      registrarFallo(req, usuario);
      falla(401, "Usuario o contraseña incorrectos");
    }
    intentos.delete(claveIntento(req, usuario));
    await iniciarSesion(u, res);
  }),
);

// El administrador entra solo con la contraseña maestra
app.post(
  "/api/auth/admin",
  h(async (req, res) => {
    const password = String(req.body.password ?? "");
    revisarBloqueo(req, "admin");
    const [u] = await q(
      "SELECT * FROM usuarios WHERE rol = 'admin' AND activo = TRUE ORDER BY id_usuario LIMIT 1",
    );
    if (!u || hashPassword(password, u.salt) !== u.password_hash) {
      registrarFallo(req, "admin");
      falla(401, "Contraseña maestra incorrecta");
    }
    intentos.delete(claveIntento(req, "admin"));
    await iniciarSesion(u, res);
  }),
);

app.post(
  "/api/auth/registro",
  h(async (req, res) => {
    const b = req.body ?? {};
    const datos = {
      nombre: texto(b.nombre, 50),
      ap_paterno: texto(b.ap_paterno, 50),
      ap_materno: texto(b.ap_materno, 50) || null,
      telefono: texto(b.telefono, 15).replace(/[^\d+]/g, ""),
      email: texto(b.email, 100).toLowerCase(),
      direccion: texto(b.direccion, 500),
      usuario: texto(b.usuario, 50).toLowerCase(),
      password: String(b.password ?? ""),
    };
    if (!datos.nombre || !datos.ap_paterno) falla(400, "Escribe tu nombre y apellido paterno");
    if (datos.telefono.length < 8) falla(400, "Escribe un teléfono válido");
    if (!/^\S+@\S+\.\S+$/.test(datos.email)) falla(400, "Escribe un correo válido");
    if (!datos.direccion) falla(400, "Escribe tu dirección de entrega");
    if (!/^[a-z0-9._-]{3,50}$/.test(datos.usuario))
      falla(400, "El usuario debe tener 3+ caracteres (letras, números, punto o guion)");
    if (datos.password.length < 4) falla(400, "La contraseña debe tener al menos 4 caracteres");

    if (["admin", "cocina", "repartidor"].includes(datos.usuario))
      falla(409, "Ese nombre de usuario no está disponible");
    const [dupU] = await q("SELECT 1 FROM usuarios WHERE usuario = ?", [datos.usuario]);
    if (dupU) falla(409, "Ese nombre de usuario ya existe");
    const [dupE] = await q("SELECT 1 FROM clientes WHERE email = ?", [datos.email]);
    if (dupE) falla(409, "Ya hay una cuenta con ese correo");

    const idUsuario = await transaccion(async (cx) => {
      const [c] = await cx.query(
        `INSERT INTO clientes (nombre, ap_paterno, ap_materno, telefono, email, direccion_entrega)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          datos.nombre,
          datos.ap_paterno,
          datos.ap_materno,
          datos.telefono,
          datos.email,
          datos.direccion,
        ],
      );
      const sal = nuevaSal();
      const [u] = await cx.query(
        `INSERT INTO usuarios (usuario, password_hash, salt, rol, id_cliente) VALUES (?, ?, ?, 'cliente', ?)`,
        [datos.usuario, hashPassword(datos.password, sal), sal, c.insertId],
      );
      return u.insertId;
    });
    avisar("clientes");
    res
      .status(201)
      .json({ token: await crearSesion(idUsuario), usuario: await usuarioPublico(idUsuario) });
  }),
);

app.get(
  "/api/auth/yo",
  requiere(),
  h(async (req, res) => res.json({ usuario: await usuarioPublico(req.usuario.id_usuario) })),
);

app.post(
  "/api/auth/logout",
  requiere(),
  h(async (req, res) => {
    await q("DELETE FROM sesiones WHERE token = ?", [req.token]);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Catálogo (público)
// ---------------------------------------------------------------------------
const SQL_PLATILLOS = `
  SELECT p.id_platillo AS id, p.nombre_platillo AS nombre, p.descripcion,
         p.precio_unitario AS precio, p.id_categoria, c.nombre_categoria AS categoria,
         p.disponible, p.imagen_url AS imagen, NULLIF(p.opciones, '') AS opciones,
         fn_descuento_vigente(p.id_platillo) AS descuento,
         fn_precio_final(p.id_platillo) AS precio_final,
         fn_porciones_disponibles(p.id_platillo) AS porciones,
         fn_costo_platillo(p.id_platillo) AS costo
  FROM platillos p JOIN categorias c ON c.id_categoria = p.id_categoria
  WHERE p.eliminado = FALSE`;

app.get(
  "/api/catalogo",
  h(async (_req, res) => {
    const platillos = await q(
      `${SQL_PLATILLOS} AND p.disponible = TRUE ORDER BY c.nombre_categoria, p.nombre_platillo`,
    );
    res.json(platillos.map(({ costo: _c, ...p }) => p));
  }),
);

app.get(
  "/api/categorias",
  h(async (_req, res) => {
    res.json(
      await q(
        "SELECT id_categoria AS id, nombre_categoria AS nombre, descripcion FROM categorias ORDER BY nombre_categoria",
      ),
    );
  }),
);

// ---------------------------------------------------------------------------
// Pedidos: consulta común
// ---------------------------------------------------------------------------
async function cargarPedidos(where, params = [], { limite = 100, seguimiento = false } = {}) {
  const pedidos = await q(
    `SELECT p.id_pedido AS numero, p.fecha_hora, p.estado_pedido AS estado, p.total_pedido AS total,
            p.notas, p.id_cliente, CONCAT(c.nombre, ' ', c.ap_paterno) AS cliente,
            IFNULL(p.telefono_contacto, c.telefono) AS telefono,
            IFNULL(p.direccion_entrega, c.direccion_entrega) AS direccion,
            p.id_repartidor, r.nombre_repartidor AS repartidor
     FROM pedidos p
     JOIN clientes c ON c.id_cliente = p.id_cliente
     LEFT JOIN repartidores r ON r.id_repartidor = p.id_repartidor
     WHERE ${where}
     ORDER BY p.id_pedido DESC
     LIMIT ${Number(limite)}`,
    params,
  );
  if (!pedidos.length) return [];
  const ids = pedidos.map((p) => p.numero);
  const items = await q(
    `SELECT d.id_pedido,
            CONCAT(pl.nombre_platillo, IF(d.opcion IS NULL, '', CONCAT(' (', d.opcion, ')'))) AS nombre,
            d.opcion, d.cantidad, d.precio_historico AS precio,
            d.subtotal, d.descuento_aplicado AS descuento
     FROM detalle_pedidos d JOIN platillos pl ON pl.id_platillo = d.id_platillo
     WHERE d.id_pedido IN (?) ORDER BY d.id_detalle`,
    [ids],
  );
  const pasos = seguimiento
    ? await q(
        `SELECT id_pedido, estado, fecha_hora FROM seguimiento_pedidos
         WHERE id_pedido IN (?) ORDER BY id_seguimiento`,
        [ids],
      )
    : [];
  return pedidos.map((p) => ({
    ...p,
    items: items.filter((i) => i.id_pedido === p.numero).map(({ id_pedido: _x, ...i }) => i),
    ...(seguimiento
      ? {
          seguimiento: pasos
            .filter((s) => s.id_pedido === p.numero)
            .map(({ id_pedido: _y, ...s }) => s),
        }
      : {}),
  }));
}

function errorMysql(e) {
  if (e?.sqlState === "45000") return new ErrorApp(409, e.sqlMessage);
  return e;
}

async function cambiarEstado(numero, estado, idRepartidor = null) {
  try {
    await transaccion((cx) =>
      cx.query("CALL sp_cambiar_estado_pedido(?, ?, ?)", [numero, estado, idRepartidor]),
    );
  } catch (e) {
    throw errorMysql(e);
  }
  avisar("pedidos", { numero, estado });
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------
app.post(
  "/api/pedidos",
  requiere("cliente"),
  h(async (req, res) => {
    const idCliente = req.usuario.id_cliente;
    const direccion = texto(req.body.direccion, 500);
    const telefono = texto(req.body.telefono, 15).replace(/[^\d+]/g, "");
    const notas = texto(req.body.notas, 255) || null;
    if (!direccion) falla(400, "Escribe la dirección de entrega");
    if (telefono.length < 8) falla(400, "Escribe un teléfono de contacto válido");

    // Renglones del carrito agrupados por platillo + opción (ej. Malteada de Fresa)
    const cantidades = new Map();
    for (const it of Array.isArray(req.body.items) ? req.body.items : []) {
      const id = Number(it.id_platillo);
      const cant = Math.floor(Number(it.cantidad));
      const opcion = texto(it.opcion, 50) || null;
      const clave = `${id}|${opcion ?? ""}`;
      if (id > 0 && cant > 0) {
        const previo = cantidades.get(clave);
        cantidades.set(clave, { id, opcion, cant: (previo?.cant ?? 0) + cant });
      }
    }
    if (!cantidades.size) falla(400, "Tu carrito está vacío");
    for (const c of cantidades.values())
      if (c.cant > 30) falla(400, "Máximo 30 piezas por platillo");

    let numero;
    try {
      numero = await transaccion(async (cx) => {
        const [r] = await cx.query(
          `INSERT INTO pedidos (id_cliente, estado_pedido, total_pedido, direccion_entrega, telefono_contacto, notas)
           VALUES (?, 'Pendiente', 0, ?, ?, ?)`,
          [idCliente, direccion, telefono, notas],
        );
        for (const { id, opcion, cant } of cantidades.values()) {
          await cx.query("CALL sp_agregar_detalle_pedido(?, ?, ?, ?)", [
            r.insertId,
            id,
            cant,
            opcion,
          ]);
        }
        if (req.body.guardarDatos) {
          await cx.query(
            "UPDATE clientes SET direccion_entrega = ?, telefono = ? WHERE id_cliente = ?",
            [direccion, telefono, idCliente],
          );
        }
        return r.insertId;
      });
    } catch (e) {
      throw errorMysql(e);
    }
    const [pedido] = await cargarPedidos("p.id_pedido = ?", [numero], { seguimiento: true });
    avisar("pedidos", { numero, estado: "Pendiente", nuevo: true });
    avisar("catalogo"); // el inventario cambió
    res.status(201).json(pedido);
  }),
);

app.get(
  "/api/mis-pedidos",
  requiere("cliente"),
  h(async (req, res) => {
    res.json(
      await cargarPedidos("p.id_cliente = ?", [req.usuario.id_cliente], {
        limite: 20,
        seguimiento: true,
      }),
    );
  }),
);

app.put(
  "/api/mi-perfil",
  requiere("cliente"),
  h(async (req, res) => {
    const direccion = texto(req.body.direccion, 500);
    const telefono = texto(req.body.telefono, 15).replace(/[^\d+]/g, "");
    if (!direccion || telefono.length < 8) falla(400, "Escribe dirección y teléfono válidos");
    await q("UPDATE clientes SET direccion_entrega = ?, telefono = ? WHERE id_cliente = ?", [
      direccion,
      telefono,
      req.usuario.id_cliente,
    ]);
    res.json({ usuario: await usuarioPublico(req.usuario.id_usuario) });
  }),
);

// ---------------------------------------------------------------------------
// Cocina
// ---------------------------------------------------------------------------
app.get(
  "/api/cocina/pedidos",
  requiere("cocina", "admin"),
  h(async (_req, res) => {
    const pedidos = await cargarPedidos("p.estado_pedido IN ('Pendiente', 'En Preparación')", [], {
      limite: 200,
    });
    const [{ listos }] = await q(
      "SELECT COUNT(*) AS listos FROM pedidos WHERE estado_pedido = 'Listo'",
    );
    const [{ hechosHoy }] = await q(
      `SELECT COUNT(DISTINCT id_pedido) AS hechosHoy FROM seguimiento_pedidos
       WHERE estado = 'Listo' AND DATE(fecha_hora) = CURDATE()`,
    );
    res.json({ pedidos: pedidos.reverse(), listos, hechosHoy });
  }),
);

app.post(
  "/api/cocina/pedidos/:numero/estado",
  requiere("cocina"),
  h(async (req, res) => {
    const estado = req.body.estado;
    if (!["En Preparación", "Listo"].includes(estado))
      falla(400, "Cocina solo puede marcar En Preparación o Listo");
    await cambiarEstado(Number(req.params.numero), estado);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Repartidor
// ---------------------------------------------------------------------------
app.get(
  "/api/repartidor/pedidos",
  requiere("repartidor", "admin"),
  h(async (req, res) => {
    // El administrador puede supervisar (solo lectura): ve las entregas de todos
    if (req.usuario.rol === "admin") {
      const disponibles = await cargarPedidos("p.estado_pedido = 'Listo'", [], { limite: 100 });
      const enCamino = await cargarPedidos("p.estado_pedido = 'En Camino'", [], { limite: 100 });
      const entregados = await cargarPedidos(
        `p.estado_pedido = 'Entregado'
         AND p.id_pedido IN (SELECT id_pedido FROM seguimiento_pedidos WHERE estado = 'Entregado' AND DATE(fecha_hora) = CURDATE())`,
        [],
        { limite: 100 },
      );
      return res.json({
        disponibles: disponibles.reverse(),
        enCamino,
        entregados,
        supervision: true,
      });
    }
    const yo = req.usuario.id_repartidor;
    const disponibles = await cargarPedidos("p.estado_pedido = 'Listo'", [], { limite: 100 });
    const enCamino = await cargarPedidos("p.estado_pedido = 'En Camino' AND p.id_repartidor = ?", [
      yo,
    ]);
    const entregados = await cargarPedidos(
      `p.estado_pedido = 'Entregado' AND p.id_repartidor = ?
       AND p.id_pedido IN (SELECT id_pedido FROM seguimiento_pedidos WHERE estado = 'Entregado' AND DATE(fecha_hora) = CURDATE())`,
      [yo],
      { limite: 50 },
    );
    res.json({ disponibles: disponibles.reverse(), enCamino, entregados });
  }),
);

app.post(
  "/api/repartidor/pedidos/:numero/aceptar",
  requiere("repartidor"),
  h(async (req, res) => {
    await cambiarEstado(Number(req.params.numero), "En Camino", req.usuario.id_repartidor);
    res.json({ ok: true });
  }),
);

app.post(
  "/api/repartidor/pedidos/:numero/entregar",
  requiere("repartidor"),
  h(async (req, res) => {
    const numero = Number(req.params.numero);
    const [p] = await q("SELECT id_repartidor, estado_pedido FROM pedidos WHERE id_pedido = ?", [
      numero,
    ]);
    if (!p || p.id_repartidor !== req.usuario.id_repartidor)
      falla(403, "Este pedido no está asignado a ti");
    if (String(req.body.numero ?? "").replace(/\D/g, "") !== String(numero))
      falla(400, "El número no coincide con este pedido");
    await cambiarEstado(numero, "Entregado", req.usuario.id_repartidor);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Administrador
// ---------------------------------------------------------------------------
const soloAdmin = requiere("admin");

const PERIODOS = {
  hoy: {
    actual: "DATE(p.fecha_hora) = CURDATE()",
    anterior: "DATE(p.fecha_hora) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)",
    etiqueta: "vs ayer",
  },
  semana: {
    actual: "YEARWEEK(p.fecha_hora, 1) = YEARWEEK(CURDATE(), 1)",
    anterior: "YEARWEEK(p.fecha_hora, 1) = YEARWEEK(DATE_SUB(CURDATE(), INTERVAL 7 DAY), 1)",
    etiqueta: "vs semana anterior",
  },
  mes: {
    actual: "p.fecha_hora >= DATE_FORMAT(CURDATE(), '%Y-%m-01')",
    anterior:
      "p.fecha_hora >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND p.fecha_hora < DATE_FORMAT(CURDATE(), '%Y-%m-01')",
    etiqueta: "vs mes anterior",
  },
};

async function totales(cond) {
  const [r] = await q(
    `SELECT IFNULL(SUM(d.subtotal), 0) AS ventas, IFNULL(SUM(d.costo_insumos), 0) AS costo,
            COUNT(DISTINCT p.id_pedido) AS pedidos
     FROM pedidos p JOIN detalle_pedidos d ON d.id_pedido = p.id_pedido
     WHERE p.estado_pedido = 'Entregado' AND ${cond}`,
  );
  return { ...r, utilidad: Math.round((r.ventas - r.costo) * 100) / 100 };
}

app.get(
  "/api/admin/resumen",
  soloAdmin,
  h(async (req, res) => {
    const periodoTop = PERIODOS[req.query.top] ? req.query.top : "mes";
    const metricas = {};
    for (const [k, p] of Object.entries(PERIODOS)) {
      metricas[k] = {
        ...(await totales(p.actual)),
        anterior: (await totales(p.anterior)).ventas,
        etiqueta: p.etiqueta,
      };
    }
    const [{ hoy, horaActual }] = await q("SELECT CURDATE() AS hoy, HOUR(NOW()) AS horaActual");
    const dias = await q(
      "SELECT dia, ventas, pedidos, utilidad FROM vw_ventas_diarias WHERE dia >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)",
    );
    const serie = [];
    const base = new Date(`${hoy}T12:00:00Z`);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10);
      const f = dias.find((x) => x.dia === d);
      serie.push({
        dia: d,
        ventas: f?.ventas ?? 0,
        pedidos: f?.pedidos ?? 0,
        utilidad: f?.utilidad ?? 0,
      });
    }
    const porHora = await q(
      `SELECT HOUR(p.fecha_hora) AS hora, SUM(p.total_pedido) AS ventas, COUNT(*) AS pedidos
       FROM pedidos p WHERE p.estado_pedido = 'Entregado' AND DATE(p.fecha_hora) = CURDATE()
       GROUP BY HOUR(p.fecha_hora) ORDER BY hora`,
    );
    const top = await q(
      `SELECT pl.nombre_platillo AS nombre, c.nombre_categoria AS categoria,
              SUM(d.cantidad) AS unidades, SUM(d.subtotal) AS ventas
       FROM detalle_pedidos d
       JOIN pedidos p ON p.id_pedido = d.id_pedido
       JOIN platillos pl ON pl.id_platillo = d.id_platillo
       JOIN categorias c ON c.id_categoria = pl.id_categoria
       WHERE p.estado_pedido = 'Entregado' AND ${PERIODOS[periodoTop].actual}
       GROUP BY pl.id_platillo, pl.nombre_platillo, c.nombre_categoria
       ORDER BY unidades DESC, ventas DESC LIMIT 8`,
    );
    const estados = await q(
      `SELECT estado_pedido AS estado, COUNT(*) AS pedidos, SUM(total_pedido) AS monto
       FROM pedidos WHERE estado_pedido <> 'Entregado' GROUP BY estado_pedido`,
    );
    res.json({ metricas, serie, porHora, top, periodoTop, estados, horaActual });
  }),
);

app.get(
  "/api/admin/pedidos",
  soloAdmin,
  h(async (_req, res) => {
    res.json(
      await cargarPedidos(
        "(DATE(p.fecha_hora) = CURDATE() OR p.estado_pedido <> 'Entregado')",
        [],
        { limite: 150 },
      ),
    );
  }),
);

// --- Platillos (CRUD) ---
app.get(
  "/api/admin/platillos",
  soloAdmin,
  h(async (_req, res) => {
    const platillos = await q(`${SQL_PLATILLOS} ORDER BY c.nombre_categoria, p.nombre_platillo`);
    const recetas = await q(
      `SELECT r.id_platillo, r.id_ingrediente, i.nombre_ingrediente AS nombre, r.cantidad_requerida AS cantidad, i.unidad_medida AS unidad
       FROM receta_platillo r JOIN ingredientes i ON i.id_ingrediente = r.id_ingrediente`,
    );
    const vendidos = await q(
      `SELECT d.id_platillo, SUM(d.cantidad) AS vendidos FROM detalle_pedidos d
       JOIN pedidos p ON p.id_pedido = d.id_pedido WHERE p.estado_pedido = 'Entregado' GROUP BY d.id_platillo`,
    );
    res.json(
      platillos.map((p) => ({
        ...p,
        receta: recetas.filter((r) => r.id_platillo === p.id).map(({ id_platillo: _z, ...r }) => r),
        vendidos: vendidos.find((v) => v.id_platillo === p.id)?.vendidos ?? 0,
      })),
    );
  }),
);

function leerPlatillo(b) {
  const d = {
    nombre: texto(b.nombre, 100),
    descripcion: texto(b.descripcion, 1000) || null,
    precio: Number(b.precio),
    id_categoria: Number(b.id_categoria),
    disponible: b.disponible !== false,
    imagen: texto(b.imagen, 255) || null,
    // "Vainilla, Chocolate ,Fresa" → "Vainilla,Chocolate,Fresa"; undefined = no cambiar
    opciones:
      b.opciones === undefined
        ? undefined
        : texto(b.opciones, 255)
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
            .join(",") || null,
    receta: Array.isArray(b.receta) ? b.receta : [],
  };
  if (!d.nombre) falla(400, "El platillo necesita un nombre");
  if (!(d.precio > 0)) falla(400, "El precio debe ser mayor a 0");
  if (!(d.id_categoria > 0)) falla(400, "Elige una categoría");
  return d;
}

async function guardarReceta(cx, idPlatillo, receta) {
  await cx.query("DELETE FROM receta_platillo WHERE id_platillo = ?", [idPlatillo]);
  const vistos = new Set();
  for (const r of receta) {
    const idIng = Number(r.id_ingrediente);
    const cant = Number(r.cantidad);
    if (idIng > 0 && cant > 0 && !vistos.has(idIng)) {
      vistos.add(idIng);
      await cx.query(
        "INSERT INTO receta_platillo (id_platillo, id_ingrediente, cantidad_requerida) VALUES (?, ?, ?)",
        [idPlatillo, idIng, cant],
      );
    }
  }
}

app.post(
  "/api/admin/platillos",
  soloAdmin,
  h(async (req, res) => {
    const d = leerPlatillo(req.body ?? {});
    const id = await transaccion(async (cx) => {
      const [r] = await cx.query(
        `INSERT INTO platillos (nombre_platillo, descripcion, precio_unitario, id_categoria, disponible, imagen_url, opciones)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          d.nombre,
          d.descripcion,
          d.precio,
          d.id_categoria,
          d.disponible,
          d.imagen,
          d.opciones ?? null,
        ],
      );
      await guardarReceta(cx, r.insertId, d.receta);
      return r.insertId;
    });
    avisar("catalogo");
    res.status(201).json({ id });
  }),
);

app.put(
  "/api/admin/platillos/:id",
  soloAdmin,
  h(async (req, res) => {
    const id = Number(req.params.id);
    const d = leerPlatillo(req.body ?? {});
    await transaccion(async (cx) => {
      await cx.query(
        `UPDATE platillos SET nombre_platillo = ?, descripcion = ?, precio_unitario = ?, id_categoria = ?,
                disponible = ?, imagen_url = ? WHERE id_platillo = ?`,
        [d.nombre, d.descripcion, d.precio, d.id_categoria, d.disponible, d.imagen, id],
      );
      if (d.opciones !== undefined)
        await cx.query("UPDATE platillos SET opciones = ? WHERE id_platillo = ?", [d.opciones, id]);
      if (Array.isArray(req.body.receta)) await guardarReceta(cx, id, d.receta);
    });
    avisar("catalogo");
    res.json({ ok: true });
  }),
);

// Precio rápido desde la tabla
app.patch(
  "/api/admin/platillos/:id/precio",
  soloAdmin,
  h(async (req, res) => {
    const precio = Number(req.body.precio);
    if (!(precio > 0)) falla(400, "El precio debe ser mayor a 0");
    await q("UPDATE platillos SET precio_unitario = ? WHERE id_platillo = ?", [
      precio,
      Number(req.params.id),
    ]);
    avisar("catalogo");
    res.json({ ok: true });
  }),
);

app.delete(
  "/api/admin/platillos/:id",
  soloAdmin,
  h(async (req, res) => {
    const id = Number(req.params.id);
    const [{ usos }] = await q(
      "SELECT COUNT(*) AS usos FROM detalle_pedidos WHERE id_platillo = ?",
      [id],
    );
    if (usos > 0) {
      // Tiene ventas: se conserva para el historial pero deja de mostrarse
      await q("UPDATE platillos SET eliminado = TRUE, disponible = FALSE WHERE id_platillo = ?", [
        id,
      ]);
    } else {
      await q("DELETE FROM platillos WHERE id_platillo = ?", [id]);
    }
    avisar("catalogo");
    res.json({ ok: true, logico: usos > 0 });
  }),
);

// --- Fotos de productos ---
// Se guardan en la carpeta uploads/ y se sirven en /uploads/<archivo>.
const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const subir = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `platillo-${Date.now()}-${crypto.randomBytes(3).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, TIPOS_IMAGEN.includes(file.mimetype)),
});

app.post(
  "/api/admin/imagen",
  soloAdmin,
  (req, res, next) =>
    subir.single("imagen")(req, res, (err) =>
      err?.code === "LIMIT_FILE_SIZE"
        ? next(new ErrorApp(400, "La foto pesa más de 5 MB"))
        : next(err),
    ),
  h(async (req, res) => {
    if (!req.file) falla(400, "Sube una foto JPG, PNG o WEBP de hasta 5 MB");
    res.json({ url: `/uploads/${req.file.filename}` });
  }),
);

// --- Descuentos ---
app.get(
  "/api/admin/descuentos",
  soloAdmin,
  h(async (_req, res) => {
    res.json(
      await q(
        `SELECT d.id_descuento AS id, d.nombre, d.porcentaje, d.id_platillo, d.id_categoria,
                pl.nombre_platillo AS platillo, c.nombre_categoria AS categoria,
                d.fecha_inicio, d.fecha_fin, d.dias_semana, d.hora_inicio, d.hora_fin, d.activo,
                (d.activo AND CURDATE() BETWEEN d.fecha_inicio AND d.fecha_fin
                  AND (d.dias_semana IS NULL OR d.dias_semana = '' OR FIND_IN_SET(DAYOFWEEK(CURDATE()), d.dias_semana) > 0)
                  AND (d.hora_inicio IS NULL OR d.hora_fin IS NULL OR CURTIME() BETWEEN d.hora_inicio AND d.hora_fin)
                ) AS vigente
         FROM descuentos d
         LEFT JOIN platillos pl ON pl.id_platillo = d.id_platillo
         LEFT JOIN categorias c ON c.id_categoria = d.id_categoria
         ORDER BY d.fecha_fin DESC, d.id_descuento DESC`,
      ),
    );
  }),
);

function leerDescuento(b) {
  const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
  const hora = (v) => (/^\d{2}:\d{2}(:\d{2})?$/.test(String(v ?? "")) ? String(v) : null);
  const d = {
    nombre: texto(b.nombre, 80),
    porcentaje: Number(b.porcentaje),
    id_platillo: Number(b.id_platillo) > 0 ? Number(b.id_platillo) : null,
    id_categoria: Number(b.id_categoria) > 0 ? Number(b.id_categoria) : null,
    fecha_inicio: fecha(b.fecha_inicio),
    fecha_fin: fecha(b.fecha_fin),
    dias_semana:
      Array.isArray(b.dias_semana) && b.dias_semana.length
        ? b.dias_semana
            .map(Number)
            .filter((n) => n >= 1 && n <= 7)
            .join(",")
        : null,
    hora_inicio: hora(b.hora_inicio),
    hora_fin: hora(b.hora_fin),
    activo: b.activo !== false,
  };
  if (d.id_platillo) d.id_categoria = null;
  if (!d.nombre) falla(400, "Ponle un nombre al descuento");
  if (!(d.porcentaje > 0 && d.porcentaje <= 90))
    falla(400, "El porcentaje debe estar entre 1 y 90");
  if (!d.fecha_inicio || !d.fecha_fin) falla(400, "Indica fecha de inicio y fin");
  if (d.fecha_fin < d.fecha_inicio) falla(400, "La fecha final debe ser posterior a la inicial");
  if ((d.hora_inicio && !d.hora_fin) || (!d.hora_inicio && d.hora_fin))
    falla(400, "Indica ambas horas o ninguna");
  return d;
}

const COLS_DESC =
  "nombre, porcentaje, id_platillo, id_categoria, fecha_inicio, fecha_fin, dias_semana, hora_inicio, hora_fin, activo";
const valsDesc = (d) => [
  d.nombre,
  d.porcentaje,
  d.id_platillo,
  d.id_categoria,
  d.fecha_inicio,
  d.fecha_fin,
  d.dias_semana,
  d.hora_inicio,
  d.hora_fin,
  d.activo,
];

app.post(
  "/api/admin/descuentos",
  soloAdmin,
  h(async (req, res) => {
    const d = leerDescuento(req.body ?? {});
    await q(
      `INSERT INTO descuentos (${COLS_DESC}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      valsDesc(d),
    );
    avisar("catalogo");
    res.status(201).json({ ok: true });
  }),
);

app.put(
  "/api/admin/descuentos/:id",
  soloAdmin,
  h(async (req, res) => {
    const d = leerDescuento(req.body ?? {});
    await q(
      `UPDATE descuentos SET ${COLS_DESC.split(", ")
        .map((c) => `${c} = ?`)
        .join(", ")} WHERE id_descuento = ?`,
      [...valsDesc(d), Number(req.params.id)],
    );
    avisar("catalogo");
    res.json({ ok: true });
  }),
);

app.delete(
  "/api/admin/descuentos/:id",
  soloAdmin,
  h(async (req, res) => {
    await q("DELETE FROM descuentos WHERE id_descuento = ?", [Number(req.params.id)]);
    avisar("catalogo");
    res.json({ ok: true });
  }),
);

// --- Inventario (ingredientes) ---
app.get(
  "/api/admin/ingredientes",
  soloAdmin,
  h(async (_req, res) => {
    res.json(
      await q(
        `SELECT i.id_ingrediente AS id, i.nombre_ingrediente AS nombre, i.stock_actual AS stock,
                i.unidad_medida AS unidad, i.costo_unitario AS costo,
                (SELECT COUNT(*) FROM receta_platillo r WHERE r.id_ingrediente = i.id_ingrediente) AS platillos
         FROM ingredientes i ORDER BY i.nombre_ingrediente`,
      ),
    );
  }),
);

function leerIngrediente(b) {
  const d = {
    nombre: texto(b.nombre, 100),
    stock: Number(b.stock),
    unidad: texto(b.unidad, 20),
    costo: Number(b.costo),
  };
  if (!d.nombre || !d.unidad) falla(400, "Indica nombre y unidad de medida");
  if (!(d.stock >= 0) || !(d.costo >= 0)) falla(400, "Stock y costo no pueden ser negativos");
  return d;
}

app.post(
  "/api/admin/ingredientes",
  soloAdmin,
  h(async (req, res) => {
    const d = leerIngrediente(req.body ?? {});
    await q(
      "INSERT INTO ingredientes (nombre_ingrediente, stock_actual, unidad_medida, costo_unitario) VALUES (?, ?, ?, ?)",
      [d.nombre, d.stock, d.unidad, d.costo],
    );
    avisar("catalogo");
    res.status(201).json({ ok: true });
  }),
);

app.put(
  "/api/admin/ingredientes/:id",
  soloAdmin,
  h(async (req, res) => {
    const d = leerIngrediente(req.body ?? {});
    await q(
      "UPDATE ingredientes SET nombre_ingrediente = ?, stock_actual = ?, unidad_medida = ?, costo_unitario = ? WHERE id_ingrediente = ?",
      [d.nombre, d.stock, d.unidad, d.costo, Number(req.params.id)],
    );
    avisar("catalogo");
    res.json({ ok: true });
  }),
);

// --- Reportes PDF / Excel ---
app.get(
  "/api/admin/reporte.:formato",
  soloAdmin,
  h(async (req, res) => {
    const periodo = PERIODOS[req.query.periodo] ? req.query.periodo : "mes";
    const datos = await datosReporte(periodo, PERIODOS[periodo].actual);
    const nombre = `ventas-aroma-cafe-${periodo}-${datos.generado.slice(0, 10)}`;
    if (req.params.formato === "xlsx") {
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}.xlsx"`);
      await generarExcel(datos, res);
    } else if (req.params.formato === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}.pdf"`);
      generarPdf(datos, res);
    } else {
      falla(404, "Formato no soportado");
    }
  }),
);

// ---------------------------------------------------------------------------
// Estado del servidor y errores
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Empleados (solo cocina y repartidores) — contratar, despedir, ver acceso
// ---------------------------------------------------------------------------
const PLATAFORMAS = ["Propio", "UberEats", "Rappi", "DidiFood"];

/** Cierra todas las sesiones de una cuenta y avisa a su pantalla para que salga. */
async function revocarSesiones(idUsuario) {
  await q("DELETE FROM sesiones WHERE id_usuario = ?", [idUsuario]);
  avisar("sesion-revocada", { id_usuario: idUsuario });
}

async function empleadoPorUsuario(idUsuario) {
  const [e] = await q(
    `SELECT u.id_usuario, u.usuario, u.rol, u.id_repartidor, u.id_cocinero, u.password_cifrada
     FROM usuarios u WHERE u.id_usuario = ? AND u.rol IN ('cocina', 'repartidor')`,
    [idUsuario],
  );
  if (!e) falla(404, "Ese empleado no existe");
  return e;
}

app.get(
  "/api/admin/empleados",
  soloAdmin,
  h(async (_req, res) => {
    const empleados = await q(
      `SELECT e.*, (u.password_cifrada IS NOT NULL) AS password_consultable,
              (SELECT COUNT(*) FROM sesiones s WHERE s.id_usuario = e.id_usuario AND s.fecha_expira > NOW()) AS sesiones_activas,
              (SELECT COUNT(*) FROM pedidos p WHERE p.id_repartidor = u.id_repartidor AND p.estado_pedido = 'Entregado') AS entregas,
              (SELECT COUNT(*) FROM pedidos p WHERE p.id_repartidor = u.id_repartidor AND p.estado_pedido = 'En Camino') AS en_camino
       FROM vw_empleados e JOIN usuarios u ON u.id_usuario = e.id_usuario
       ORDER BY e.puesto, e.nombre`,
    );
    res.json(empleados);
  }),
);

// Consulta la contraseña de UN empleado (se descifra solo cuando el admin la pide)
app.get(
  "/api/admin/empleados/:id/password",
  soloAdmin,
  h(async (req, res) => {
    const e = await empleadoPorUsuario(Number(req.params.id));
    const password = e.password_cifrada ? descifrar(e.password_cifrada) : null;
    if (!password)
      falla(
        404,
        "La contraseña de esta cuenta no se puede consultar. Usa “Restablecer” para asignar una nueva.",
      );
    res.json({ usuario: e.usuario, password });
  }),
);

function leerPassword(v) {
  const password = String(v ?? "");
  if (password.length < 6)
    falla(400, "La contraseña del empleado debe tener al menos 6 caracteres");
  if (password.length > 100) falla(400, "La contraseña es demasiado larga");
  return password;
}

// Contratar
app.post(
  "/api/admin/empleados",
  soloAdmin,
  h(async (req, res) => {
    const b = req.body ?? {};
    const d = {
      nombre: texto(b.nombre, 100),
      puesto: texto(b.puesto, 20),
      usuario: texto(b.usuario, 50).toLowerCase(),
      password: leerPassword(b.password),
      telefono: texto(b.telefono, 15).replace(/[^\d+]/g, "") || null,
      email: texto(b.email, 100).toLowerCase() || null,
      plataforma: PLATAFORMAS.includes(b.plataforma) ? b.plataforma : "Propio",
    };
    if (!d.nombre) falla(400, "Escribe el nombre del empleado");
    if (!["cocina", "repartidor"].includes(d.puesto))
      falla(400, "El puesto debe ser cocina o repartidor");
    if (!/^[a-z0-9._-]{3,50}$/.test(d.usuario))
      falla(400, "El usuario debe tener 3+ caracteres (letras, números, punto o guion)");
    if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) falla(400, "El correo no es válido");
    if (d.puesto === "repartidor" && (!d.telefono || d.telefono.length < 8))
      falla(400, "El repartidor necesita un teléfono de contacto");
    const [dup] = await q("SELECT 1 FROM usuarios WHERE usuario = ?", [d.usuario]);
    if (dup) falla(409, "Ese nombre de usuario ya existe");

    const idUsuario = await transaccion(async (cx) => {
      const sal = nuevaSal();
      const comunes = [d.usuario, hashPassword(d.password, sal), sal, cifrar(d.password)];
      if (d.puesto === "cocina") {
        const [k] = await cx.query(
          "INSERT INTO cocineros (nombre, telefono, email, fecha_contratacion) VALUES (?, ?, ?, CURDATE())",
          [d.nombre, d.telefono, d.email],
        );
        const [u] = await cx.query(
          `INSERT INTO usuarios (usuario, password_hash, salt, password_cifrada, rol, id_cocinero)
           VALUES (?, ?, ?, ?, 'cocina', ?)`,
          [...comunes, k.insertId],
        );
        return u.insertId;
      }
      const [r] = await cx.query(
        `INSERT INTO repartidores (nombre_repartidor, telefono, plataforma, estado, email, fecha_contratacion)
         VALUES (?, ?, ?, 'Disponible', ?, CURDATE())`,
        [d.nombre, d.telefono, d.plataforma, d.email],
      );
      const [u] = await cx.query(
        `INSERT INTO usuarios (usuario, password_hash, salt, password_cifrada, rol, id_repartidor)
         VALUES (?, ?, ?, ?, 'repartidor', ?)`,
        [...comunes, r.insertId],
      );
      return u.insertId;
    }).catch((e) => {
      if (e?.code === "ER_DUP_ENTRY") falla(409, "Ya hay un empleado con ese correo o usuario");
      throw e;
    });
    avisar("empleados");
    res.status(201).json({ id_usuario: idUsuario });
  }),
);

// Asignar una contraseña nueva (cierra las sesiones abiertas de ese empleado)
app.put(
  "/api/admin/empleados/:id/password",
  soloAdmin,
  h(async (req, res) => {
    const e = await empleadoPorUsuario(Number(req.params.id));
    const password = leerPassword(req.body?.password);
    const sal = nuevaSal();
    await q(
      "UPDATE usuarios SET password_hash = ?, salt = ?, password_cifrada = ? WHERE id_usuario = ?",
      [hashPassword(password, sal), sal, cifrar(password), e.id_usuario],
    );
    await revocarSesiones(e.id_usuario);
    avisar("empleados");
    res.json({ ok: true });
  }),
);

// Despedir: se borra la cuenta (pierde el acceso al instante) y se marca la baja.
// El registro del repartidor/cocinero se conserva para no perder el historial.
app.delete(
  "/api/admin/empleados/:id",
  soloAdmin,
  h(async (req, res) => {
    const e = await empleadoPorUsuario(Number(req.params.id));
    if (e.id_repartidor) {
      const [{ n }] = await q(
        "SELECT COUNT(*) AS n FROM pedidos WHERE id_repartidor = ? AND estado_pedido = 'En Camino'",
        [e.id_repartidor],
      );
      if (n > 0)
        falla(409, `Este repartidor tiene ${n} pedido(s) en camino. Espera a que los entregue.`);
    }
    await transaccion(async (cx) => {
      if (e.id_repartidor)
        await cx.query(
          "UPDATE repartidores SET estado = 'Baja', fecha_baja = CURDATE() WHERE id_repartidor = ?",
          [e.id_repartidor],
        );
      if (e.id_cocinero)
        await cx.query("UPDATE cocineros SET fecha_baja = CURDATE() WHERE id_cocinero = ?", [
          e.id_cocinero,
        ]);
      // Se borra la cuenta (y sus sesiones); el registro del empleado queda como historial
      await cx.query("DELETE FROM sesiones WHERE id_usuario = ?", [e.id_usuario]);
      await cx.query("DELETE FROM usuarios WHERE id_usuario = ?", [e.id_usuario]);
    });
    avisar("sesion-revocada", { id_usuario: e.id_usuario });
    avisar("empleados");
    res.json({ ok: true });
  }),
);

// Clientes: SOLO datos básicos. Sus contraseñas no existen en forma legible
// (hash SHA-256 con sal) y esta ruta nunca las incluye.
app.get(
  "/api/admin/clientes",
  soloAdmin,
  h(async (_req, res) => {
    res.json(
      await q(
        `SELECT c.id_cliente, CONCAT(c.nombre, ' ', c.ap_paterno, IFNULL(CONCAT(' ', c.ap_materno), '')) AS nombre,
                u.usuario, c.email, c.telefono, c.fecha_registro,
                (SELECT COUNT(*) FROM pedidos p WHERE p.id_cliente = c.id_cliente) AS pedidos,
                (SELECT IFNULL(SUM(p.total_pedido), 0) FROM pedidos p
                  WHERE p.id_cliente = c.id_cliente AND p.estado_pedido = 'Entregado') AS gastado
         FROM clientes c LEFT JOIN usuarios u ON u.id_cliente = c.id_cliente
         ORDER BY c.fecha_registro DESC`,
      ),
    );
  }),
);

app.get(
  "/api/salud",
  h(async (_req, res) => {
    const [r] = await q("SELECT DATABASE() AS base, NOW() AS hora");
    res.json({ ok: true, ...r, conectados: io.engine.clientsCount });
  }),
);

app.use("/api", (_req, _res, next) => next(new ErrorApp(404, "Ruta no encontrada")));

app.use((err, _req, res, _next) => {
  if (err instanceof ErrorApp) return res.status(err.status).json({ error: err.message });
  if (
    err?.code === "ECONNREFUSED" ||
    err?.code === "ER_ACCESS_DENIED_ERROR" ||
    err?.code === "ER_BAD_DB_ERROR"
  ) {
    console.error("[MySQL]", err.code, err.message);
    return res.status(503).json({
      error: "No hay conexión con MySQL. Revisa el archivo .env y que el servidor esté encendido.",
    });
  }
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

server.listen(PORT, "0.0.0.0", async () => {
  console.log(`\n  ☕ API Aroma a Café lista en http://localhost:${PORT}`);
  try {
    const [r] = await q("SELECT DATABASE() AS base, (SELECT COUNT(*) FROM usuarios) AS usuarios");
    console.log(`  ✔ Conectado a MySQL · base ${r.base} · ${r.usuarios} usuarios\n`);
    await completarPasswordsDeEjemplo();
    await devolverFotosADisco();
  } catch (e) {
    console.error(`  ✘ No se pudo usar MySQL (${e.code ?? e.message}).`);
    console.error(
      "    Revisa .env y ejecuta npm run db:setup (o npm run db:reset para crearla desde cero)\n",
    );
  }
});

/**
 * Las cuentas de ejemplo (cocina, roberto, david, elena) se crean desde SQL,
 * que no conoce la llave de cifrado. Al arrancar, si su contraseña sigue siendo
 * la de ejemplo, se guarda su copia cifrada para que el admin pueda consultarla.
 */
async function completarPasswordsDeEjemplo() {
  try {
    const pendientes = await q(
      "SELECT id_usuario, usuario, rol, password_hash, salt FROM usuarios WHERE rol IN ('cocina', 'repartidor') AND password_cifrada IS NULL",
    );
    for (const u of pendientes) {
      const candidata = u.rol === "cocina" ? "cocina123" : "reparto123";
      if (hashPassword(candidata, u.salt) === u.password_hash)
        await q("UPDATE usuarios SET password_cifrada = ? WHERE id_usuario = ?", [
          cifrar(candidata),
          u.id_usuario,
        ]);
    }
  } catch {
    /* la columna aún no existe: falta ejecutar db/04_empleados_seguridad.sql */
  }
}

/**
 * Si una versión anterior guardó fotos en la tabla imagenes, las regresa a la
 * carpeta uploads/ (una sola vez) y elimina esa tabla.
 */
async function devolverFotosADisco() {
  try {
    const [tabla] = await q("SHOW TABLES LIKE 'imagenes'");
    if (!tabla) return;
    const conFoto = await q(
      "SELECT p.id_platillo, i.tipo, i.datos FROM platillos p JOIN imagenes i ON p.imagen_url = CONCAT('/api/imagenes/', i.id_imagen)",
    );
    for (const p of conFoto) {
      const ext =
        { "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" }[p.tipo] ?? ".jpg";
      const nombre = `platillo-${Date.now()}-${crypto.randomBytes(3).toString("hex")}${ext}`;
      fs.writeFileSync(path.join(UPLOADS, nombre), p.datos);
      await q("UPDATE platillos SET imagen_url = ? WHERE id_platillo = ?", [
        `/uploads/${nombre}`,
        p.id_platillo,
      ]);
    }
    await q("UPDATE platillos SET imagen_url = NULL WHERE imagen_url LIKE '/api/imagenes/%'");
    await q("DROP TABLE imagenes");
  } catch (e) {
    console.error("  ✘ No se pudieron regresar las fotos a uploads/:", e.message);
  }
}

// Limpieza de sesiones vencidas cada hora
setInterval(
  () => pool.query("DELETE FROM sesiones WHERE fecha_expira < NOW()").catch(() => {}),
  3600_000,
);
