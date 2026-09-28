import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Protegido } from "@/components/Acceso";
import { Resumen } from "@/components/admin/Resumen";
import { PedidosEnVivo } from "@/components/admin/PedidosEnVivo";
import { Platillos } from "@/components/admin/Platillos";
import { Descuentos } from "@/components/admin/Descuentos";
import { Inventario } from "@/components/admin/Inventario";
import { Empleados } from "@/components/admin/Empleados";
import { Clientes } from "@/components/admin/Clientes";
import { useEnVivo } from "@/lib/live";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administrador — Aroma a Café Co." },
      {
        name: "description",
        content:
          "Resumen de ganancias, productos más vendidos, catálogo y descuentos de la dark kitchen.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <Protegido roles={["admin"]}>
        <AdminPanel />
      </Protegido>
    </AppShell>
  ),
});

const secciones = [
  { id: "resumen", label: "Resumen" },
  { id: "pedidos", label: "Pedidos en vivo" },
  { id: "platillos", label: "Platillos" },
  { id: "descuentos", label: "Descuentos" },
  { id: "inventario", label: "Inventario" },
  { id: "empleados", label: "Empleados" },
  { id: "clientes", label: "Clientes" },
] as const;
type Seccion = (typeof secciones)[number]["id"];

function AdminPanel() {
  const [seccion, setSeccion] = useState<Seccion>("resumen");

  // Todo el panel se refresca solo cuando cambia algo en cualquier pantalla
  useEnVivo(
    {
      pedidos: [["admin-resumen"], ["admin-pedidos"], ["admin-platillos"], ["admin-ingredientes"]],
      catalogo: [["admin-platillos"], ["admin-descuentos"], ["admin-ingredientes"]],
    },
    (evento, d) => {
      if (evento !== "pedidos") return;
      if (d.nuevo) toast(`Nuevo pedido #${d.numero}`);
      else if (d.estado === "Entregado")
        toast.success(`#${d.numero} entregado · la ganancia ya se sumó`);
    },
  );

  return (
    <>
      <div className="-mx-4 mb-7 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {secciones.map((s) => (
          <button
            key={s.id}
            onClick={() => setSeccion(s.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ring-1 transition-colors ${
              seccion === s.id
                ? "bg-foreground font-semibold text-background ring-foreground"
                : "bg-card text-muted-foreground ring-border hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {seccion === "resumen" ? <Resumen irA={(s) => setSeccion(s as Seccion)} /> : null}
      {seccion === "pedidos" ? <PedidosEnVivo /> : null}
      {seccion === "platillos" ? <Platillos /> : null}
      {seccion === "descuentos" ? <Descuentos /> : null}
      {seccion === "inventario" ? <Inventario /> : null}
      {seccion === "empleados" ? <Empleados /> : null}
      {seccion === "clientes" ? <Clientes /> : null}
    </>
  );
}
