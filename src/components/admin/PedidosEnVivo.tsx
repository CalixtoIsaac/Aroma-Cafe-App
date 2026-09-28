import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Cargando, SectionTitle, Vacio } from "@/components/AppShell";
import { api } from "@/lib/api";
import { estados, hace, hora, mxn, useAhora, type Pedido } from "@/lib/tipos";

const color: Record<string, string> = {
  Pendiente: "bg-ticket text-ticket-foreground",
  "En Preparación": "bg-accent text-accent-foreground",
  Listo: "bg-success/20 text-foreground ring-1 ring-success/60",
  "En Camino": "bg-accent/20 text-foreground ring-1 ring-accent/60",
  Entregado: "bg-secondary text-muted-foreground",
};

export function PedidosEnVivo() {
  const ahora = useAhora();
  const [filtro, setFiltro] = useState<string>("Activos");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-pedidos"],
    queryFn: () => api<Pedido[]>("/admin/pedidos"),
    refetchInterval: 20_000,
  });
  if (isLoading) return <Cargando />;
  if (isError) return <Vacio>{(error as Error).message}</Vacio>;
  const pedidos = data ?? [];
  const visibles = pedidos.filter((p) =>
    filtro === "Todos"
      ? true
      : filtro === "Activos"
        ? p.estado !== "Entregado"
        : p.estado === filtro,
  );

  return (
    <>
      <SectionTitle
        title="Pedidos en vivo"
        hint={
          <span className="flex items-center gap-2">
            <span className="live-dot size-2 rounded-full bg-success" /> Activos y entregados hoy
          </span>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {["Activos", ...estados, "Todos"].map((e) => {
          const n =
            e === "Todos"
              ? pedidos.length
              : e === "Activos"
                ? pedidos.filter((p) => p.estado !== "Entregado").length
                : pedidos.filter((p) => p.estado === e).length;
          return (
            <button
              key={e}
              onClick={() => setFiltro(e)}
              className={`rounded-full px-3 py-1.5 text-xs ring-1 ${filtro === e ? "bg-accent font-semibold text-accent-foreground ring-accent" : "bg-card text-muted-foreground ring-border"}`}
            >
              {e} · {n}
            </button>
          );
        })}
      </div>
      {visibles.length ? (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Pedido</th>
                <th className="py-3 font-medium">Cliente</th>
                <th className="py-3 font-medium">Artículos</th>
                <th className="py-3 font-medium">Repartidor</th>
                <th className="py-3 font-medium">Estado</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibles.map((p) => (
                <tr key={`${p.numero}-${p.estado}`} className="snap-in">
                  <td className="px-5 py-3">
                    <span className="font-display font-semibold">#{p.numero}</span>
                    <span className="block text-xs text-muted-foreground">
                      {hora(p.fecha_hora)} · {hace(p.fecha_hora, ahora)}
                    </span>
                  </td>
                  <td className="py-3">
                    {p.cliente}
                    <span className="block max-w-[22ch] truncate text-xs text-muted-foreground">
                      {p.direccion}
                    </span>
                  </td>
                  <td className="max-w-[28ch] py-3 text-xs text-muted-foreground">
                    {p.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(", ")}
                  </td>
                  <td className="py-3 text-muted-foreground">{p.repartidor ?? "—"}</td>
                  <td className="py-3">
                    <span
                      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${color[p.estado]}`}
                    >
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-medium">{mxn(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Vacio>No hay pedidos en este filtro.</Vacio>
      )}
    </>
  );
}
