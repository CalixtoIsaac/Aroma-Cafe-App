import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, Cargando, SectionTitle, Vacio } from "@/components/AppShell";
import { BannerSupervision, Protegido } from "@/components/Acceso";
import { useSesion } from "@/lib/api";
import { api } from "@/lib/api";
import { ding, useEnVivo } from "@/lib/live";
import { hace, hora, mxn, useAhora, type Estado, type Pedido } from "@/lib/tipos";

export const Route = createFileRoute("/cocina")({
  head: () => ({
    meta: [
      { title: "Cocina — Aroma a Café Co." },
      {
        name: "description",
        content: "Cola de boletas en tiempo real para preparar y marcar pedidos listos.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <Protegido roles={["cocina", "admin"]}>
        <CocinaPanel />
      </Protegido>
    </AppShell>
  ),
});

type Respuesta = { pedidos: Pedido[]; listos: number; hechosHoy: number };

function CocinaPanel() {
  const sesion = useSesion();
  const supervision = sesion.estado === "activa" && sesion.usuario.rol === "admin";
  const qc = useQueryClient();
  const ahora = useAhora(20_000);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["cocina"],
    queryFn: () => api<Respuesta>("/cocina/pedidos"),
    refetchInterval: 15_000,
  });

  useEnVivo({ pedidos: [["cocina"]] }, (_e, d) => {
    if (d.nuevo && !supervision) {
      ding();
      toast(`Nueva boleta #${d.numero}`, { description: "Entró un pedido a la cola" });
    }
  });

  const cambiar = useMutation({
    mutationFn: ({ numero, estado }: { numero: number; estado: Estado }) =>
      api(`/cocina/pedidos/${numero}/estado`, { cuerpo: { estado } }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["cocina"] });
      if (v.estado === "Listo") toast.success(`#${v.numero} listo para repartir`);
    },
    onError: (e) => {
      toast.error((e as Error).message);
      qc.invalidateQueries({ queryKey: ["cocina"] });
    },
  });

  if (isLoading) return <Cargando />;
  if (isError) return <Vacio>{(error as Error).message}</Vacio>;

  const cola = data?.pedidos ?? [];
  const pendientes = cola.filter((p) => p.estado === "Pendiente").length;

  return (
    <>
      {supervision ? <BannerSupervision area="la cocina" /> : null}
      <SectionTitle
        title="Cocina · cola de boletas"
        hint={
          <span className="flex items-center gap-2">
            <span className="live-dot size-2 rounded-full bg-accent" />
            {cola.length} activas · {pendientes} por iniciar
          </span>
        }
      >
        <span className="rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border">
          {data?.listos ?? 0} esperando repartidor
        </span>
        <span className="rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border">
          {data?.hechosHoy ?? 0} terminadas hoy
        </span>
      </SectionTitle>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cola.map((p, i) => {
          const activo = p.estado === "En Preparación";
          const ocupado = cambiar.isPending && cambiar.variables?.numero === p.numero;
          const minutos = (ahora - new Date(p.fecha_hora.replace(" ", "T")).getTime()) / 60000;
          return (
            <article
              key={`${p.numero}-${p.estado}`}
              style={{ animationDelay: `${Math.min(i, 6) * 0.06}s` }}
              className={`snap-in relative flex flex-col rounded-xl p-4 ring-1 ring-border ${
                activo ? "bg-accent text-accent-foreground" : "bg-ticket text-ticket-foreground"
              }`}
            >
              <div
                className="absolute left-1/2 top-0 h-1.5 w-16 -translate-x-1/2 rounded-b-full bg-background"
                aria-hidden
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider opacity-60">
                  {p.estado}
                </span>
                <span className="font-display text-2xl font-semibold">#{p.numero}</span>
              </div>
              <ul className="mt-3 space-y-1 text-[15px] font-medium">
                {p.items.map((it) => (
                  <li key={it.nombre} className="flex gap-2">
                    <span className="font-display font-semibold">{it.cantidad}×</span> {it.nombre}
                  </li>
                ))}
              </ul>
              {p.notas ? (
                <p className="mt-3 rounded-lg border border-dashed border-current/30 px-3 py-2 text-xs font-semibold">
                  Nota: {p.notas}
                </p>
              ) : null}
              <p
                className={`mt-3 text-xs ${minutos > 15 ? "font-semibold text-destructive" : "opacity-60"}`}
              >
                {hora(p.fecha_hora)} · {hace(p.fecha_hora, ahora)} · {p.cliente} · {mxn(p.total)}
              </p>
              <div className="mt-auto pt-4">
                {supervision ? (
                  <p className="rounded-full border border-dashed border-current/30 py-2 text-center text-xs font-semibold opacity-70">
                    {p.estado === "Pendiente" ? "Esperando a cocina" : "En preparación"}
                  </p>
                ) : p.estado === "Pendiente" ? (
                  <button
                    disabled={ocupado}
                    onClick={() => cambiar.mutate({ numero: p.numero, estado: "En Preparación" })}
                    className="w-full rounded-full bg-card py-2.5 text-sm font-semibold text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                  >
                    Iniciar preparación
                  </button>
                ) : (
                  <button
                    disabled={ocupado}
                    onClick={() => cambiar.mutate({ numero: p.numero, estado: "Listo" })}
                    className="w-full rounded-full bg-card py-2.5 text-sm font-semibold text-card-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    Marcar listo para repartir
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {cola.length === 0 ? (
        <Vacio className="p-12">Sin pedidos en cola. Todo al día ☕</Vacio>
      ) : null}

      <p className="mt-8 rounded-xl bg-card px-4 py-3 text-xs text-muted-foreground ring-1 ring-border">
        Cocina solo ve pedidos pendientes y en preparación, y únicamente puede cambiar su estado. No
        tiene acceso a precios ni al catálogo. Suena un aviso cuando entra una boleta nueva.
      </p>
    </>
  );
}
