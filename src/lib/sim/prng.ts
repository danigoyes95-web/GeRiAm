/**
 * PRNG determinista (mulberry32) con estado serializable: el simulador es
 * "determinista con ruido" — misma semilla + mismos pasos ⇒ misma serie.
 */
export interface Rng {
  next(): number;
  gauss(mean?: number, sd?: number): number;
  chance(p: number): boolean;
  range(min: number, max: number): number;
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    gauss(mean = 0, sd = 1) {
      const u = Math.max(1e-12, next());
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    chance(p: number) {
      return next() < p;
    },
    range(min: number, max: number) {
      return min + (max - min) * next();
    },
    state: () => s,
  };
}

/** Hash simple de texto → semilla (para derivar semillas por sitio). */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function quantize(v: number, step: number): number {
  return Math.round(v / step) * step;
}
