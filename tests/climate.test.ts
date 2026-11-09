import { describe, expect, it } from "vitest";
import { SITES, buildCurve } from "@config/sites.tungurahua";
import { CLIMATOLOGIA } from "@config/climatologia.tungurahua";
import { siteParamsFromRow } from "@/lib/sim/params";
import { initialState, stepSite } from "@/lib/sim/physics";

function paramsWithClimate(i: number) {
  const c = SITES[i];
  const clima = CLIMATOLOGIA[c.code as "CHQ" | "MLC"];
  return siteParamsFromRow({
    ...c,
    curva_area_volumen: buildCurve(c.cota_fondo, c.cota_namo, c.cota_cresta, c.capacity_m3, c.curva_m),
    metadata: { clima },
  } as never);
}

/** Simula N años a paso horario y devuelve lluvia por hora (mm). */
function simulateRain(i: number, years: number, seed: number) {
  const p = paramsWithClimate(i);
  let s = initialState(p, p.namo - 0.6, Date.UTC(2014, 0, 1, 5), seed);
  const out: { t: number; mm: number }[] = [];
  for (let k = 0; k < years * 365 * 24; k++) {
    s = stepSite(p, s, 3600);
    out.push({ t: s.t, mm: s.rainAcc });
    s.rainAcc = 0;
  }
  return { p, out };
}

describe("generador de lluvia calibrado con estaciones HGPT", () => {
  for (const [i, code] of [[0, "CHQ"], [1, "MLC"]] as const) {
    it(`${code}: lluvia media, estacionalidad e intensidades como los registros 2013–2025`, () => {
      const real = CLIMATOLOGIA[code];
      const { out } = simulateRain(i, 6, 1234 + i);
      const total = out.reduce((a, x) => a + x.mm, 0);
      const perDay = total / (6 * 365);
      // lluvia media diaria dentro de ±20 % de la observada
      expect(perDay).toBeGreaterThan(real.lluvia_media_mm_dia * 0.8);
      expect(perDay).toBeLessThan(real.lluvia_media_mm_dia * 1.2);
      // estacionalidad: junio+julio claramente más lluviosos que septiembre+octubre
      const byMonth = new Array(12).fill(0);
      for (const x of out) byMonth[new Date(x.t - 5 * 3600_000).getUTCMonth()] += x.mm;
      expect((byMonth[5] + byMonth[6]) / (byMonth[8] + byMonth[9])).toBeGreaterThan(1.5);
      // intensidad horaria: el percentil 99 de las horas lluviosas en el rango observado
      const wet = out.map((x) => x.mm).filter((v) => v >= 0.1).sort((a, b) => a - b);
      const p99 = wet[Math.floor(wet.length * 0.99)];
      expect(p99).toBeGreaterThan(real.evento_pico_p90_mmh * 0.7);
      expect(p99).toBeLessThan(real.evento_pico_p99_mmh * 2);
      // máximo horario simulado no supera ampliamente el récord observado
      expect(Math.max(...wet)).toBeLessThan(Math.max(36.2, real.max_horario.mm) * 1.3);
    });
  }
});
