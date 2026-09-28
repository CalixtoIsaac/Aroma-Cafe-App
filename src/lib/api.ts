// Cliente HTTP hacia la API (Express) y sesión del usuario.
// ---------------------------------------------------------------------------
// Hay UNA sola sesión por navegador. En el dispositivo solo se guarda el token;
// quién es el usuario y qué rol tiene lo dice siempre el servidor (/auth/yo),
// así que editar el almacenamiento del navegador no da acceso a otra sección.
// Además, cada ruta de la API vuelve a validar el rol del token.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type Rol = "cliente" | "cocina" | "repartidor" | "admin";

export type Usuario = {
  id_usuario: number;
  usuario: string;
  rol: Rol;
  id_cliente: number | null;
  id_repartidor: number | null;
  id_cocinero: number | null;
  nombre: string | null;
  ap_paterno: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  nombreMostrado: string;
};

export type EstadoSesion =
  | { estado: "cargando"; usuario: null }
  | { estado: "visitante"; usuario: null }
  | { estado: "activa"; usuario: Usuario };

const CLAVE = "aroma.sesion";
let token: string | null = null;
let estado: EstadoSesion = { estado: "cargando", usuario: null };
const oyentes = new Set<() => void>();
const notificar = () => oyentes.forEach((f) => f());

function leerToken() {
  try {
    // Limpia las sesiones por rol de versiones anteriores
    for (const r of ["cliente", "cocina", "repartidor", "admin"])
      localStorage.removeItem(`aroma.sesion.${r}`);
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

function escribirToken(t: string | null) {
  token = t;
  try {
    if (t) localStorage.setItem(CLAVE, t);
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: la sesión vive solo en memoria */
  }
}

/** Borra la sesión local y vuelve al modo visitante. */
export function limpiarSesion() {
  escribirToken(null);
  estado = { estado: "visitante", usuario: null };
  notificar();
}

/** Guarda la sesión recién iniciada (token + usuario que respondió el servidor). */
export function establecerSesion(nuevoToken: string, usuario: Usuario) {
  escribirToken(nuevoToken);
  estado = { estado: "activa", usuario };
  notificar();
}

export function actualizarUsuario(usuario: Usuario) {
  if (estado.estado === "activa") {
    estado = { estado: "activa", usuario };
    notificar();
  }
}

export function tokenActual() {
  return token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown; formData?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (opciones.cuerpo !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${ruta}`, {
      method:
        opciones.metodo ?? (opciones.cuerpo !== undefined || opciones.formData ? "POST" : "GET"),
      headers,
      body:
        opciones.formData ??
        (opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : null),
    });
  } catch {
    throw new ApiError(0, "No hay conexión con el servidor");
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Token vencido o revocado: se cierra la sesión local
    if (res.status === 401 && token && !ruta.startsWith("/auth/login")) limpiarSesion();
    throw new ApiError(res.status, (datos as { error?: string }).error ?? `Error ${res.status}`);
  }
  return datos as T;
}

let verificando: Promise<void> | null = null;

/** Pregunta al servidor quién es el dueño del token guardado (se llama al abrir la app). */
export function verificarSesion() {
  if (verificando) return verificando;
  verificando = (async () => {
    token = leerToken();
    if (!token) {
      limpiarSesion();
      return;
    }
    for (let intento = 0; ; intento++) {
      try {
        const r = await api<{ usuario: Usuario }>("/auth/yo");
        estado = { estado: "activa", usuario: r.usuario };
        notificar();
        return;
      } catch (e) {
        if ((e as ApiError).status !== 0) {
          limpiarSesion();
          return;
        }
        // Servidor no disponible: reintenta sin perder la sesión
        await new Promise((r) => setTimeout(r, Math.min(5000, 1000 * (intento + 1))));
      }
    }
  })().finally(() => {
    verificando = null;
  });
  return verificando;
}

/** Página de inicio de cada rol */
export const inicioDe = (rol: Rol) =>
  ({ cliente: "/", cocina: "/cocina", repartidor: "/repartidor", admin: "/admin" })[rol];

export const nombreRol: Record<Rol, string> = {
  cliente: "Cliente",
  cocina: "Cocina",
  repartidor: "Repartidor",
  admin: "Administrador",
};

/**
 * Adónde mandar al usuario después de iniciar sesión: al destino pedido solo si
 * su rol puede verlo; si no, a su propia sección. Solo rutas internas.
 */
export function destinoPermitido(rol: Rol, destino?: string) {
  const d = destino && destino.startsWith("/") && !destino.startsWith("//") ? destino : "";
  const ruta = d.split(/[?#]/)[0] ?? "";
  const permitido =
    (rol === "admin" && ruta !== "/login") ||
    (rol === "cliente" && ruta === "/") ||
    (rol === "cocina" && ruta === "/cocina") ||
    (rol === "repartidor" && ruta === "/repartidor");
  return permitido ? d : inicioDe(rol);
}

/** Sesión actual, reactiva entre componentes. `salir` cierra la sesión en el servidor y aquí. */
export function useSesion() {
  const s = useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => estado,
    () => estado,
  );
  const qc = useQueryClient();
  const salir = useCallback(async () => {
    try {
      await api("/auth/logout", { metodo: "POST" });
    } catch {
      /* ya estaba cerrada */
    }
    // Se borra el token y se recarga la app desde el menú: no queda ningún dato
    // de la sesión anterior en memoria ni pantallas protegidas montadas.
    escribirToken(null);
    qc.clear();
    window.location.replace("/");
  }, [qc]);
  return { ...s, salir };
}

/** true solo en el navegador, después de hidratar. */
export function useMontado() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
