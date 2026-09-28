import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AppShell,
  botonPrimario,
  botonSecundario,
  campo,
  campoArea,
  etiqueta,
  SectionTitle,
  Vacio,
} from "@/components/AppShell";
import { ImagenPlatillo } from "@/components/ImagenPlatillo";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api, inicioDe, useMontado, useSesion } from "@/lib/api";
import { Eye, LogIn, UserPlus } from "lucide-react";
import { useEnVivo } from "@/lib/live";
import {
  descripcionEstado,
  estados,
  hora,
  mxn,
  type Categoria,
  type Estado,
  type Pedido,
  type Platillo,
} from "@/lib/tipos";

export const Route = createFileRoute("/")({
  // ?pagar=1 → al volver del inicio de sesión se abre el carrito para terminar el pedido
  validateSearch: (s: Record<string, unknown>): { pagar?: number | undefined } => ({
    pagar: s["pagar"] === 1 || s["pagar"] === "1" ? 1 : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Catálogo y pedidos — Aroma a Café Co." },
      {
        name: "description",
        content:
          "Explora el catálogo, filtra por categoría y precio, y sigue tu pedido en tiempo real.",
      },
    ],
  }),
  component: ClientePage,
});

const rangos = [
  { label: "Todos los precios", min: 0, max: Infinity },
  { label: "$0 – $100", min: 0, max: 100 },
  { label: "$100 – $200", min: 100, max: 200 },
  { label: "$200 o más", min: 200, max: Infinity },
  { label: "Personalizado…", min: 0, max: Infinity },
];
const PERSONALIZADO = rangos.length - 1;
const CLAVE_CARRITO = "aroma.carrito";

/** Clave de un renglón del carrito: "12" o, con opción, "12|Fresa". */
const claveDe = (id: number, opcion: string | null) => (opcion ? `${id}|${opcion}` : String(id));
const leerClave = (clave: string) => {
  const [id, ...resto] = clave.split("|");
  return { id: Number(id), opcion: resto.join("|") || null };
};
const opcionesDe = (p: Platillo) =>
  (p.opciones ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

type Linea = { clave: string; platillo: Platillo; opcion: string | null; cantidad: number };
type Cambiar = (clave: string, delta: number, max?: number | null) => void;

function useCarrito() {
  const [carrito, setCarrito] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      setCarrito(JSON.parse(localStorage.getItem(CLAVE_CARRITO) ?? "{}"));
    } catch {
      /* sin almacenamiento */
    }
  }, []);
  const guardar = (c: Record<string, number>) => {
    setCarrito(c);
    try {
      localStorage.setItem(CLAVE_CARRITO, JSON.stringify(c));
    } catch {
      /* sin almacenamiento */
    }
  };
  const cambiar: Cambiar = (clave, delta, max) => {
    const n = Math.max(0, (carrito[clave] ?? 0) + delta);
    const tope = max == null ? 30 : Math.min(30, max);
    const c = { ...carrito, [clave]: Math.min(n, tope) };
    if (!c[clave]) delete c[clave];
    guardar(c);
  };
  return { carrito, cambiar, vaciar: () => guardar({}) };
}

