// Tiempo real: Socket.IO avisa cuando cambian pedidos o catálogo y
// React Query vuelve a pedir los datos afectados.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
  return socket;
}

export type EventoPedido = { numero: number; estado: string; nuevo?: boolean };

/**
 * Suscribe la pantalla a eventos del servidor. Cada evento invalida las
 * consultas indicadas; `alRecibir` permite reaccionar (toast, sonido…).
 */
export function useEnVivo(
  suscripciones: Partial<Record<"pedidos" | "catalogo" | "clientes" | "empleados", string[][]>>,
  alRecibir?: (evento: string, datos: EventoPedido) => void,
) {
  const qc = useQueryClient();
  const clave = JSON.stringify(suscripciones);
  useEffect(() => {
    const s = getSocket();
    const subs = JSON.parse(clave) as typeof suscripciones;
    const manejadores = Object.entries(subs).map(([evento, keys]) => {
      const fn = (datos: EventoPedido) => {
        keys?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
        alRecibir?.(evento, datos);
      };
      s.on(evento, fn);
      return [evento, fn] as const;
    });
    // Al reconectar, refresca todo lo suscrito
    const reconectar = () =>
      Object.values(subs)
        .flat()
        .forEach((k) => qc.invalidateQueries({ queryKey: k }));
    s.io.on("reconnect", reconectar);
    return () => {
      manejadores.forEach(([e, fn]) => s.off(e, fn));
      s.io.off("reconnect", reconectar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, qc]);
}

export function useConectado() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const s = getSocket();
    const on = () => setOk(true);
    const off = () => setOk(false);
    setOk(s.connected);
    s.on("connect", on);
    s.on("disconnect", off);
    return () => {
      s.off("connect", on);
      s.off("disconnect", off);
    };
  }, []);
  return ok;
}

/** Pequeño "ding" para avisar a cocina/repartidor sin archivos de audio. */
export function ding() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.14 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.14 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.14);
      o.stop(ctx.currentTime + i * 0.14 + 0.4);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    /* sin audio */
  }
}
