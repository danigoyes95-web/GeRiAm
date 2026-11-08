import type { AreaVolumePoint } from "@/lib/domain/types";

/** Interpolación lineal en la curva área–volumen. */
export function volumeAt(curve: AreaVolumePoint[], cota: number): number {
  if (curve.length === 0) return 0;
  if (cota <= curve[0].cota) return curve[0].volumen;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (cota <= b.cota) {
      const t = (cota - a.cota) / (b.cota - a.cota);
      return a.volumen + t * (b.volumen - a.volumen);
    }
  }
  const last = curve[curve.length - 1];
  return last.volumen + (cota - last.cota) * last.area;
}

export function areaAt(curve: AreaVolumePoint[], cota: number): number {
  if (curve.length === 0) return 0;
  if (cota <= curve[0].cota) return curve[0].area;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (cota <= b.cota) {
      const t = (cota - a.cota) / (b.cota - a.cota);
      return a.area + t * (b.area - a.area);
    }
  }
  return curve[curve.length - 1].area;
}

export function cotaAt(curve: AreaVolumePoint[], volumen: number): number {
  if (curve.length === 0) return 0;
  if (volumen <= curve[0].volumen) return curve[0].cota;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (volumen <= b.volumen) {
      const t = (volumen - a.volumen) / (b.volumen - a.volumen);
      return a.cota + t * (b.cota - a.cota);
    }
  }
  const last = curve[curve.length - 1];
  return last.cota + (volumen - last.volumen) / Math.max(1, last.area);
}

/** % de llenado respecto a la capacidad (volumen en NAMO). */
export function fillPercent(curve: AreaVolumePoint[], cota: number | null | undefined, capacity: number): number | null {
  if (cota === null || cota === undefined || !capacity) return null;
  return (volumeAt(curve, cota) / capacity) * 100;
}
