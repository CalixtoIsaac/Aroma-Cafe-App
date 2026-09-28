import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LogIn, LogOut } from "lucide-react";
import { nombreRol, useMontado, useSesion, type Rol } from "@/lib/api";
import { useConectado } from "@/lib/live";

// Navegación según el rol de la sesión activa (el servidor valida cada ruta)
const navegacion: Record<Rol | "visitante", { to: string; label: string }[]> = {
  visitante: [{ to: "/", label: "Menú" }],
  cliente: [{ to: "/", label: "Menú y pedidos" }],
  cocina: [{ to: "/cocina", label: "Cocina" }],
  repartidor: [{ to: "/repartidor", label: "Entregas" }],
  admin: [
    { to: "/admin", label: "Panel" },
    { to: "/cocina", label: "Cocina" },
    { to: "/repartidor", label: "Repartidor" },
    { to: "/", label: "Menú" },
  ],
};

// Clases reutilizables para mantener el mismo estilo en todos los formularios
export const campo =
  "w-full rounded-full bg-background px-4 py-2.5 text-sm text-foreground ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-accent disabled:opacity-60";
export const campoArea =
  "w-full rounded-2xl bg-background px-4 py-2.5 text-sm text-foreground ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-accent";
export const botonPrimario =
  "inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50";
export const botonSecundario =
  "inline-flex items-center justify-center gap-2 rounded-full bg-card px-4 py-2 text-xs font-semibold text-card-foreground ring-1 ring-border transition-colors hover:text-accent disabled:pointer-events-none disabled:opacity-50";
export const etiqueta =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground";

function IndicadorVivo() {
  const conectado = useConectado();
  return (
    <span
      className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
      title={conectado ? "Conectado en tiempo real" : "Reconectando…"}
    >
      <span
        className={`size-2 rounded-full ${conectado ? "live-dot bg-success" : "bg-destructive"}`}
      />
      {conectado ? "En vivo" : "Sin conexión"}
    </span>
  );
}

function ChipSesion() {
  const sesion = useSesion();
  const { pathname } = useLocation();
  if (sesion.estado === "cargando") return null;
  if (sesion.estado === "visitante" && pathname.startsWith("/login")) return null;
  if (sesion.estado === "visitante")
    return (
      <Link
        to="/login"
        search={{}}
        className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5"
      >
        <LogIn className="size-4" /> Iniciar sesión
      </Link>
    );
  return (
    <div className="flex items-center gap-2 rounded-full bg-card py-1 pl-4 pr-1 ring-1 ring-border">
      <span className="flex flex-col leading-tight">
        <span className="max-w-[18ch] truncate text-xs font-semibold">
          {sesion.usuario.nombreMostrado}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {nombreRol[sesion.usuario.rol]}
        </span>
      </span>
      <button
        onClick={sesion.salir}
        className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

function Navegacion() {
  const sesion = useSesion();
  if (sesion.estado === "cargando") return null;
  const items = navegacion[sesion.estado === "activa" ? sesion.usuario.rol : "visitante"];
  if (items.length < 2) return null;
  return (
    <nav className="flex items-center gap-1 overflow-x-auto rounded-full bg-card p-1 ring-1 ring-border">
      {items.map((r) => (
        <Link
          key={r.to}
          to={r.to}
          activeOptions={{ exact: true }}
          className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors sm:px-4"
          activeProps={{ className: "bg-accent font-semibold text-accent-foreground" }}
          inactiveProps={{ className: "font-medium text-muted-foreground hover:text-foreground" }}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode; rol?: Rol }) {
  const montado = useMontado();
  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-8 sm:pt-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
              <span className="font-display text-xl font-semibold leading-none">A</span>
            </div>
            <div>
              <p className="font-display text-lg font-semibold leading-none tracking-tight">
                Aroma a Café Co.
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Dark Kitchen · Pedidos
              </p>
            </div>
          </Link>
          {montado ? (
            <div className="flex flex-wrap items-center gap-3">
              <IndicadorVivo />
              <Navegacion />
              <ChipSesion />
            </div>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}

export function SectionTitle({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      {children ? (
        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

export function Vacio({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground ${className}`}
    >
      {children}
    </p>
  );
}

export function Cargando() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl bg-card ring-1 ring-border" />
      ))}
    </div>
  );
}
