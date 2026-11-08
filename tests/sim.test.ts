import { describe, expect, it } from "vitest";
import { SITES, buildCurve } from "@config/sites.tungurahua";
import { siteParamsFromRow } from "@/lib/sim/params";
import { initialState, stepSite, qoutOf, type SiteState } from "@/lib/sim/physics";
import { volumeAt, cotaAt } from "@/lib/hydro/curve";

function params(i: number) {
  const s = SITES[i];
  return siteParamsFromRow({
    code: s.code,
    cota_fondo: s.cota_fondo,
    cota_namo: s.cota_namo,
    cota_name: s.cota_name,
    cota_vertedero: s.cota_vertedero,
    cota_cresta: s.cota_cresta,
    longitud_vertedero: s.longitud_vertedero,
    coeficiente_descarga: s.coeficiente_descarga,
    caudal_entrada_base: s.caudal_entrada_base,
    caudal_salida_nominal: s.caudal_salida_nominal,
    area_cuenca_km2: s.area_cuenca_km2,
    capacity_m3: s.capacity_m3,
    curva_area_volumen: buildCurve(s.cota_fondo, s.cota_namo, s.cota_cresta, s.capacity_m3, s.curva_m),
  });
}

describe("curva área–volumen", () => {
  it("V(NAMO) = capacidad e inversa consistente", () => {
    const p = params(0);
    expect(volumeAt(p.curve, p.namo)).toBeCloseTo(3_500_000, -3);
    expect(cotaAt(p.curve, volumeAt(p.curve, 3735.3))).toBeCloseTo(3735.3, 2);
  });
});

describe("simulador físico", () => {
  it("es determinista con la misma semilla", () => {
    const p = params(0);
    const a = stepSite(p, initialState(p, p.namo - 0.6, 0, 42), 6 * 3600);
    const b = stepSite(p, initialState(p, p.namo - 0.6, 0, 42), 6 * 3600);
    expect(a.cota).toBe(b.cota);
    expect(a.qin).toBe(b.qin);
  });

  it("30 días de operación normal se mantienen en un rango plausible", () => {
    for (const i of [0, 1]) {
      const p = params(i);
      let s: SiteState = initialState(p, p.namo - 0.6, Date.UTC(2026, 9, 1), 7 + i);
      let min = Infinity;
      let max = -Infinity;
      let qinSum = 0;
      const steps = 30 * 96;
      for (let k = 0; k < steps; k++) {
        s = stepSite(p, s, 900);
        min = Math.min(min, s.cota);
        max = Math.max(max, s.cota);
        qinSum += s.qin;
      }
      expect(max).toBeLessThan(p.cresta - 0.5);
      expect(min).toBeGreaterThan(p.namo - 3);
      const qinMean = qinSum / steps;
      expect(qinMean).toBeGreaterThan(p.qinBase * 0.4);
      expect(qinMean).toBeLessThan(p.qinBase * 2.5);
    }
  });

  it("vertedero: Q = C·L·H^1.5 cuando el nivel supera la cota de vertedero", () => {
    const p = params(0);
    let s = initialState(p, p.vertedero + 0.5, 0, 1);
    const H = s.cota - p.vertedero;
    s = stepSite(p, s, 60, { rainMmH: 0 });
    expect(s.qspill).toBeCloseTo(p.coefDescarga * p.longitudVertedero * Math.pow(H, 1.5), 1);
    expect(qoutOf(s)).toBeGreaterThan(s.qspill);
  });

  it("una tormenta extrema eleva el nivel y activa el vertedero", () => {
    const p = params(0);
    let s = initialState(p, p.namo - 0.3, Date.UTC(2026, 10, 7, 18), 3);
    const start = s.cota;
    for (let m = 0; m < 240; m += 5) s = stepSite(p, s, 300, { rainMmH: 45, runoffCoef: 0.75 });
    expect(s.cota).toBeGreaterThan(start + 0.5);
    expect(s.qspill).toBeGreaterThan(1);
  });
});
