import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { botonPrimario, Cargando, SectionTitle, Vacio } from "@/components/AppShell";
import { api } from "@/lib/api";
import { mxn } from "@/lib/tipos";

export type Ingrediente = {
  id: number;
  nombre: string;
  stock: number;
  unidad: string;
  costo: number;
  platillos: number;
};
type Edicion = { nombre: string; stock: string; unidad: string; costo: string };

const celda =
  "w-full rounded-md bg-background px-2 py-1 text-sm ring-1 ring-border outline-none focus:ring-accent";

export function Inventario() {
  const qc = useQueryClient();
  const [cambios, setCambios] = useState<Record<number, Edicion>>({});
  const [nuevo, setNuevo] = useState<Edicion>({ nombre: "", stock: "", unidad: "Kg", costo: "" });
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-ingredientes"],
    queryFn: () => api<Ingrediente[]>("/admin/ingredientes"),
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["admin-ingredientes"] });
    qc.invalidateQueries({ queryKey: ["admin-platillos"] });
  };

  const guardar = useMutation({
    mutationFn: ({ id, e }: { id?: number; e: Edicion }) => {
      const cuerpo = {
        nombre: e.nombre,
        stock: Number(e.stock),
        unidad: e.unidad,
        costo: Number(e.costo),
      };
      return id
        ? api(`/admin/ingredientes/${id}`, { metodo: "PUT", cuerpo })
        : api("/admin/ingredientes", { cuerpo });
    },
    onSuccess: (_r, v) => {
      toast.success(v.id ? "Inventario actualizado" : "Ingrediente agregado");
      if (v.id)
        setCambios((c) => {
          const x = { ...c };
          delete x[v.id!];
          return x;
        });
      else setNuevo({ nombre: "", stock: "", unidad: "Kg", costo: "" });
      refrescar();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <Cargando />;
  if (isError) return <Vacio>{(error as Error).message}</Vacio>;

  const valor = (data ?? []).reduce((s, i) => s + i.stock * i.costo, 0);

  return (
    <>
      <SectionTitle
        title="Inventario de ingredientes"
        hint={`Valor en almacén ${mxn(Math.round(valor))} · se descuenta solo con cada venta`}
      />
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Ingrediente</th>
              <th className="py-3 font-medium">Stock</th>
              <th className="py-3 font-medium">Unidad</th>
              <th className="py-3 font-medium">Costo unitario</th>
              <th className="py-3 text-right font-medium">Usado en</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data ?? []).map((i) => {
              const e = cambios[i.id] ?? {
                nombre: i.nombre,
                stock: String(i.stock),
                unidad: i.unidad,
                costo: String(i.costo),
              };
              const editado = !!cambios[i.id];
              const set = (k: keyof Edicion, v: string) =>
                setCambios((c) => ({ ...c, [i.id]: { ...e, [k]: v } }));
              const bajo = i.stock <= 2;
              return (
                <tr key={i.id}>
                  <td className="px-5 py-2">
                    <input
                      className={celda}
                      value={e.nombre}
                      onChange={(x) => set("nombre", x.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-1">
                      <input
                        className={`${celda} w-20 ${bajo ? "text-destructive" : ""}`}
                        inputMode="decimal"
                        value={e.stock}
                        onChange={(x) => set("stock", x.target.value)}
                      />
                      {bajo ? (
                        <span className="text-[10px] font-semibold uppercase text-destructive">
                          Bajo
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      className={`${celda} w-16`}
                      value={e.unidad}
                      onChange={(x) => set("unidad", x.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      className={`${celda} w-24`}
                      inputMode="decimal"
                      value={e.costo}
                      onChange={(x) => set("costo", x.target.value)}
                    />
                  </td>
                  <td className="py-2 text-right text-muted-foreground">{i.platillos} platillos</td>
                  <td className="px-5 py-2 text-right">
                    {editado ? (
                      <button
                        onClick={() => guardar.mutate({ id: i.id, e })}
                        className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground"
                      >
                        Guardar
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-background/40">
              <td className="px-5 py-3">
                <input
                  className={celda}
                  placeholder="Nuevo ingrediente"
                  value={nuevo.nombre}
                  onChange={(x) => setNuevo({ ...nuevo, nombre: x.target.value })}
                />
              </td>
              <td className="py-3 pr-2">
                <input
                  className={`${celda} w-20`}
                  placeholder="0"
                  inputMode="decimal"
                  value={nuevo.stock}
                  onChange={(x) => setNuevo({ ...nuevo, stock: x.target.value })}
                />
              </td>
              <td className="py-3 pr-2">
                <input
                  className={`${celda} w-16`}
                  value={nuevo.unidad}
                  onChange={(x) => setNuevo({ ...nuevo, unidad: x.target.value })}
                />
              </td>
              <td className="py-3 pr-2">
                <input
                  className={`${celda} w-24`}
                  placeholder="$"
                  inputMode="decimal"
                  value={nuevo.costo}
                  onChange={(x) => setNuevo({ ...nuevo, costo: x.target.value })}
                />
              </td>
              <td />
              <td className="px-5 py-3 text-right">
                <button
                  disabled={!nuevo.nombre}
                  onClick={() => guardar.mutate({ e: nuevo })}
                  className={`${botonPrimario} px-3 py-1 text-xs`}
                >
                  Agregar
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 rounded-xl bg-card px-4 py-3 text-xs text-muted-foreground ring-1 ring-border">
        Cada venta descuenta los ingredientes de la receta (trigger{" "}
        <code>trg_detalle_descuenta_inventario</code>). Si no alcanza el inventario, el pedido se
        rechaza y el platillo aparece como agotado.
      </p>
    </>
  );
}
