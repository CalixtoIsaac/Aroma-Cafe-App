import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { botonSecundario, Cargando, SectionTitle, Vacio } from "@/components/AppShell";
import { api, tokenActual } from "@/lib/api";
import { estados, mxn } from "@/lib/tipos";

type Metrica = {
  ventas: number;
  costo: number;
  pedidos: number;
  utilidad: number;
  anterior: number;
  etiqueta: string;
};
type Datos = {
  metricas: Record<"hoy" | "semana" | "mes", Metrica>;
  serie: { dia: string; ventas: number; pedidos: number; utilidad: number }[];
  porHora: { hora: number; ventas: number; pedidos: number }[];
  top: { nombre: string; categoria: string; unidades: number; ventas: number }[];
  periodoTop: string;
  estados: { estado: string; pedidos: number; monto: number }[];
  horaActual: number;
};

const nombres = { hoy: "Hoy", semana: "Semana", mes: "Mes" } as const;
const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const etiquetaDia = (d: string) => {
  const f = new Date(`${d}T12:00:00`);
  return `${dias[f.getDay()]} ${f.getDate()}`;
};

function CajaTooltip({ titulo, lineas }: { titulo: string; lineas: string[] }) {
  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-border">
      <p className="font-semibold">{titulo}</p>
      {lineas.map((l) => (
        <p key={l} className="text-muted-foreground">
          {l}
        </p>
      ))}
    </div>
  );
}

