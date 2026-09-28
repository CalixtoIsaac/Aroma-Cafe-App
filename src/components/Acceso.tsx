// Acceso: guarda de rutas por rol y formularios de inicio de sesión / registro
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, LockKeyhole, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  api,
  establecerSesion,
  inicioDe,
  nombreRol,
  useSesion,
  type Rol,
  type Usuario,
} from "@/lib/api";
import { botonPrimario, botonSecundario, campo, campoArea, Cargando, etiqueta } from "./AppShell";

type RespuestaSesion = { token: string; usuario: Usuario };

function MensajeError({ msg }: { msg: string | null }) {
  return msg ? (
    <p
      role="alert"
      className="rounded-xl bg-destructive/15 px-4 py-2.5 text-xs font-semibold text-destructive"
    >
      {msg}
    </p>
  ) : null;
}

/**
 * Muestra `children` solo si la sesión (verificada por el servidor) tiene uno de
 * los roles permitidos. Visitante → pantalla de inicio de sesión (y regresa aquí).
 * Otro rol → acceso denegado: debe cerrar sesión para entrar con otra cuenta.
 */
export function Protegido({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const sesion = useSesion();
  const navigate = useNavigate();
  const location = useLocation();
  const redirigido = useRef(false);

  useEffect(() => {
    // Redirige una sola vez, y nunca desde la propia página de inicio de sesión
    if (sesion.estado !== "visitante" || redirigido.current) return;
    if (location.pathname.startsWith("/login")) return;
    redirigido.current = true;
    navigate({ to: "/login", search: { destino: location.href }, replace: true });
  }, [sesion.estado, navigate, location.href, location.pathname]);

  if (sesion.estado !== "activa") return <Cargando />;
  if (!roles.includes(sesion.usuario.rol))
    return <AccesoDenegado usuario={sesion.usuario} requerido={roles} salir={sesion.salir} />;
  return <>{children}</>;
}

export function AccesoDenegado({
  usuario,
  requerido,
  salir,
}: {
  usuario: Usuario;
  requerido: Rol[];
  salir: () => void;
}) {
  const seccion =
    requerido
      .filter((r) => r !== "admin")
      .map((r) => nombreRol[r])
      .join(" / ") || nombreRol.admin;
  return (
    <div className="snap-in mx-auto mt-10 max-w-md rounded-2xl bg-card p-8 text-center ring-1 ring-border">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/15 text-destructive">
        <ShieldAlert className="size-7" />
      </div>
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
        Acceso restringido
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Esta sección es solo para <span className="font-semibold text-foreground">{seccion}</span>.
        Iniciaste sesión como{" "}
        <span className="font-semibold text-foreground">{usuario.nombreMostrado}</span> (
        {nombreRol[usuario.rol].toLowerCase()}).
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Para entrar con otra cuenta primero cierra tu sesión.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to={inicioDe(usuario.rol)} className={botonPrimario}>
          Ir a mi sección
        </Link>
        <button onClick={salir} className={botonSecundario}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function CampoPassword({
  value,
  onChange,
  placeholder = "Contraseña",
  autoComplete,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input
        className={`${campo} pr-11`}
        type={ver ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground"
        aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
      >
        {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Inicio de sesión para todos los roles (o solo contraseña maestra del administrador). */
export function FormularioLogin({ onListo }: { onListo: (u: Usuario) => void }) {
  const [maestra, setMaestra] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = maestra
        ? await api<RespuestaSesion>("/auth/admin", { cuerpo: { password } })
        : await api<RespuestaSesion>("/auth/login", { cuerpo: { usuario, password } });
      establecerSesion(r.token, r.usuario);
      onListo(r.usuario);
    } catch (err) {
      setError((err as Error).message);
      setPassword("");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={entrar} className="space-y-4">
      {maestra ? (
        <div className="flex items-center gap-3 rounded-xl bg-accent/10 px-4 py-3 text-sm ring-1 ring-accent/30">
          <LockKeyhole className="size-4 shrink-0 text-accent" />
          Acceso del administrador con la contraseña maestra.
        </div>
      ) : (
        <div>
          <label className={etiqueta} htmlFor="login-usuario">
            Usuario
          </label>
          <input
            id="login-usuario"
            className={campo}
            placeholder="tu usuario"
            autoCapitalize="none"
            autoComplete="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoFocus
            required
          />
        </div>
      )}
      <div>
        <label className={etiqueta}>{maestra ? "Contraseña maestra" : "Contraseña"}</label>
        <CampoPassword
          value={password}
          onChange={setPassword}
          placeholder={maestra ? "Contraseña maestra" : "••••••••"}
          autoComplete="current-password"
          autoFocus={maestra}
        />
      </div>
      <MensajeError msg={error} />
      <button className={`${botonPrimario} w-full py-3`} disabled={enviando}>
        {enviando ? "Verificando…" : "Iniciar sesión"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMaestra((m) => !m);
          setError(null);
          setPassword("");
        }}
        className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {maestra
          ? "← Entrar con usuario y contraseña"
          : "¿Eres el dueño? Entra con la contraseña maestra"}
      </button>
    </form>
  );
}

/** Registro de clientes (los empleados los da de alta el administrador). */
export function FormularioRegistro({ onListo }: { onListo: (u: Usuario) => void }) {
  const [f, setF] = useState({
    usuario: "",
    password: "",
    nombre: "",
    ap_paterno: "",
    ap_materno: "",
    telefono: "",
    email: "",
    direccion: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await api<RespuestaSesion>("/auth/registro", { cuerpo: f });
      establecerSesion(r.token, r.usuario);
      onListo(r.usuario);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          className={campo}
          placeholder="Nombre"
          value={f.nombre}
          onChange={set("nombre")}
          autoComplete="given-name"
          required
        />
        <input
          className={campo}
          placeholder="Apellido paterno"
          value={f.ap_paterno}
          onChange={set("ap_paterno")}
          autoComplete="family-name"
          required
        />
      </div>
      <input
        className={campo}
        placeholder="Apellido materno (opcional)"
        value={f.ap_materno}
        onChange={set("ap_materno")}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={campo}
          placeholder="Teléfono"
          inputMode="tel"
          value={f.telefono}
          onChange={set("telefono")}
          autoComplete="tel"
          required
        />
        <input
          className={campo}
          placeholder="Correo"
          type="email"
          value={f.email}
          onChange={set("email")}
          autoComplete="email"
          required
        />
      </div>
      <div>
        <label className={etiqueta}>Dirección de entrega</label>
        <textarea
          className={campoArea}
          rows={2}
          placeholder="Calle, número, colonia, referencias"
          value={f.direccion}
          onChange={set("direccion")}
          autoComplete="street-address"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          className={campo}
          placeholder="Usuario"
          autoCapitalize="none"
          value={f.usuario}
          onChange={set("usuario")}
          autoComplete="username"
          required
        />
        <CampoPassword
          value={f.password}
          onChange={(v) => setF((x) => ({ ...x, password: v }))}
          autoComplete="new-password"
        />
      </div>
      <MensajeError msg={error} />
      <button className={`${botonPrimario} w-full py-3`} disabled={enviando}>
        {enviando ? "Creando tu cuenta…" : "Crear mi cuenta"}
      </button>
    </form>
  );
}

/** Aviso para el administrador cuando abre la pantalla de otro rol (solo lectura). */
export function BannerSupervision({ area }: { area: string }) {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl bg-accent/10 px-4 py-3 text-sm ring-1 ring-accent/30">
      <ShieldCheck className="size-4 shrink-0 text-accent" />
      <span>
        <span className="font-semibold">Modo supervisión.</span> Estás viendo {area} como
        administrador: puedes consultar todo, pero solo el personal de esa área puede cambiar los
        pedidos.
      </span>
    </div>
  );
}
