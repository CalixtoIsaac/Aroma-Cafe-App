import {
  CakeSlice,
  Coffee,
  EggFried,
  Sandwich,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

const iconos: Record<string, LucideIcon> = {
  Bebidas: Coffee,
  Comidas: Sandwich,
  Desayunos: EggFried,
  Postres: CakeSlice,
};

/** Foto del platillo o, si no tiene, un marcador con el ícono de su categoría. */
export function ImagenPlatillo({
  src,
  alt,
  categoria,
  className = "",
}: {
  src: string | null;
  alt: string;
  categoria: string;
  className?: string;
}) {
  const [fallo, setFallo] = useState(false);
  // Si cambia la foto (p. ej. el admin sube una nueva), se vuelve a intentar cargarla
  useEffect(() => setFallo(false), [src]);
  if (src && !fallo) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFallo(true)}
        className={`aspect-square w-full rounded-xl object-cover ${className}`}
      />
    );
  }
  const Icono = iconos[categoria] ?? UtensilsCrossed;
  return (
    <div
      className={`grid aspect-square w-full place-items-center rounded-xl bg-[radial-gradient(circle_at_30%_20%,oklch(0.745_0.152_55/0.35),transparent_60%),linear-gradient(160deg,oklch(0.3_0.04_50),oklch(0.2_0.025_48))] ${className}`}
      role="img"
      aria-label={alt}
    >
      <Icono className="size-1/3 text-[oklch(0.925_0.028_80/0.85)]" strokeWidth={1.25} />
    </div>
  );
}