export function Resumen({ irA }: { irA: (s: string) => void }) {
  const [top, setTop] = useState<"hoy" | "semana" | "mes">("mes");
  const [periodoReporte, setPeriodoReporte] = useState<"hoy" | "semana" | "mes">("mes");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-resumen", top],
    queryFn: () => api<Datos>(`/admin/resumen?top=${top}`),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

  if (isLoading) return <Cargando />;
  if (isError || !data) return <Vacio>{(error as Error)?.message}</Vacio>;

  const descargar = (formato: "pdf" | "xlsx") =>
    `/api/admin/reporte.${formato}?periodo=${periodoReporte}&token=${tokenActual() ?? ""}`;

  // Ganancia acumulada del día, hora por hora
  let acumulado = 0;
  // Hora del servidor MySQL (así el eje coincide con las ventas registradas)
  const horaActual = data.horaActual;
  const inicio = Math.max(0, Math.min(8, horaActual - 1, ...data.porHora.map((h) => h.hora)));
  const crecimiento = [];
  for (let h = inicio; h <= Math.max(horaActual, inicio); h++) {
    acumulado += data.porHora.find((x) => x.hora === h)?.ventas ?? 0;
    crecimiento.push({ hora: `${String(h).padStart(2, "0")}:00`, acumulado });
  }
  const maxTop = Math.max(1, ...data.top.map((t) => Number(t.unidades)));
  const enCurso = data.estados.reduce((s, e) => s + Number(e.monto), 0);

  return (
    <>
      <SectionTitle
        title="Resumen administrativo"
        hint={
          <span className="flex items-center gap-2">
            <span className="live-dot size-2 rounded-full bg-success" /> Datos en tiempo real desde
            MySQL
          </span>
        }
      >
        <select
          value={periodoReporte}
          onChange={(e) => setPeriodoReporte(e.target.value as typeof periodoReporte)}
          className="rounded-full bg-card px-3 py-2 text-xs text-muted-foreground ring-1 ring-border"
          aria-label="Periodo del reporte"
        >
          <option value="hoy">Ventas de hoy</option>
          <option value="semana">Ventas de la semana</option>
          <option value="mes">Ventas del mes</option>
        </select>
        <a href={descargar("pdf")} className={botonSecundario}>
          <FileText className="size-3.5" /> Exportar PDF
        </a>
        <a href={descargar("xlsx")} className={botonSecundario}>
          <FileSpreadsheet className="size-3.5" /> Exportar Excel
        </a>
      </SectionTitle>

      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(nombres) as (keyof typeof nombres)[]).map((k, i) => {
          const m = data.metricas[k];
          const delta = m.anterior > 0 ? ((m.ventas - m.anterior) / m.anterior) * 100 : null;
          return (
            <div
              key={k}
              style={{ animationDelay: `${i * 0.08}s` }}
              className="snap-in rounded-xl bg-card p-5 ring-1 ring-border"
            >
              <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                Ganancia · {nombres[k]}
              </p>
              <p
                key={m.ventas}
                className="snap-in mt-1 font-display text-4xl font-semibold leading-none"
              >
                {mxn(Math.round(m.ventas))}
              </p>
              <p
                className={`mt-2 text-xs font-semibold ${delta === null ? "text-muted-foreground" : delta >= 0 ? "text-accent" : "text-destructive"}`}
              >
                {delta === null
                  ? "Sin datos previos"
                  : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}% ${m.etiqueta}`}
              </p>
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                {m.pedidos} pedidos · utilidad {mxn(Math.round(m.utilidad))}
              </p>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => irA("pedidos")}
        className="mt-4 flex w-full flex-wrap items-center gap-2 rounded-xl bg-card px-5 py-3 text-left ring-1 ring-border hover:ring-accent"
      >
        <span className="mr-2 text-sm font-semibold">Pedidos en curso</span>
        {estados.slice(0, 4).map((e) => {
          const n = data.estados.find((x) => x.estado === e)?.pedidos ?? 0;
          return (
            <span
              key={e}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${n ? "bg-accent/15 text-foreground" : "bg-secondary text-muted-foreground"}`}
            >
              {e}: {n}
            </span>
          );
        })}
        <span className="ml-auto text-xs text-muted-foreground">{mxn(enCurso)} por cobrar</span>
      </button>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="rounded-xl bg-card p-5 ring-1 ring-border lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Productos más vendidos</p>
            <div className="flex gap-1 rounded-full bg-background p-0.5 ring-1 ring-border">
              {(Object.keys(nombres) as (keyof typeof nombres)[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setTop(k)}
                  className={`rounded-full px-2.5 py-1 text-[11px] ${top === k ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground"}`}
                >
                  {nombres[k]}
                </button>
              ))}
            </div>
          </div>
          {data.top.length ? (
            <div className="space-y-3">
              {data.top.map((p, i) => (
                <div key={p.nombre} title={`${p.unidades} unidades · ${mxn(p.ventas)}`}>
                  <div className="mb-1 flex justify-between gap-2 text-xs">
                    <span className="truncate">{p.nombre}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {p.unidades} u · {mxn(p.ventas)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ${i === 0 ? "bg-accent" : "bg-ticket"}`}
                      style={{ width: `${(Number(p.unidades) / maxTop) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Vacio>Sin ventas entregadas en este periodo.</Vacio>
          )}
        </div>

        <div className="rounded-xl bg-card p-5 ring-1 ring-border lg:col-span-3">
          <p className="text-sm font-semibold">Crecimiento de la ganancia hoy</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Acumulado por hora · se actualiza con cada entrega
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={crecimiento} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="relleno" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="hora"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                  width={56}
                />
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <CajaTooltip
                        titulo={String(label)}
                        lineas={[`Acumulado ${mxn(Number(payload[0]!.value))}`]}
                      />
                    ) : null
                  }
                />
                <Area
                  type="monotone"
                  dataKey="acumulado"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  fill="url(#relleno)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-card p-5 ring-1 ring-border">
        <p className="text-sm font-semibold">Ventas de los últimos 30 días</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Pedidos entregados por día · la barra resaltada es hoy
        </p>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.serie}
              margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              barCategoryGap={2}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="dia"
                tickFormatter={etiquetaDia}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                width={48}
              />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload }) => {
                  const d = payload?.[0]?.payload as Datos["serie"][number] | undefined;
                  return active && d ? (
                    <CajaTooltip
                      titulo={etiquetaDia(d.dia)}
                      lineas={[
                        `Ventas ${mxn(d.ventas)}`,
                        `${d.pedidos} pedidos`,
                        `Utilidad ${mxn(Math.round(d.utilidad))}`,
                      ]}
                    />
                  ) : null;
                }}
              />
              <Bar dataKey="ventas" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {data.serie.map((d, i) => (
                  <Cell
                    key={d.dia}
                    fill={i === data.serie.length - 1 ? "var(--accent)" : "var(--ticket)"}
                    fillOpacity={i === data.serie.length - 1 ? 1 : 0.55}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
