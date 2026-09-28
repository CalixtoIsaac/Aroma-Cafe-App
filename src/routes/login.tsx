import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Coffee, ShoppingBag } from "lucide-react";
import { AppShell, botonPrimario, botonSecundario, Cargando } from "@/components/AppShell";
import { FormularioLogin, FormularioRegistro } from "@/components/Acceso";
import { destinoPermitido, inicioDe, nombreRol, useSesion, type Usuario } from "@/lib/api";

type Busqueda = { destino?: string | undefined; modo?: "registro" | undefined };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): Busqueda => ({
    destino: typeof s["destino"] === "string" ? s["destino"] : undefined,
    modo: s["modo"] === "registro" ? "registro" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Iniciar sesión — Aroma a Café Co." },
      { name: "description", content: "Accede a tu cuenta de Aroma a Café Co." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { destino, modo } = Route.useSearch();
  const navigate = useNavigate();
  const sesion = useSesion();
  const registro = modo === "registro";
  const paraPagar = destino?.includes("pagar=1");

  const alEntrar = (u: Usuario) => {
    window.location.assign(destinoPermitido(u.rol, destino));
  };

  return (
    <AppShell>
      {sesion.estado === "cargando" ? (
        <Cargando />
      ) : sesion.estado === "activa" ? (
        // Ya hay una sesión: no se puede abrir otra cuenta sin cerrar ésta
        <div className="snap-in mx-auto mt-8 max-w-md rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            Sesión activa
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
            Hola, {sesion.usuario.nombreMostrado}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ya iniciaste sesión como {nombreRol[sesion.usuario.rol].toLowerCase()}. Para entrar con
            otra cuenta, primero cierra esta sesión.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to={inicioDe(sesion.usuario.rol)} className={botonPrimario}>
              Ir a mi sección
            </Link>
            <button onClick={sesion.salir} className={botonSecundario}>
              Cerrar sesión
            </button>
          </div>
        </div>
      ) : (
        <div className="snap-in mx-auto grid max-w-4xl overflow-hidden rounded-3xl bg-card ring-1 ring-border md:grid-cols-[1fr_1.1fr]">
          <aside className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_25%_15%,oklch(0.55_0.12_55/0.55),transparent_60%),linear-gradient(160deg,oklch(0.27_0.03_50),oklch(0.17_0.02_48))] p-10 md:flex md:flex-col md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
                Aroma a Café Co.
              </p>
              <h2 className="mt-4 font-display text-5xl font-semibold leading-none tracking-tight text-flame">
                {registro ? "Tu primera taza te espera" : "Qué gusto verte de nuevo"}
              </h2>
              <p className="mt-4 max-w-[30ch] text-sm text-muted-foreground">
                Clientes, cocina, repartidores y administración entran por aquí. Cada cuenta ve
                únicamente su propia sección.
              </p>
            </div>
            <div className="mt-8 grid size-40 place-items-center self-center rounded-3xl bg-[radial-gradient(circle_at_30%_20%,oklch(0.745_0.152_55/0.35),transparent_60%),linear-gradient(160deg,oklch(0.3_0.04_50),oklch(0.2_0.025_48))] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] ring-1 ring-border">
              <Coffee className="size-16 text-[oklch(0.925_0.028_80/0.85)]" strokeWidth={1.25} />
            </div>
          </aside>

          <section className="p-7 sm:p-10">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {registro ? "Crear cuenta" : "Iniciar sesión"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {registro
                ? "Regístrate para hacer pedidos y seguirlos en vivo."
                : "Escribe los datos de tu cuenta."}
            </p>
            {paraPagar ? (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-accent/10 px-4 py-3 text-sm ring-1 ring-accent/30">
                <ShoppingBag className="size-4 shrink-0 text-accent" />
                Para completar tu pedido inicia sesión o crea tu cuenta. Tu carrito se conserva.
              </p>
            ) : null}
            <div className="mt-6">
              {registro ? (
                <FormularioRegistro onListo={alEntrar} />
              ) : (
                <FormularioLogin onListo={alEntrar} />
              )}
            </div>
            <p className="mt-6 border-t border-border pt-5 text-center text-sm text-muted-foreground">
              {registro ? "¿Ya tienes cuenta?" : "¿Eres cliente nuevo?"}{" "}
              <button
                onClick={() =>
                  navigate({
                    to: "/login",
                    search: { destino, modo: registro ? undefined : "registro" },
                    replace: true,
                  })
                }
                className="font-semibold text-accent underline-offset-4 hover:underline"
              >
                {registro ? "Inicia sesión" : "Crea tu cuenta"}
              </button>
            </p>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              ¿Solo quieres ver el menú?{" "}
              <Link to="/" className="underline underline-offset-4 hover:text-foreground">
                No necesitas cuenta
              </Link>
            </p>
          </section>
        </div>
      )}
    </AppShell>
  );
}
