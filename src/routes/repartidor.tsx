import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Cargando, SectionTitle, Vacio } from "@/components/AppShell";
import { BannerSupervision, Protegido } from "@/components/Acceso";
import { useSesion } from "@/lib/api";
import { api } from "@/lib/api";
import { ding, useEnVivo } from "@/lib/live";
import { hace, hora, mxn, useAhora, type Pedido } from "@/lib/tipos";

export const Route = createFileRoute("/repartidor")({
  head: () => ({
    meta: [
      { title: "Repartidor — Aroma a Café Co." },
      {
        name: "description",
        content: "Acepta pedidos listos, llévalos en camino y confirma la entrega.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <Protegido roles={["repartidor", "admin"]}>
        <RepartidorPanel />
      </Protegido>
    </AppShell>
  ),
});

type Respuesta = {
  disponibles: Pedido[];
  enCamino: Pedido[];
  entregados: Pedido[];
  supervision?: boolean;
};

function Contacto({ p }: { p: Pedido }) {
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.direccion)}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-start gap-2 font-medium underline-offset-2 hover:underline"
      >
        <MapPin className="mt-0.5 size-4 shrink-0 opacity-60" />
        {p.direccion}
      </a>
      <a
        href={`tel:${p.telefono}`}
        className="flex items-center gap-2 underline-offset-2 hover:underline"
      >
        <Phone className="size-4 opacity-60" />
        {p.telefono} · {p.cliente}
      </a>
    </div>
  );
}

function Articulos({ p }: { p: Pedido }) {
  return (
    <ul className="mt-3 space-y-0.5 border-t border-dashed border-current/20 pt-3 text-xs">
      {p.items.map((i) => (
        <li key={i.nombre}>
          {i.cantidad}× {i.nombre}
        </li>
      ))}
      {p.notas ? <li className="font-semibold">Nota: {p.notas}</li> : null}
    </ul>
  );
}

