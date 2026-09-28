// Empleados (cocina y repartidores): contratar, despedir y consultar su acceso
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  Bike,
  ChefHat,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  botonPrimario,
  botonSecundario,
  campo,
  Cargando,
  etiqueta,
  SectionTitle,
  Vacio,
} from "@/components/AppShell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useEnVivo } from "@/lib/live";

type Empleado = {
  id_usuario: number;
  usuario: string;
  puesto: "cocina" | "repartidor";
  nombre: string;
  telefono: string | null;
  email: string | null;
  plataforma: string | null;
  fecha_contratacion: string;
  ultimo_acceso: string | null;
  password_consultable: number;
  sesiones_activas: number;
  entregas: number;
  en_camino: number;
};

const PLATAFORMAS = ["Propio", "UberEats", "Rappi", "DidiFood"];

/** Contraseña aleatoria fácil de dictar (sin 0/O ni 1/l) */
function generarPassword() {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const numeros = "23456789";
  const r = (s: string) => s[Math.floor(Math.random() * s.length)];
  return (
    Array.from({ length: 5 }, () => r(letras)).join("") +
    Array.from({ length: 3 }, () => r(numeros)).join("")
  );
}

const fecha = (f: string | null) => (f ? f.slice(0, 10).split("-").reverse().join("/") : "—");