function ClientePage() {
  const montado = useMontado();
  const qc = useQueryClient();
  const sesion = useSesion();
  const navigate = useNavigate();
  const { pagar } = Route.useSearch();
  const usuario = sesion.estado === "activa" ? sesion.usuario : null;
  const esCliente = usuario?.rol === "cliente";
  // El menú es público: visitantes y clientes pueden armar su carrito. El admin lo ve en modo consulta.
  const puedeComprar = sesion.estado !== "activa" || esCliente;
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("Todas");
  const [rango, setRango] = useState(0);
  const [minPers, setMinPers] = useState("");
  const [maxPers, setMaxPers] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [seguido, setSeguido] = useState<number | null>(null);
  const { carrito, cambiar, vaciar } = useCarrito();

  const catalogo = useQuery({
    queryKey: ["catalogo"],
    queryFn: () => api<Platillo[]>("/catalogo"),
  });
  const categorias = useQuery({
    queryKey: ["categorias"],
    queryFn: () => api<Categoria[]>("/categorias"),
  });
  const misPedidos = useQuery({
    queryKey: ["mis-pedidos", usuario?.id_usuario],
    queryFn: () => api<Pedido[]>("/mis-pedidos"),
    enabled: esCliente,
    refetchInterval: 20_000,
  });

  useEnVivo({ pedidos: [["mis-pedidos"]], catalogo: [["catalogo"]] }, (evento, d) => {
    if (evento !== "pedidos") return;
    const mio = qc
      .getQueryData<Pedido[]>(["mis-pedidos", usuario?.id_usuario])
      ?.some((p) => p.numero === d.numero);
    if (mio && !d.nuevo)
      toast(`Pedido #${d.numero}: ${d.estado}`, {
        description: descripcionEstado[d.estado as Estado],
      });
  });

  useEffect(() => {
    if (pagar && esCliente) {
      setAbierto(true);
      navigate({ to: "/", search: {}, replace: true });
    }
  }, [pagar, esCliente, navigate]);

  const platillos = useMemo(() => catalogo.data ?? [], [catalogo.data]);
  const visibles = useMemo(() => {
    const r =
      rango === PERSONALIZADO
        ? { min: Number(minPers) || 0, max: maxPers === "" ? Infinity : Number(maxPers) }
        : rangos[rango]!;
    const b = busqueda.trim().toLowerCase();
    return platillos.filter(
      (p) =>
        (p.nombre.toLowerCase().includes(b) || (p.descripcion ?? "").toLowerCase().includes(b)) &&
        (categoria === "Todas" || p.categoria === categoria) &&
        p.precio_final >= r.min &&
        p.precio_final <= r.max,
    );
  }, [platillos, busqueda, categoria, rango, minPers, maxPers]);

  const lineas: Linea[] = Object.entries(carrito).flatMap(([clave, cantidad]) => {
    const { id, opcion } = leerClave(clave);
    const platillo = platillos.find((p) => p.id === id);
    // Descarta renglones de productos que ya no están en el menú o con una opción que ya no existe
    if (!platillo) return [];
    const opciones = opcionesDe(platillo);
    if (opciones.length ? !opcion || !opciones.includes(opcion) : opcion) return [];
    return [{ clave, platillo, opcion, cantidad }];
  });
  const total = lineas.reduce((s, l) => s + l.platillo.precio_final * l.cantidad, 0);
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);

  const activos = (misPedidos.data ?? []).filter((p) => p.estado !== "Entregado");
  const pedidoSeguido =
    (misPedidos.data ?? []).find((p) => p.numero === seguido) ?? activos[0] ?? null;

  return (
    <AppShell>
      {/* Cocina y repartidor solo pueden ver su propia sección */}
      {usuario && (usuario.rol === "cocina" || usuario.rol === "repartidor") ? (
        <Navigate to={inicioDe(usuario.rol)} replace />
      ) : null}
      {usuario?.rol === "admin" ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-accent/10 px-4 py-3 text-sm ring-1 ring-accent/30">
          <Eye className="size-4 shrink-0 text-accent" />
          Estás viendo el menú como administrador (solo consulta). Para editarlo ve a Panel →
          Platillos.
        </div>
      ) : null}
      {montado && esCliente && pedidoSeguido ? (
        <Seguimiento pedido={pedidoSeguido} activos={activos} onElegir={setSeguido} />
      ) : (
        <Bienvenida nombre={esCliente ? (usuario?.nombre ?? null) : null} />
      )}

      <div id="catalogo" className="mt-10 scroll-mt-6">
        <SectionTitle title="Catálogo" hint={`${visibles.length} platillos · MXN`}>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar platillos…"
            className="w-full rounded-full bg-card px-4 py-2 text-sm text-foreground outline-none ring-1 ring-border placeholder:text-muted-foreground focus:ring-accent sm:w-48"
          />
          <select
            value={rango}
            onChange={(e) => setRango(Number(e.target.value))}
            className="rounded-full bg-card px-3 py-2 text-sm text-muted-foreground ring-1 ring-border"
            aria-label="Rango de precios"
          >
            {rangos.map((r, i) => (
              <option key={r.label} value={i}>
                {r.label}
              </option>
            ))}
          </select>
          {rango === PERSONALIZADO ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              $
              <input
                value={minPers}
                onChange={(e) => setMinPers(e.target.value)}
                inputMode="numeric"
                placeholder="mín"
                className="w-16 rounded-full bg-card px-3 py-2 text-sm text-foreground ring-1 ring-border outline-none"
              />
              –
              <input
                value={maxPers}
                onChange={(e) => setMaxPers(e.target.value)}
                inputMode="numeric"
                placeholder="máx"
                className="w-16 rounded-full bg-card px-3 py-2 text-sm text-foreground ring-1 ring-border outline-none"
              />
            </span>
          ) : null}
        </SectionTitle>

        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {["Todas", ...(categorias.data ?? []).map((c) => c.nombre)].map((c) => (
            <button
              key={c}
              onClick={() => setCategoria(c)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ring-1 transition-colors ${
                categoria === c
                  ? "bg-accent font-semibold text-accent-foreground ring-accent"
                  : "bg-card text-muted-foreground ring-border hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {catalogo.isLoading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-card" />
            ))}
          </div>
        ) : catalogo.isError ? (
          <Vacio>No se pudo cargar el catálogo: {(catalogo.error as Error).message}</Vacio>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {visibles.map((p, i) => (
              <TarjetaPlatillo
                key={p.id}
                p={p}
                i={i}
                carrito={carrito}
                cambiar={cambiar}
                puedeComprar={puedeComprar}
              />
            ))}
          </div>
        )}
        {!catalogo.isLoading && visibles.length === 0 && platillos.length > 0 ? (
          <Vacio>No hay platillos con esos filtros.</Vacio>
        ) : null}
      </div>

      {montado && usuario && (misPedidos.data?.length ?? 0) > 0 ? (
        <HistorialCliente
          pedidos={misPedidos.data!}
          onSeguir={(n) => {
            setSeguido(n);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : null}

      {piezas > 0 && puedeComprar ? (
        <button
          onClick={() => setAbierto(true)}
          className="fixed bottom-4 right-4 z-10 flex items-center gap-3 rounded-full bg-accent py-2 pl-2 pr-5 text-accent-foreground shadow-[0_12px_30px_-10px_rgba(240,138,60,0.6)] transition-transform hover:-translate-y-0.5"
        >
          <span className="grid size-9 place-items-center rounded-full bg-card text-sm font-semibold text-card-foreground">
            {piezas}
          </span>
          <span className="text-sm font-semibold">Ver carrito · {mxn(total)}</span>
        </button>
      ) : null}

      <Carrito
        abierto={abierto}
        setAbierto={setAbierto}
        lineas={lineas}
        total={total}
        cambiar={cambiar}
        vaciar={vaciar}
        onPedido={(p) => {
          setSeguido(p.numero);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </AppShell>
  );
}

function TarjetaPlatillo({
  p,
  i,
  carrito,
  cambiar,
  puedeComprar,
}: {
  p: Platillo;
  i: number;
  carrito: Record<string, number>;
  cambiar: Cambiar;
  puedeComprar: boolean;
}) {
  const opciones = opcionesDe(p);
  const [opcion, setOpcion] = useState<string | null>(opciones[0] ?? null);
  const clave = claveDe(p.id, opcion);
  const enCarrito = carrito[clave] ?? 0;
  const agotado = p.porciones !== null && p.porciones <= 0;
  return (
    <article
      style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}
      className="snap-in flex flex-col rounded-xl bg-ticket p-3 text-ticket-foreground ring-1 ring-border transition-transform hover:-translate-y-1"
    >
      <div className="relative mb-3">
        <ImagenPlatillo src={p.imagen} alt={p.nombre} categoria={p.categoria} />
        {agotado ? (
          <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/60 text-sm font-semibold text-white">
            Agotado
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider opacity-50">{p.categoria}</span>
        {p.descuento > 0 ? (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">
            -{Number(p.descuento)}%
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 font-display text-base font-semibold leading-tight sm:text-lg">
        {p.nombre}
      </p>
      {p.descripcion ? (
        <p className="mt-1 line-clamp-2 text-xs opacity-60">{p.descripcion}</p>
      ) : null}
      {opciones.length ? (
        <div
          className="mt-2 flex flex-wrap gap-1"
          role="radiogroup"
          aria-label={`Sabor de ${p.nombre}`}
        >
          {opciones.map((o) => (
            <button
              key={o}
              role="radio"
              aria-checked={opcion === o}
              onClick={() => setOpcion(o)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition-colors ${
                opcion === o
                  ? "bg-card text-card-foreground ring-card"
                  : "ring-current/25 opacity-70 hover:opacity-100"
              }`}
            >
              {o}
              {carrito[claveDe(p.id, o)] ? ` · ${carrito[claveDe(p.id, o)]}` : ""}
            </button>
          ))}
        </div>
      ) : null}
      <p className="mt-auto pt-2 text-sm font-semibold">
        {mxn(p.precio_final)}{" "}
        {p.descuento > 0 ? (
          <span className="text-xs font-normal line-through opacity-50">{mxn(p.precio)}</span>
        ) : null}
      </p>
      {!puedeComprar ? null : enCarrito ? (
        <div className="mt-3 flex items-center justify-between rounded-full bg-card p-1 text-card-foreground">
          <button
            onClick={() => cambiar(clave, -1)}
            className="grid size-8 place-items-center rounded-full hover:bg-secondary"
            aria-label="Quitar uno"
          >
            <Minus className="size-4" />
          </button>
          <span className="font-display text-lg font-semibold">{enCarrito}</span>
          <button
            onClick={() => cambiar(clave, 1, p.porciones)}
            className="grid size-8 place-items-center rounded-full bg-accent text-accent-foreground"
            aria-label="Agregar uno"
          >
            <Plus className="size-4" />
          </button>
        </div>
      ) : (
        <button
          disabled={agotado}
          onClick={() => cambiar(clave, 1, p.porciones)}
          className="mt-3 w-full rounded-full bg-card py-2 text-sm font-semibold text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
        >
          {agotado ? "Sin existencias" : opcion ? `Añadir · ${opcion}` : "Añadir"}
        </button>
      )}
    </article>
  );
}

function Bienvenida({ nombre }: { nombre: string | null }) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-card p-7 ring-1 ring-border sm:p-10">
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-accent/15" />
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
        {nombre ? `Hola, ${nombre}` : "Cocina abierta · pedidos en línea"}
      </p>
      <h1 className="max-w-[16ch] font-display text-5xl font-semibold leading-none tracking-tight text-flame sm:text-7xl">
        Tu café, directo de la barra
      </h1>
      <p className="mt-4 max-w-[38ch] text-pretty text-sm text-muted-foreground">
        Elige, paga al recibir y sigue tu pedido en vivo: cocina, repartidor y entrega en una sola
        pantalla.
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <a href="#catalogo" className={botonPrimario}>
          Hacer un pedido
        </a>
        <span className="text-xs text-muted-foreground">Entrega en ~25 min · $0 envío</span>
      </div>
    </section>
  );
}

function Seguimiento({
  pedido,
  activos,
  onElegir,
}: {
  pedido: Pedido;
  activos: Pedido[];
  onElegir: (n: number) => void;
}) {
  const paso = estados.indexOf(pedido.estado);
  const rail = useRef<HTMLDivElement>(null);
  // En celular el rail se desplaza solo hasta la estación actual
  useEffect(() => {
    const el = rail.current?.children[paso] as HTMLElement | undefined;
    if (el && rail.current) rail.current.scrollTo({ left: el.offsetLeft - 16, behavior: "smooth" });
  }, [paso, pedido.numero]);
  const horaDe = (e: Estado) => pedido.seguimiento?.find((s) => s.estado === e)?.fecha_hora;
  return (
    <section>
      <div className="relative overflow-hidden rounded-2xl bg-card p-7 ring-1 ring-border sm:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-accent/15" />
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
          {pedido.estado !== "Entregado" ? (
            <span className="live-dot size-2 rounded-full bg-accent" />
          ) : null}
          {pedido.estado === "Entregado" ? "Pedido entregado" : "Pedido en vivo"} · #{pedido.numero}
        </p>
        <h1 className="max-w-[18ch] font-display text-4xl font-semibold leading-none tracking-tight text-flame sm:text-6xl">
          {
            {
              Pendiente: "Tu pedido ya está en la fila",
              "En Preparación": "La cocina está en lo tuyo",
              Listo: "Listo, esperando repartidor",
              "En Camino": "Va en camino a tu puerta",
              Entregado: "¡Buen provecho!",
            }[pedido.estado]
          }
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {pedido.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(" · ")} —{" "}
          <span className="font-semibold text-foreground">{mxn(pedido.total)}</span>
        </p>
        {activos.length > 1 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {activos.map((p) => (
              <button
                key={p.numero}
                onClick={() => onElegir(p.numero)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${p.numero === pedido.numero ? "bg-accent text-accent-foreground ring-accent" : "ring-border text-muted-foreground"}`}
              >
                #{p.numero} · {p.estado}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Ticket rail · estado del pedido
        </p>
        <div
          ref={rail}
          className="relative -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
        >
          {estados.map((estado, i) => {
            const hecho = i <= paso;
            const t = horaDe(estado);
            return (
              <div
                key={`${pedido.numero}-${estado}-${hecho}`}
                style={{ animationDelay: `${i * 0.08}s` }}
                className={
                  hecho
                    ? "w-40 shrink-0 snap-in rounded-xl bg-ticket p-4 text-ticket-foreground shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]"
                    : "w-40 shrink-0 rounded-xl border border-dashed border-border p-4 text-muted-foreground"
                }
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
                    Paso {i + 1}
                  </span>
                  {hecho ? (
                    <span
                      className={`size-2 rounded-full ${i === paso && estado !== "Entregado" ? "live-dot bg-accent" : "bg-success"}`}
                    />
                  ) : (
                    <span className="size-2 rounded-full border border-border" />
                  )}
                </div>
                <p className="mt-2 font-display text-lg font-semibold leading-tight">{estado}</p>
                <p className="mt-1 text-xs opacity-60">
                  {hecho && t ? `${hora(t)} · ` : ""}
                  {descripcionEstado[estado]}
                </p>
              </div>
            );
          })}
        </div>
        {pedido.estado !== "Entregado" ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-5 py-4 ring-1 ring-border">
            <p className="text-sm text-muted-foreground">
              Muestra este número al repartidor para recibir tu pedido
              {pedido.repartidor && pedido.estado === "En Camino" ? (
                <>
                  {" "}
                  · lo lleva <span className="text-foreground">{pedido.repartidor}</span>
                </>
              ) : null}
            </p>
            <span className="rounded-lg bg-ticket px-4 py-1 font-display text-3xl font-semibold tracking-wider text-ticket-foreground">
              {pedido.numero}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HistorialCliente({
  pedidos,
  onSeguir,
}: {
  pedidos: Pedido[];
  onSeguir: (n: number) => void;
}) {
  return (
    <div className="mt-12">
      <SectionTitle title="Mis pedidos" hint={`${pedidos.length} recientes`} />
      <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
        {pedidos.map((p) => (
          <li key={p.numero}>
            <button
              onClick={() => onSeguir(p.numero)}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left text-sm hover:bg-secondary/40"
            >
              <span className="font-display font-semibold">#{p.numero}</span>
              <span className="text-muted-foreground">{p.fecha_hora.slice(0, 16)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {p.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(", ")}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${p.estado === "Entregado" ? "bg-secondary" : "bg-accent text-accent-foreground"}`}
              >
                {p.estado}
              </span>
              <span className="w-20 text-right font-medium">{mxn(p.total)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Carrito({
  abierto,
  setAbierto,
  lineas,
  total,
  cambiar,
  vaciar,
  onPedido,
}: {
  abierto: boolean;
  setAbierto: (b: boolean) => void;
  lineas: Linea[];
  total: number;
  cambiar: Cambiar;
  vaciar: () => void;
  onPedido: (p: Pedido) => void;
}) {
  const qc = useQueryClient();
  const sesion = useSesion();
  const navigate = useNavigate();
  const usuario =
    sesion.estado === "activa" && sesion.usuario.rol === "cliente" ? sesion.usuario : null;
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [notas, setNotas] = useState("");
  const [guardarDatos, setGuardarDatos] = useState(false);

  useEffect(() => {
    if (usuario) {
      setDireccion((d) => d || usuario.direccion || "");
      setTelefono((t) => t || usuario.telefono || "");
    }
  }, [usuario]);

  const pedir = useMutation({
    mutationFn: () =>
      api<Pedido>("/pedidos", {
        cuerpo: {
          items: lineas.map((l) => ({
            id_platillo: l.platillo.id,
            cantidad: l.cantidad,
            opcion: l.opcion,
          })),
          direccion,
          telefono,
          notas,
          guardarDatos,
        },
      }),
    onSuccess: (p) => {
      vaciar();
      setNotas("");
      setAbierto(false);
      qc.invalidateQueries({ queryKey: ["mis-pedidos"] });
      toast.success(`¡Pedido #${p.numero} enviado a cocina!`, {
        description: "Muestra ese número al repartidor al recibirlo.",
      });
      onPedido(p);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto border-border bg-background p-0 text-foreground sm:max-w-md">
        <SheetHeader className="border-b border-border p-6 text-left">
          <SheetTitle className="font-display text-2xl text-foreground">Tu carrito</SheetTitle>
          <SheetDescription>Revisa tu pedido y confirma la entrega.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-3 p-6">
          {lineas.length === 0 ? (
            <Vacio>
              <ShoppingBag className="mx-auto mb-2 size-6" />
              Tu carrito está vacío.
            </Vacio>
          ) : (
            lineas.map(({ clave, platillo: p, opcion, cantidad }) => (
              <div
                key={clave}
                className="flex items-center gap-3 rounded-xl bg-card p-2 ring-1 ring-border"
              >
                <div className="w-14 shrink-0">
                  <ImagenPlatillo
                    src={p.imagen}
                    alt={p.nombre}
                    categoria={p.categoria}
                    className="rounded-lg"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {p.nombre}
                    {opcion ? (
                      <span className="font-normal text-muted-foreground"> · {opcion}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mxn(p.precio_final)} c/u {p.descuento > 0 ? `· -${Number(p.descuento)}%` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => cambiar(clave, -1)}
                    className="grid size-7 place-items-center rounded-full ring-1 ring-border"
                    aria-label="Quitar uno"
                  >
                    {cantidad === 1 ? (
                      <Trash2 className="size-3.5" />
                    ) : (
                      <Minus className="size-3.5" />
                    )}
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{cantidad}</span>
                  <button
                    onClick={() => cambiar(clave, 1, p.porciones)}
                    className="grid size-7 place-items-center rounded-full bg-accent text-accent-foreground"
                    aria-label="Agregar uno"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}

          {lineas.length > 0 ? (
            <div className="flex items-baseline justify-between border-t border-dashed border-border pt-4">
              <span className="text-sm text-muted-foreground">Total a pagar</span>
              <span className="font-display text-3xl font-semibold text-accent">{mxn(total)}</span>
            </div>
          ) : null}

          {lineas.length > 0 && !usuario ? (
            <div className="space-y-2 rounded-2xl bg-card p-5 text-center ring-1 ring-border">
              <p className="text-sm text-muted-foreground">
                Para enviar tu pedido necesitas una cuenta. Tu carrito se guarda mientras tanto.
              </p>
              <button
                onClick={() => navigate({ to: "/login", search: { destino: "/?pagar=1" } })}
                className={`${botonPrimario} w-full py-3`}
              >
                <LogIn className="size-4" /> Iniciar sesión para pedir
              </button>
              <button
                onClick={() =>
                  navigate({ to: "/login", search: { destino: "/?pagar=1", modo: "registro" } })
                }
                className={`${botonSecundario} w-full py-2.5`}
              >
                <UserPlus className="size-4" /> Crear cuenta
              </button>
            </div>
          ) : null}

          {lineas.length > 0 && usuario ? (
            <form
              className="space-y-3 pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                pedir.mutate();
              }}
            >
              <div>
                <label className={etiqueta}>Dirección de entrega</label>
                <textarea
                  className={campoArea}
                  rows={2}
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Calle, número, colonia, referencias"
                />
              </div>
              <div>
                <label className={etiqueta}>Teléfono de contacto</label>
                <input
                  className={campo}
                  inputMode="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </div>
              <div>
                <label className={etiqueta}>Notas para cocina (opcional)</label>
                <input
                  className={campo}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Sin cebolla, leche deslactosada…"
                />
              </div>
              {direccion !== (usuario.direccion ?? "") || telefono !== (usuario.telefono ?? "") ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={guardarDatos}
                    onChange={(e) => setGuardarDatos(e.target.checked)}
                    className="accent-[oklch(0.745_0.152_55)]"
                  />
                  Guardar como mi dirección y teléfono
                </label>
              ) : null}
              <button className={`${botonPrimario} w-full py-3`} disabled={pedir.isPending}>
                {pedir.isPending ? "Enviando…" : `Confirmar pedido · ${mxn(total)}`}
              </button>
              <button type="button" onClick={vaciar} className={`${botonSecundario} w-full`}>
                Vaciar carrito
              </button>
            </form>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
