// Clientes: solo datos básicos. Sus contraseñas nunca se muestran ni viajan al navegador.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Cargando, SectionTitle, Vacio } from "@/components/AppShell";
import { api } from "@/lib/api";
import { mxn } from "@/lib/tipos";

type Cliente = {
  id_cliente: number;
  nombre: string;
  usuario: string | null;
  email: string;
  telefono: string;
  fecha_registro: string;
  pedidos: number;
  gastado: number;
};

export function Clientes() {
  const [busqueda, setBusqueda] = useState("");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-clientes"],
    queryFn: () => api<Cliente[]>("/admin/clientes"),
  });
  if (isLoading) return <Cargando />;
  if (isError) return <Vacio>{(error as Error).message}</Vacio>;
  const b = busqueda.trim().toLowerCase();
  const lista = (data ?? []).filter(
    (c) =>
      c.nombre.toLowerCase().includes(b) ||
      (c.usuario ?? "").includes(b) ||
      c.email.toLowerCase().includes(b),
  );

  return (
    <>
      <SectionTitle title="Clientes" hint={`${data?.length ?? 0} registrados · solo datos básicos`}>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente…"
          className="w-48 rounded-full bg-card px-4 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent"
        />
      </SectionTitle>
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="py-3 font-medium">Usuario</th>
              <th className="py-3 font-medium">Contacto</th>
              <th className="py-3 font-medium">Registro</th>
              <th className="py-3 text-right font-medium">Pedidos</th>
              <th className="px-5 py-3 text-right font-medium">Consumo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lista.map((c) => (
              <tr key={c.id_cliente}>
                <td className="px-5 py-3 font-medium">{c.nombre}</td>
                <td className="py-3 font-mono text-[13px]">{c.usuario ?? "—"}</td>
                <td className="py-3 text-xs text-muted-foreground">
                  <p>{c.telefono}</p>
                  <p>{c.email}</p>
                </td>
                <td className="py-3 text-xs text-muted-foreground">
                  {c.fecha_registro.slice(0, 10).split("-").reverse().join("/")}
                </td>
                <td className="py-3 text-right">{c.pedidos}</td>
                <td className="px-5 py-3 text-right font-medium">{mxn(c.gastado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-card px-4 py-3 text-xs text-muted-foreground ring-1 ring-border">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        Por privacidad, las contraseñas de los clientes no se pueden consultar: se guardan solo como
        hash SHA-256 con sal, que no se puede revertir. Si un cliente olvida la suya, debe crear una
        cuenta nueva o pedir que se restablezca desde la base de datos.
      </p>
    </>
  );
}