export function Empleados() {
  const qc = useQueryClient();
  const [contratar, setContratar] = useState(false);
  const [despedir, setDespedir] = useState<Empleado | null>(null);
  const [restablecer, setRestablecer] = useState<Empleado | null>(null);
  const [visibles, setVisibles] = useState<Record<number, string>>({});

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-empleados"],
    queryFn: () => api<Empleado[]>("/admin/empleados"),
  });
  useEnVivo({ pedidos: [["admin-empleados"]], empleados: [["admin-empleados"]] });

  const refrescar = () => qc.invalidateQueries({ queryKey: ["admin-empleados"] });

  const verPassword = async (e: Empleado) => {
    if (visibles[e.id_usuario]) {
      setVisibles((v) => {
        const c = { ...v };
        delete c[e.id_usuario];
        return c;
      });
      return;
    }
    try {
      const r = await api<{ password: string }>(`/admin/empleados/${e.id_usuario}/password`);
      setVisibles((v) => ({ ...v, [e.id_usuario]: r.password }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const bajar = useMutation({
    mutationFn: (e: Empleado) => api(`/admin/empleados/${e.id_usuario}`, { metodo: "DELETE" }),
    onSuccess: (_r, e) => {
      toast.success(`${e.nombre} fue dado de baja y perdió el acceso`);
      setDespedir(null);
      refrescar();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (isLoading) return <Cargando />;
  if (isError) return <Vacio>{(error as Error).message}</Vacio>;
  const empleados = data ?? [];
  const cocina = empleados.filter((e) => e.puesto === "cocina").length;

  return (
    <>
      <SectionTitle
        title="Empleados"
        hint={`${cocina} en cocina · ${empleados.length - cocina} repartidores`}
      >
        <button className={botonPrimario} onClick={() => setContratar(true)}>
          <UserPlus className="size-4" /> Contratar empleado
        </button>
      </SectionTitle>

      {empleados.length ? (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Empleado</th>
                <th className="py-3 font-medium">Puesto</th>
                <th className="py-3 pr-6 font-medium">Usuario</th>
                <th className="py-3 pr-4 font-medium">Contraseña</th>
                <th className="py-3 font-medium">Contacto</th>
                <th className="py-3 font-medium">Alta · último acceso</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {empleados.map((e) => {
                const visible = visibles[e.id_usuario];
                return (
                  <tr key={e.id_usuario} className="align-top">
                    <td className="px-5 py-3">
                      <p className="font-medium">{e.nombre}</p>
                      {e.sesiones_activas ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-success">
                          <span className="live-dot size-1.5 rounded-full bg-success" /> Sesión
                          abierta
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
                        {e.puesto === "cocina" ? (
                          <ChefHat className="size-3.5" />
                        ) : (
                          <Bike className="size-3.5" />
                        )}
                        {e.puesto === "cocina" ? "Cocina" : `Repartidor · ${e.plataforma}`}
                      </span>
                      {e.puesto === "repartidor" ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {e.entregas} entregas{e.en_camino ? ` · ${e.en_camino} en camino` : ""}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3 pr-6 font-mono text-[13px]">{e.usuario}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <span className="min-w-[88px] font-mono text-[13px]">
                          {visible ?? "••••••••"}
                        </span>
                        {e.password_consultable ? (
                          <button
                            onClick={() => verPassword(e)}
                            className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label={visible ? "Ocultar contraseña" : "Ver contraseña"}
                            title={visible ? "Ocultar" : "Ver contraseña"}
                          >
                            {visible ? (
                              <EyeOff className="size-3.5" />
                            ) : (
                              <Eye className="size-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">no consultable</span>
                        )}
                        {visible ? (
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(`${e.usuario} / ${visible}`);
                              toast.success("Usuario y contraseña copiados");
                            }}
                            className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label="Copiar usuario y contraseña"
                            title="Copiar"
                          >
                            <Copy className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 text-xs text-muted-foreground">
                      <p>{e.telefono ?? "—"}</p>
                      <p>{e.email ?? ""}</p>
                    </td>
                    <td className="py-3 text-xs text-muted-foreground">
                      <p>{fecha(e.fecha_contratacion)}</p>
                      <p>
                        {e.ultimo_acceso
                          ? `${fecha(e.ultimo_acceso)} ${e.ultimo_acceso.slice(11, 16)}`
                          : "Nunca ha entrado"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <button
                        onClick={() => setRestablecer(e)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
                      >
                        <KeyRound className="size-3.5" /> Restablecer
                      </button>
                      <button
                        onClick={() => setDespedir(e)}
                        className="ml-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <UserMinus className="size-3.5" /> Despedir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Vacio>Aún no hay empleados. Contrata al personal de cocina y a los repartidores.</Vacio>
      )}

      <p className="mt-4 rounded-xl bg-card px-4 py-3 text-xs text-muted-foreground ring-1 ring-border">
        Las contraseñas de los empleados se guardan cifradas (AES-256) y solo se descifran cuando
        las consultas. Las contraseñas de los clientes no se pueden ver: solo existen como hash.
        Restablecer o despedir cierra al instante las sesiones abiertas de ese empleado.
      </p>

      {contratar ? (
        <FormularioContratar
          onCerrar={() => setContratar(false)}
          onListo={() => {
            setContratar(false);
            refrescar();
          }}
        />
      ) : null}

      {restablecer ? (
        <FormularioRestablecer
          empleado={restablecer}
          onCerrar={() => setRestablecer(null)}
          onListo={(password) => {
            setVisibles((v) => ({ ...v, [restablecer.id_usuario]: password }));
            setRestablecer(null);
            refrescar();
          }}
        />
      ) : null}

      <Dialog open={!!despedir} onOpenChange={(o) => !o && setDespedir(null)}>
        <DialogContent className="border-border bg-card text-foreground sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              ¿Despedir a {despedir?.nombre}?
            </DialogTitle>
            <DialogDescription>
              Su cuenta <span className="font-mono">{despedir?.usuario}</span> se elimina y pierde
              el acceso de inmediato. Su historial de pedidos se conserva en la base de datos.
            </DialogDescription>
          </DialogHeader>
          {despedir?.en_camino ? (
            <p className="rounded-xl bg-destructive/15 px-4 py-2.5 text-xs font-semibold text-destructive">
              Tiene {despedir.en_camino} pedido(s) en camino: no se puede dar de baja hasta que los
              entregue.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button onClick={() => setDespedir(null)} className={botonSecundario}>
              Cancelar
            </button>
            <button
              onClick={() => despedir && bajar.mutate(despedir)}
              disabled={bajar.isPending || !!despedir?.en_camino}
              className="rounded-full bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
            >
              Despedir
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormularioContratar({ onCerrar, onListo }: { onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState({
    nombre: "",
    puesto: "repartidor" as "cocina" | "repartidor",
    usuario: "",
    password: generarPassword(),
    telefono: "",
    email: "",
    plataforma: "Propio",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  const guardar = useMutation({
    mutationFn: () => api("/admin/empleados", { cuerpo: f }),
    onSuccess: () => {
      toast.success(`${f.nombre} fue contratado · usuario ${f.usuario}`);
      onListo();
    },
    onError: (e) => setError((e as Error).message),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    guardar.mutate();
  };

  // Sugerencia de usuario a partir del nombre
  const sugerir = (nombre: string) =>
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(".")
      .replace(/[^a-z0-9.]/g, "");

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-card text-foreground sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Contratar empleado</DialogTitle>
          <DialogDescription>
            Se crea su registro y su cuenta de acceso. Entrega al empleado su usuario y contraseña.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          <div>
            <label className={etiqueta}>Puesto</label>
            <div className="grid grid-cols-2 gap-1 rounded-full bg-background p-1 ring-1 ring-border">
              {(["repartidor", "cocina"] as const).map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setF((x) => ({ ...x, puesto: p }))}
                  className={`inline-flex items-center justify-center gap-2 rounded-full py-2 text-sm ${
                    f.puesto === p
                      ? "bg-accent font-semibold text-accent-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {p === "cocina" ? <ChefHat className="size-4" /> : <Bike className="size-4" />}
                  {p === "cocina" ? "Cocina" : "Repartidor"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={etiqueta}>Nombre completo</label>
            <input
              className={campo}
              value={f.nombre}
              onChange={(e) => {
                const nombre = e.target.value;
                setF((x) => ({
                  ...x,
                  nombre,
                  usuario:
                    x.usuario === "" || x.usuario === sugerir(x.nombre)
                      ? sugerir(nombre)
                      : x.usuario,
                }));
              }}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={etiqueta}>
                Teléfono{f.puesto === "repartidor" ? "" : " (opcional)"}
              </label>
              <input
                className={campo}
                inputMode="tel"
                value={f.telefono}
                onChange={set("telefono")}
                required={f.puesto === "repartidor"}
              />
            </div>
            <div>
              <label className={etiqueta}>Correo (opcional)</label>
              <input className={campo} type="email" value={f.email} onChange={set("email")} />
            </div>
          </div>
          {f.puesto === "repartidor" ? (
            <div>
              <label className={etiqueta}>Plataforma</label>
              <select className={campo} value={f.plataforma} onChange={set("plataforma")}>
                {PLATAFORMAS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-background/60 p-3 ring-1 ring-border">
            <div>
              <label className={etiqueta}>Usuario</label>
              <input
                className={`${campo} font-mono`}
                autoCapitalize="none"
                value={f.usuario}
                onChange={set("usuario")}
                required
              />
            </div>
            <div>
              <label className={etiqueta}>Contraseña</label>
              <div className="flex gap-1">
                <input
                  className={`${campo} font-mono`}
                  value={f.password}
                  onChange={set("password")}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setF((x) => ({ ...x, password: generarPassword() }))}
                  className="grid size-10 shrink-0 place-items-center rounded-full ring-1 ring-border hover:text-accent"
                  title="Generar otra"
                  aria-label="Generar otra contraseña"
                >
                  <RefreshCw className="size-4" />
                </button>
              </div>
            </div>
          </div>
          {error ? (
            <p className="rounded-xl bg-destructive/15 px-4 py-2.5 text-xs font-semibold text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCerrar} className={botonSecundario}>
              Cancelar
            </button>
            <button className={botonPrimario} disabled={guardar.isPending}>
              {guardar.isPending ? "Guardando…" : "Contratar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormularioRestablecer({
  empleado,
  onCerrar,
  onListo,
}: {
  empleado: Empleado;
  onCerrar: () => void;
  onListo: (password: string) => void;
}) {
  const [password, setPassword] = useState(generarPassword());
  const guardar = useMutation({
    mutationFn: () =>
      api(`/admin/empleados/${empleado.id_usuario}/password`, {
        metodo: "PUT",
        cuerpo: { password },
      }),
    onSuccess: () => {
      toast.success(`Nueva contraseña para ${empleado.usuario}`);
      onListo(password);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="border-border bg-card text-foreground sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Restablecer contraseña</DialogTitle>
          <DialogDescription>
            {empleado.nombre} ({empleado.usuario}) tendrá que volver a iniciar sesión con la nueva
            contraseña.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
          className="space-y-4"
        >
          <div className="flex gap-1">
            <input
              className={`${campo} font-mono`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button
              type="button"
              onClick={() => setPassword(generarPassword())}
              className="grid size-10 shrink-0 place-items-center rounded-full ring-1 ring-border hover:text-accent"
              aria-label="Generar otra contraseña"
            >
              <RefreshCw className="size-4" />
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCerrar} className={botonSecundario}>
              Cancelar
            </button>
            <button className={botonPrimario} disabled={guardar.isPending}>
              Guardar contraseña
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
