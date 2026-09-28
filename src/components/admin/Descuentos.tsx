import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  botonPrimario,
  botonSecundario,
  campo,
  Cargando,
  etiqueta,
  SectionTitle,
} from "@/components/AppShell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import type { Categoria, Platillo } from "@/lib/tipos";

type Descuento = {
  id: number;
  nombre: string;
  porcentaje: number;
  id_platillo: number | null;
  id_categoria: number | null;
  platillo: string | null;
  categoria: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  dias_semana: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  activo: number;
  vigente: number;
};

// DAYOFWEEK de MySQL: 1 = domingo … 7 = sábado
const DIAS = [
  { n: 2, l: "Lun" },
  { n: 3, l: "Mar" },
  { n: 4, l: "Mié" },
  { n: 5, l: "Jue" },
  { n: 6, l: "Vie" },
  { n: 7, l: "Sáb" },
  { n: 1, l: "Dom" },
];

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const enDias = (n: number) => {
  const d = new Date(Date.now() + n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Form = {
  id?: number;
  nombre: string;
  porcentaje: string;
  alcance: "todo" | "categoria" | "platillo";
  id_categoria: string;
  id_platillo: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias: number[];
  conHorario: boolean;
  hora_inicio: string;
  hora_fin: string;
  activo: boolean;
};

const fechaCorta = (f: string) => {
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a!.slice(2)}`;
};

function describir(d: Descuento) {
  const dias = d.dias_semana
    ? d.dias_semana
        .split(",")
        .map((n) => DIAS.find((x) => x.n === Number(n))?.l)
        .join(", ")
    : "Todos los días";
  const horario =
    d.hora_inicio && d.hora_fin
      ? ` · ${d.hora_inicio.slice(0, 5)} – ${d.hora_fin.slice(0, 5)}`
      : "";
  return `${dias}${horario}`;
}

export function Descuentos() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const descuentos = useQuery({
    queryKey: ["admin-descuentos"],
    queryFn: () => api<Descuento[]>("/admin/descuentos"),
  });
  const categorias = useQuery({
    queryKey: ["categorias"],
    queryFn: () => api<Categoria[]>("/categorias"),
  });
  const platillos = useQuery({
    queryKey: ["admin-platillos"],
    queryFn: () => api<Platillo[]>("/admin/platillos"),
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["admin-descuentos"] });
    qc.invalidateQueries({ queryKey: ["admin-platillos"] });
  };

  const guardar = useMutation({
    mutationFn: (f: Form) => {
      const cuerpo = {
        nombre: f.nombre,
        porcentaje: Number(f.porcentaje),
        id_categoria: f.alcance === "categoria" ? Number(f.id_categoria) : null,
        id_platillo: f.alcance === "platillo" ? Number(f.id_platillo) : null,
        fecha_inicio: f.fecha_inicio,
        fecha_fin: f.fecha_fin,
        dias_semana: f.dias,
        hora_inicio: f.conHorario ? f.hora_inicio : null,
        hora_fin: f.conHorario ? f.hora_fin : null,
        activo: f.activo,
      };
      return f.id
        ? api(`/admin/descuentos/${f.id}`, { metodo: "PUT", cuerpo })
        : api("/admin/descuentos", { cuerpo });
    },
    onSuccess: () => {
      toast.success("Descuento guardado · el catálogo ya muestra el nuevo precio");
      setForm(null);
      refrescar();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api(`/admin/descuentos/${id}`, { metodo: "DELETE" }),
    onSuccess: () => {
      toast.success("Descuento eliminado");
      refrescar();
    },
  });

  if (descuentos.isLoading) return <Cargando />;

  const nuevo = (): Form => ({
    nombre: "",
    porcentaje: "10",
    alcance: "categoria",
    id_categoria: "",
    id_platillo: "",
    fecha_inicio: hoy(),
    fecha_fin: enDias(7),
    dias: [],
    conHorario: false,
    hora_inicio: "08:00",
    hora_fin: "11:00",
    activo: true,
  });

  const editar = (d: Descuento): Form => ({
    id: d.id,
    nombre: d.nombre,
    porcentaje: String(d.porcentaje),
    alcance: d.id_platillo ? "platillo" : d.id_categoria ? "categoria" : "todo",
    id_categoria: String(d.id_categoria ?? ""),
    id_platillo: String(d.id_platillo ?? ""),
    fecha_inicio: d.fecha_inicio,
    fecha_fin: d.fecha_fin,
    dias: d.dias_semana ? d.dias_semana.split(",").map(Number) : [],
    conHorario: !!d.hora_inicio,
    hora_inicio: d.hora_inicio?.slice(0, 5) ?? "08:00",
    hora_fin: d.hora_fin?.slice(0, 5) ?? "11:00",
    activo: !!d.activo,
  });

  return (
    <>
      <SectionTitle
        title="Descuentos programados"
        hint="Por porcentaje, en un periodo, ciertos días u horarios"
      >
        <button className={botonPrimario} onClick={() => setForm(nuevo())}>
          <Plus className="size-4" /> Nuevo descuento
        </button>
      </SectionTitle>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(descuentos.data ?? []).map((d) => (
          <div
            key={d.id}
            className={`rounded-xl p-5 ring-1 ${d.vigente ? "bg-card ring-accent/60" : "border border-dashed border-border ring-transparent"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-3xl font-semibold text-accent">
                -{Number(d.porcentaje)}%
              </p>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${d.vigente ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"}`}
              >
                {d.vigente ? "Vigente ahora" : d.activo ? "Programado" : "Pausado"}
              </span>
            </div>
            <p className="mt-1 font-semibold">{d.nombre}</p>
            <p className="text-sm text-muted-foreground">
              {d.platillo ?? d.categoria ?? "Todo el menú"}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {fechaCorta(d.fecha_inicio)} → {fechaCorta(d.fecha_fin)}
              <br />
              {describir(d)}
            </p>
            <div className="mt-4 flex gap-3 text-xs">
              <button
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-accent"
                onClick={() => setForm(editar(d))}
              >
                <Pencil className="size-3.5" /> Editar
              </button>
              <button
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive"
                onClick={() => eliminar.mutate(d.id)}
              >
                <Trash2 className="size-3.5" /> Eliminar
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => setForm(nuevo())}
          className="rounded-xl border border-dashed border-border p-5 text-sm font-semibold text-muted-foreground hover:text-accent"
        >
          + Nuevo descuento
        </button>
      </div>

      {form ? (
        <Dialog open onOpenChange={(o) => !o && setForm(null)}>
          <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-card text-foreground sm:rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">
                {form.id ? "Editar descuento" : "Nuevo descuento"}
              </DialogTitle>
              <DialogDescription>
                Si varios descuentos aplican a un platillo, se usa el mayor.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                guardar.mutate(form);
              }}
            >
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className={etiqueta}>Nombre</label>
                  <input
                    className={campo}
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Happy hour de café"
                    required
                  />
                </div>
                <div>
                  <label className={etiqueta}>Porcentaje</label>
                  <input
                    className={campo}
                    inputMode="numeric"
                    value={form.porcentaje}
                    onChange={(e) => setForm({ ...form, porcentaje: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className={etiqueta}>Aplica a</label>
                <div className="grid grid-cols-3 gap-1 rounded-full bg-background p-1 ring-1 ring-border">
                  {(
                    [
                      ["todo", "Todo el menú"],
                      ["categoria", "Categoría"],
                      ["platillo", "Platillo"],
                    ] as const
                  ).map(([k, l]) => (
                    <button
                      type="button"
                      key={k}
                      onClick={() => setForm({ ...form, alcance: k })}
                      className={`rounded-full py-1.5 text-xs ${form.alcance === k ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {form.alcance === "categoria" ? (
                  <select
                    className={`${campo} mt-2`}
                    value={form.id_categoria}
                    onChange={(e) => setForm({ ...form, id_categoria: e.target.value })}
                    required
                  >
                    <option value="">Elegir categoría…</option>
                    {(categorias.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                ) : null}
                {form.alcance === "platillo" ? (
                  <select
                    className={`${campo} mt-2`}
                    value={form.id_platillo}
                    onChange={(e) => setForm({ ...form, id_platillo: e.target.value })}
                    required
                  >
                    <option value="">Elegir platillo…</option>
                    {(platillos.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={etiqueta}>Desde</label>
                  <input
                    type="date"
                    className={campo}
                    value={form.fecha_inicio}
                    onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className={etiqueta}>Hasta</label>
                  <input
                    type="date"
                    className={campo}
                    value={form.fecha_fin}
                    onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className={etiqueta}>Días (ninguno = todos)</label>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS.map((d) => {
                    const on = form.dias.includes(d.n);
                    return (
                      <button
                        type="button"
                        key={d.n}
                        onClick={() =>
                          setForm({
                            ...form,
                            dias: on ? form.dias.filter((x) => x !== d.n) : [...form.dias, d.n],
                          })
                        }
                        className={`rounded-full px-3 py-1.5 text-xs ring-1 ${on ? "bg-accent font-semibold text-accent-foreground ring-accent" : "ring-border text-muted-foreground"}`}
                      >
                        {d.l}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.conHorario}
                    onChange={(e) => setForm({ ...form, conHorario: e.target.checked })}
                    className="accent-[oklch(0.745_0.152_55)]"
                  />
                  Solo en un horario
                </label>
                {form.conHorario ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      className={campo}
                      value={form.hora_inicio}
                      onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })}
                    />
                    <input
                      type="time"
                      className={campo}
                      value={form.hora_fin}
                      onChange={(e) => setForm({ ...form, hora_fin: e.target.value })}
                    />
                  </div>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                  className="accent-[oklch(0.745_0.152_55)]"
                />
                Activo
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setForm(null)} className={botonSecundario}>
                  Cancelar
                </button>
                <button className={botonPrimario} disabled={guardar.isPending}>
                  Guardar descuento
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
