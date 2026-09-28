// Tipos compartidos y utilidades de formato
import { useEffect, useState } from "react";

export type Estado = "Pendiente" | "En Preparación" | "Listo" | "En Camino" | "Entregado";

export const estados: Estado[] = ["Pendiente", "En Preparación", "Listo", "En Camino", "Entregado"];

export const descripcionEstado: Record<Estado, string> = {
  Pendiente: "Recepción confirmada",
  "En Preparación": "Cocina preparando",
  Listo: "Listo · esperando repartidor",
  "En Camino": "Repartidor en camino",
  Entregado: "¡Buen provecho!",
};

export type Platillo = {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  id_categoria: number;
  categoria: string;
  disponible: number | boolean;
  imagen: string | null;
  descuento: number;
  precio_final: number;
  porciones: number | null;
  /** Sabores u opciones separados por coma, ej. "Vainilla,Chocolate,Fresa" */
  opciones: string | null;
};

export type Categoria = { id: number; nombre: string; descripcion: string | null };

export type ItemPedido = {
  /** Incluye la opción elegida, ej. "Malteada (Fresa)" */
  nombre: string;
  opcion?: string | null;
  cantidad: number;
  precio: number;
  subtotal: number;
  descuento: number;
};

export type Pedido = {
  numero: number;
  fecha_hora: string;
  estado: Estado;
  total: number;
  notas: string | null;
  cliente: string;
  telefono: string;
  direccion: string;
  id_repartidor: number | null;
  repartidor: string | null;
  items: ItemPedido[];
  seguimiento?: { estado: Estado; fecha_hora: string }[];
};

export const mxn = (n: number) =>
  `$${Number(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 })}`;

/** "2026-09-24 12:04:33" → "12:04" */
export const hora = (fecha: string) => fecha?.slice(11, 16) ?? "";

/** Convierte la fecha de MySQL (hora local del servidor) a Date */
export const aFecha = (fecha: string) => new Date(fecha.replace(" ", "T"));

/** Reloj que avanza cada `ms` para textos tipo "hace 3 min" */
export function useAhora(ms = 30_000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

export function hace(fecha: string, ahora: number) {
  const min = Math.max(0, Math.round((ahora - aFecha(fecha).getTime()) / 60000));
  if (min < 1) return "justo ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h ${min % 60} min`;
  return `hace ${Math.floor(h / 24)} d`;
}