function RepartidorPanel() {
  const sesion = useSesion();
  const supervision = sesion.estado === "activa" && sesion.usuario.rol === "admin";
  const qc = useQueryClient();
  const ahora = useAhora();
  const [codigo, setCodigo] = useState<Record<number, string>>({});
  const [error, setError] = useState<Record<number, string>>({});
  const {
    data,
    isLoading,
    isError,
    error: errorCarga,
  } = useQuery({
    queryKey: ["repartidor"],
    queryFn: () => api<Respuesta>("/repartidor/pedidos"),
    refetchInterval: 15_000,
  });

  useEnVivo({ pedidos: [["repartidor"]] }, (_e, d) => {
    if (d.estado === "Listo" && !supervision) {
      ding();
      toast(`#${d.numero} listo para recoger`, { description: "Cocina terminó un pedido" });
    }
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ["repartidor"] });

  const aceptar = useMutation({
    mutationFn: (numero: number) =>
      api(`/repartidor/pedidos/${numero}/aceptar`, { metodo: "POST" }),
    onSuccess: (_r, n) => {
      toast.success(`Pedido #${n} aceptado · en camino`);
      refrescar();
    },
    onError: (e) => {
      toast.error((e as Error).message);
      refrescar();
    },
  });

  const entregar = useMutation({
    mutationFn: (numero: number) =>
      api(`/repartidor/pedidos/${numero}/entregar`, {
        cuerpo: { numero: codigo[numero] ?? "" },
      }),
    onSuccess: (_r, n) => {
      toast.success(`Pedido #${n} entregado`);
      setError((e) => ({ ...e, [n]: "" }));
      refrescar();
    },
    onError: (e, n) => setError((x) => ({ ...x, [n]: (e as Error).message })),
  });

  if (isLoading) return <Cargando />;
  if (isError) return <Vacio>{(errorCarga as Error).message}</Vacio>;
  const { disponibles = [], enCamino = [], entregados = [] } = data ?? {};

  return (
    <>
      {supervision ? <BannerSupervision area="las entregas" /> : null}
      {enCamino.length > 0 ? (
        <div className="mb-10">
          <SectionTitle
            title={supervision ? "Entregas en camino" : "Mis entregas en camino"}
            hint={`${enCamino.length} en ruta`}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {enCamino.map((p) => (
              <article
                key={p.numero}
                className="snap-in rounded-xl bg-card p-5 ring-1 ring-accent/60"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-accent">
                    <span className="live-dot size-2 rounded-full bg-accent" /> En camino
                  </span>
                  <span className="font-display text-2xl font-semibold">#{p.numero}</span>
                </div>
                <Contacto p={p} />
                <Articulos p={p} />
                <p className="mt-3 text-sm">
                  Cobrar:{" "}
                  <span className="font-display text-lg font-semibold text-accent">
                    {mxn(p.total)}
                  </span>
                </p>
                {supervision ? (
                  <p className="mt-4 rounded-full border border-dashed border-border py-2 text-center text-xs font-semibold text-muted-foreground">
                    Lo lleva {p.repartidor ?? "—"}
                  </p>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      entregar.mutate(p.numero);
                    }}
                  >
                    <label className="mt-4 block text-xs text-muted-foreground">
                      Pide al cliente su número de pedido
                    </label>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={codigo[p.numero] ?? ""}
                        onChange={(e) => setCodigo((c) => ({ ...c, [p.numero]: e.target.value }))}
                        placeholder="Número"
                        inputMode="numeric"
                        className="w-32 rounded-full bg-background px-4 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent"
                      />
                      <button
                        disabled={
                          !codigo[p.numero] ||
                          (entregar.isPending && entregar.variables === p.numero)
                        }
                        className="flex-1 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                      >
                        Confirmar entrega
                      </button>
                    </div>
                  </form>
                )}
                {error[p.numero] ? (
                  <p className="mt-2 text-xs font-semibold text-destructive">{error[p.numero]}</p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <SectionTitle
        title="Disponibles para recoger"
        hint={`${disponibles.length} listos en cocina`}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {disponibles.map((p, i) => (
          <article
            key={p.numero}
            style={{ animationDelay: `${Math.min(i, 6) * 0.06}s` }}
            className="snap-in flex flex-col rounded-xl bg-ticket p-4 text-ticket-foreground ring-1 ring-border"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider opacity-60">
                Listo · {hace(p.fecha_hora, ahora)}
              </span>
              <span className="font-display text-2xl font-semibold">#{p.numero}</span>
            </div>
            <Contacto p={p} />
            <Articulos p={p} />
            <p className="mt-2 text-xs opacity-60">
              {p.items.reduce((s, i) => s + i.cantidad, 0)} artículos · {mxn(p.total)}
            </p>
            {supervision ? null : (
              <button
                disabled={aceptar.isPending && aceptar.variables === p.numero}
                onClick={() => aceptar.mutate(p.numero)}
                className="mt-auto w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50 [margin-top:1rem]"
              >
                Aceptar pedido
              </button>
            )}
          </article>
        ))}
        {disponibles.length === 0 ? (
          <Vacio className="sm:col-span-2 lg:col-span-3">
            No hay pedidos listos por ahora. Te avisamos con un sonido cuando haya uno.
          </Vacio>
        ) : null}
      </div>

      <div className="mt-10">
        <SectionTitle
          title="Entregados hoy"
          hint={`${entregados.length} completados · ${mxn(entregados.reduce((s, p) => s + p.total, 0))}`}
        />
        {entregados.length ? (
          <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
            {entregados.map((p) => (
              <li
                key={p.numero}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <span className="font-display font-semibold">#{p.numero}</span>
                <span className="flex-1 truncate text-muted-foreground">{p.cliente}</span>
                <span className="text-muted-foreground">{hora(p.fecha_hora)}</span>
                <span className="font-medium">{mxn(p.total)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Vacio>Aún no entregas pedidos hoy.</Vacio>
        )}
      </div>
    </>
  );
}
