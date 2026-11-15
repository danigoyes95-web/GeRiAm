import { describe, expect, it } from "vitest";
import { SITES, buildCurve } from "@config/sites.tungurahua";
import { siteParamsFromRow } from "@/lib/sim/params";
import { breachParams, downstreamStage, initialState, stepSite, type SiteState } from "@/lib/sim/physics";

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

/** Rotura desde NAMO durante `hours`, en pasos de 2 min como el simulacro. */
function breach(i: number, hours: number) {
  const p = params(i);
  let s: SiteState = initialState(p, p.namo, 0, 7);
  const v0 = s.v;
  let peak = 0;
  let peakMin = 0;
  for (let m = 0; m < hours * 60; m += 2) {
    s = stepSite(p, s, 120, { breachMin: m, rainMmH: 0 });
    if ((s.qbreach ?? 0) > peak) {
      peak = s.qbreach ?? 0;
      peakMin = m;
    }
  }
  return { p, s, v0, peak, peakMin };
}

describe("rotura de presa", () => {
  it.each([0, 1, 2])("caudal pico del orden de Froehlich y embalse vaciado (sitio %i)", (i) => {
    const { p, s, v0, peak, peakMin } = breach(i, 3);
    const ref = breachParams(p, v0);
    expect(peak).toBeGreaterThan(ref.peakRef * 0.4);
    expect(peak).toBeLessThan(ref.peakRef * 2.5);
    expect(peakMin).toBeLessThan(ref.formMin * 2);
    expect(s.v).toBeLessThan(v0 * 0.15);
    expect(s.cota).toBeLessThan(p.namo - 5);
  });

  it("la onda llega a cada punto en su tiempo de llegada y se atenúa con la distancia", () => {
    const p = params(0);
    let s: SiteState = initialState(p, p.namo, 0, 7);
    const st = (arrival: number, km: number) => ({ code: "x", baseFlow: 1.2, transit: { CHQ: 9999 }, arrival: { CHQ: arrival }, km: { CHQ: km } });
    const points = { near: st(30, 9), far: st(130, 40) };
    const firstRed: Record<string, number | null> = { near: null, far: null };
    const maxQ: Record<string, number> = { near: 0, far: 0 };
    for (let m = 0; m < 300; m += 2) {
      s = stepSite(p, s, 120, { breachMin: m, rainMmH: 0 });
      for (const [k, def] of Object.entries(points)) {
        const r = downstreamStage(def, { CHQ: s });
        maxQ[k] = Math.max(maxQ[k], r.q);
        if (r.stage >= 3.3 && firstRed[k] === null) firstRed[k] = m + 2; // umbral rojo de las estaciones del río
      }
    }
    // el nivel rojo aparece cerca del tiempo de llegada (±15 min), no antes
    expect(firstRed.near).not.toBeNull();
    expect(firstRed.far).not.toBeNull();
    expect(Math.abs(firstRed.near! - 30)).toBeLessThanOrEqual(15);
    expect(Math.abs(firstRed.far! - 130)).toBeLessThanOrEqual(15);
    expect(maxQ.far).toBeLessThan(maxQ.near);
  });
});
