import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SITES, buildCurve } from "@config/sites.tungurahua";
import { siteParamsFromRow } from "@/lib/sim/params";
import {
  breachHydrograph,
  computeImpact,
  hazardClass,
  parseFlood,
  stageFor,
  type DamInput,
  type FloodMeta,
} from "@/lib/flood/impact";

const meta = JSON.parse(readFileSync("public/flood/meta.json", "utf8")) as FloodMeta;
const buf = (p: string) => {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const fd = parseFlood(meta, buf("public/flood/cells.bin"), buf("public/flood/buildings.bin"));

function dam(code: string, breachAtMin: number): DamInput {
  const s = SITES.find((x) => x.code === code)!;
  const p = siteParamsFromRow({
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
  return {
    code,
    name: s.name,
    breachAtMin,
    hydro: breachHydrograph(p),
    table: s.downstream.map((d) => [d.distancia_km, d.llegada_min]),
  };
}

describe("impacto de la crecida", () => {
  it("clases de peligro por profundidad y fuerza del flujo", () => {
    expect(hazardClass(0.02, 1)).toBe(0);
    expect(hazardClass(0.3, 0.5)).toBe(1);
    expect(hazardClass(0.8, 0.5)).toBe(2);
    expect(hazardClass(1, 1.5)).toBe(3);
    expect(hazardClass(1, 2)).toBe(3);
    expect(hazardClass(1, 2, 1825)).toBe(4); // el mismo flujo con lodo pasa a extremo
    expect(hazardClass(5, 0.1)).toBe(4);
  });

  it("la curva de descarga da más nivel con más caudal y con escombros", () => {
    const seg = meta.segments[10];
    const a = stageFor(seg, meta.levels, 100).h;
    const b = stageFor(seg, meta.levels, 1000).h;
    expect(b).toBeGreaterThan(a);
    expect(stageFor(seg, meta.levels, 1000, 1.5).h).toBeGreaterThan(b);
  });

  it("rotura de Chiquiurco + Mulacorral: inunda, y los escombros agrandan la zona y el peligro", () => {
    const dams = [dam("CHQ", 25), dam("MLC", 37)];
    const agua = computeImpact(fd, dams, "agua", null);
    const lodo = computeImpact(fd, dams, "lodo", null);
    expect(agua.totals.areaHa).toBeGreaterThan(50);
    expect(agua.totals.peakQ).toBeGreaterThan(1000);
    expect(lodo.totals.areaHa).toBeGreaterThan(agua.totals.areaHa);
    const severe = (r: typeof agua) => r.totals.buildingsByClass[3] + r.totals.buildingsByClass[4];
    expect(severe(lodo)).toBeGreaterThanOrEqual(severe(agua));
    expect(agua.zones.length).toBeGreaterThan(3);
    expect(agua.zones[0].score).toBeGreaterThanOrEqual(agua.zones[1].score);
  });

  it("antes de que se abra la brecha no hay agua en el valle", () => {
    const r = computeImpact(fd, [dam("CHQ", 25)], "agua", 20);
    expect(r.totals.areaHa).toBe(0);
  });
});
