import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  botonPrimario,
  botonSecundario,
  campo,
  campoArea,
  Cargando,
  etiqueta,
  SectionTitle,
  Vacio,
} from "@/components/AppShell";
import { ImagenPlatillo } from "@/components/ImagenPlatillo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { mxn, type Categoria, type Platillo } from "@/lib/tipos";
import type { Ingrediente } from "./Inventario";

type LineaReceta = { id_ingrediente: number; nombre?: string; cantidad: number; unidad?: string };
type PlatilloAdmin = Platillo & { costo: number; vendidos: number; receta: LineaReceta[] };

type Formulario = {
  id?: number;
  nombre: string;
  descripcion: string;
  precio: string;
  id_categoria: string;
  disponible: boolean;
  imagen: string;
  opciones: string;
  receta: { id_ingrediente: string; cantidad: string }[];
};

const vacio: Formulario = {
  nombre: "",
  descripcion: "",
  precio: "",
  id_categoria: "",
  disponible: true,
  imagen: "",
  opciones: "",
  receta: [],
};

export function Platillos() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Formulario | null>(null);
  const [borrar, setBorrar] = useState<PlatilloAdmin | null>(null);
  const [precios, setPrecios] = useState<Record<number, string>>({});
  const [busqueda, setBusqueda] = useState("");

  const platillos = useQuery({
    queryKey: ["admin-platillos"],
    queryFn: () => api<PlatilloAdmin[]>("/admin/platillos"),
  });
  const categorias = useQuery({
    queryKey: ["categorias"],
    queryFn: () => api<Categoria[]>("/categorias"),
  });
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["admin-platillos"] });
    qc.invalidateQueries({ queryKey: ["catalogo"] });
  };

  const precio = useMutation({
    mutationFn: ({ id, valor }: { id: number; valor: number }) =>
      api(`/admin/platillos/${id}/precio`, {
        metodo: "PATCH",
        cuerpo: { precio: valor },
      }),
    onSuccess: (_r, v) => {
      toast.success("Precio actualizado");
      setPrecios((p) => {
        const c = { ...p };
        delete c[v.id];
        return c;
      });
      refrescar();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const disponible = useMutation({
    mutationFn: (p: PlatilloAdmin) =>
      api(`/admin/platillos/${p.id}`, {
        metodo: "PUT",
        cuerpo: {
          nombre: p.nombre,
          descripcion: p.descripcion,
          precio: p.precio,
          id_categoria: p.id_categoria,
          imagen: p.imagen,
          disponible: !p.disponible,
        },
      }),
    onSuccess: refrescar,
    onError: (e) => toast.error((e as Error).message),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) =>
      api<{ logico: boolean }>(`/admin/platillos/${id}`, { metodo: "DELETE" }),
    onSuccess: (r) => {
      toast.success(
        r.logico
          ? "Platillo retirado del menú (se conserva en el historial de ventas)"
          : "Platillo eliminado",
      );
      setBorrar(null);
      refrescar();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (platillos.isLoading) return <Cargando />;
  if (platillos.isError) return <Vacio>{(platillos.error as Error).message}</Vacio>;
  const lista = (platillos.data ?? []).filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );

  const editar = (p: PlatilloAdmin) =>
    setForm({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion ?? "",
      precio: String(p.precio),
      id_categoria: String(p.id_categoria),
      disponible: !!p.disponible,
      imagen: p.imagen ?? "",
      opciones: (p.opciones ?? "").split(",").join(", "),
      receta: p.receta.map((r) => ({
        id_ingrediente: String(r.id_ingrediente),
        cantidad: String(r.cantidad),
      })),
    });

  return (
    <>
      <SectionTitle
        title="Platillos"
        hint={`${platillos.data?.length ?? 0} en catálogo · crear, editar precio, retirar`}
      >
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar…"
          className="w-40 rounded-full bg-card px-4 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent"
        />
        <button onClick={() => setForm({ ...vacio })} className={botonPrimario}>
          <Plus className="size-4" /> Nuevo platillo
        </button>
      </SectionTitle>

      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Platillo</th>
              <th className="py-3 font-medium">Categoría</th>
              <th className="py-3 font-medium">Precio</th>
              <th className="py-3 text-right font-medium">Desc.</th>
              <th className="py-3 text-right font-medium">Final</th>
              <th
                className="py-3 text-right font-medium"
                title="Porciones posibles con el inventario actual"
              >
                Porciones
              </th>
              <th className="py-3 pr-4 text-right font-medium">Vendidos</th>
              <th className="py-3 text-center font-medium">Menú</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lista.map((p) => {
              const editado = precios[p.id];
              return (
                <tr key={p.id} className={p.disponible ? "" : "opacity-50"}>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 shrink-0">
                        <ImagenPlatillo
                          src={p.imagen}
                          alt={p.nombre}
                          categoria={p.categoria}
                          className="rounded-lg"
                        />
                      </div>
                      <div>
                        <p className="font-medium">{p.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          Costo insumos {mxn(p.costo)}
                          {p.opciones ? ` · Sabores: ${p.opciones.split(",").join(", ")}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-muted-foreground">{p.categoria}</td>
                  <td className="py-2.5">
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editado !== undefined)
                          precio.mutate({ id: p.id, valor: Number(editado) });
                      }}
                    >
                      <span className="text-muted-foreground">$</span>
                      <input
                        value={editado ?? String(p.precio)}
                        onChange={(e) => setPrecios((x) => ({ ...x, [p.id]: e.target.value }))}
                        inputMode="decimal"
                        className="w-20 rounded-md bg-background px-2 py-1 text-sm ring-1 ring-border outline-none focus:ring-accent"
                        aria-label={`Precio de ${p.nombre}`}
                      />
                      {editado !== undefined && Number(editado) !== p.precio ? (
                        <button className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground">
                          Guardar
                        </button>
                      ) : null}
                    </form>
                  </td>
                  <td className="py-2.5 text-right text-accent">
                    {p.descuento > 0 ? `-${Number(p.descuento)}%` : "—"}
                  </td>
                  <td className="py-2.5 text-right font-medium">{mxn(p.precio_final)}</td>
                  <td
                    className={`py-2.5 text-right ${p.porciones !== null && p.porciones < 10 ? "font-semibold text-destructive" : ""}`}
                  >
                    {p.porciones ?? "∞"}
                  </td>
                  <td className="py-2.5 pr-4 text-right">{p.vendidos}</td>
                  <td className="py-2.5 text-center">
                    <button
                      onClick={() => disponible.mutate(p)}
                      className={`relative h-5 w-9 rounded-full transition-colors ${p.disponible ? "bg-accent" : "bg-secondary"}`}
                      aria-label={p.disponible ? "Ocultar del menú" : "Mostrar en el menú"}
                      title={p.disponible ? "Visible en el menú" : "Oculto del menú"}
                    >
                      <span
                        className={`absolute top-0.5 size-4 rounded-full bg-foreground transition-all ${p.disponible ? "left-[1.1rem]" : "left-0.5"}`}
                      />
                    </button>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <button
                      onClick={() => editar(p)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
                    >
                      <Pencil className="size-3.5" /> Editar
                    </button>
                    <button
                      onClick={() => setBorrar(p)}
                      className="ml-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" /> Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {form ? (
        <FormularioPlatillo
          form={form}
          setForm={setForm}
          categorias={categorias.data ?? []}
          onGuardado={refrescar}
        />
      ) : null}

      <Dialog open={!!borrar} onOpenChange={(o) => !o && setBorrar(null)}>
        <DialogContent className="border-border bg-card text-foreground sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">¿Eliminar {borrar?.nombre}?</DialogTitle>
            <DialogDescription>
              Si el platillo ya tiene ventas se retira del menú pero se conserva en el historial
              (borrado lógico), para no romper los reportes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <button onClick={() => setBorrar(null)} className={botonSecundario}>
              Cancelar
            </button>
            <button
              onClick={() => borrar && eliminar.mutate(borrar.id)}
              disabled={eliminar.isPending}
              className="rounded-full bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground"
            >
              Eliminar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormularioPlatillo({
  form,
  setForm,
  categorias,
  onGuardado,
}: {
  form: Formulario;
  setForm: (f: Formulario | null) => void;
  categorias: Categoria[];
  onGuardado: () => void;
}) {
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const ingredientes = useQuery({
    queryKey: ["admin-ingredientes"],
    queryFn: () => api<Ingrediente[]>("/admin/ingredientes"),
  });
  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setForm({ ...form, [k]: v });

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        ...form,
        precio: Number(form.precio),
        id_categoria: Number(form.id_categoria),
        receta: form.receta.map((r) => ({
          id_ingrediente: Number(r.id_ingrediente),
          cantidad: Number(r.cantidad),
        })),
      };
      return form.id
        ? api(`/admin/platillos/${form.id}`, { metodo: "PUT", cuerpo })
        : api("/admin/platillos", { cuerpo });
    },
    onSuccess: () => {
      toast.success(
        form.id ? "Platillo actualizado" : "Platillo creado · ya aparece en el catálogo",
      );
      setForm(null);
      onGuardado();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const subir = async (f: File) => {
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("imagen", f);
      const r = await api<{ url: string }>("/admin/imagen", { formData: fd });
      set("imagen", r.url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubiendo(false);
    }
  };

  const nombreCat = categorias.find((c) => String(c.id) === form.id_categoria)?.nombre ?? "";

  return (
    <Dialog open onOpenChange={(o) => !o && setForm(null)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-card text-foreground sm:max-w-xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {form.id ? "Editar platillo" : "Nuevo platillo"}
          </DialogTitle>
          <DialogDescription>
            Los cambios se reflejan al instante en el catálogo de los clientes.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
        >
          <div className="flex gap-4">
            <div className="w-28 shrink-0">
              <ImagenPlatillo src={form.imagen || null} alt="Vista previa" categoria={nombreCat} />
              <input
                ref={archivo}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])}
              />
              <button
                type="button"
                onClick={() => archivo.current?.click()}
                className={`${botonSecundario} mt-2 w-full`}
                disabled={subiendo}
              >
                <Upload className="size-3.5" /> {subiendo ? "Subiendo…" : "Foto"}
              </button>
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <label className={etiqueta}>Nombre</label>
                <input
                  className={campo}
                  value={form.nombre}
                  onChange={(e) => set("nombre", e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={etiqueta}>Precio (MXN)</label>
                  <input
                    className={campo}
                    inputMode="decimal"
                    value={form.precio}
                    onChange={(e) => set("precio", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className={etiqueta}>Categoría</label>
                  <select
                    className={campo}
                    value={form.id_categoria}
                    onChange={(e) => set("id_categoria", e.target.value)}
                    required
                  >
                    <option value="">Elegir…</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div>
            <label className={etiqueta}>Descripción</label>
            <textarea
              className={campoArea}
              rows={2}
              value={form.descripcion}
              onChange={(e) => set("descripcion", e.target.value)}
            />
          </div>
          <div>
            <label className={etiqueta}>URL de imagen (opcional)</label>
            <input
              className={campo}
              value={form.imagen}
              onChange={(e) => set("imagen", e.target.value)}
              placeholder="https://… (o usa el botón Foto)"
            />
          </div>
          <div>
            <label className={etiqueta}>Sabores u opciones (opcional)</label>
            <input
              className={campo}
              value={form.opciones}
              onChange={(e) => set("opciones", e.target.value)}
              placeholder="Vainilla, Chocolate, Fresa"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Sepáralos con comas. El cliente elegirá uno al agregarlo al carrito.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className={`${etiqueta} mb-0`}>Receta (descuenta inventario al vender)</label>
              <button
                type="button"
                onClick={() =>
                  set("receta", [...form.receta, { id_ingrediente: "", cantidad: "" }])
                }
                className="text-xs font-semibold text-accent"
              >
                + Ingrediente
              </button>
            </div>
            {form.receta.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sin receta: el platillo no tiene límite de porciones.
              </p>
            ) : null}
            <div className="space-y-2">
              {form.receta.map((r, i) => {
                const ing = ingredientes.data?.find((x) => String(x.id) === r.id_ingrediente);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className={campo}
                      value={r.id_ingrediente}
                      onChange={(e) =>
                        set(
                          "receta",
                          form.receta.map((x, j) =>
                            j === i ? { ...x, id_ingrediente: e.target.value } : x,
                          ),
                        )
                      }
                    >
                      <option value="">Ingrediente…</option>
                      {(ingredientes.data ?? []).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      className={`${campo} w-24`}
                      inputMode="decimal"
                      placeholder="Cant."
                      value={r.cantidad}
                      onChange={(e) =>
                        set(
                          "receta",
                          form.receta.map((x, j) =>
                            j === i ? { ...x, cantidad: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <span className="w-8 text-xs text-muted-foreground">{ing?.unidad ?? ""}</span>
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "receta",
                          form.receta.filter((_, j) => j !== i),
                        )
                      }
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Quitar ingrediente"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.disponible}
              onChange={(e) => set("disponible", e.target.checked)}
              className="accent-[oklch(0.745_0.152_55)]"
            />
            Visible en el menú
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setForm(null)} className={botonSecundario}>
              Cancelar
            </button>
            <button className={botonPrimario} disabled={guardar.isPending}>
              {guardar.isPending ? "Guardando…" : "Guardar platillo"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
