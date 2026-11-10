import { describe, expect, it } from "vitest";
import { gumbelReturnPeriods } from "@/lib/inamhi/geoglows";

describe("periodos de retorno (Gumbel)", () => {
  const maxima = [120, 135, 150, 160, 142, 175, 190, 128, 210, 165, 148, 172, 158, 139, 181];
  const rp = gumbelReturnPeriods(maxima);
  it("crecen con el periodo de retorno", () => {
    expect(rp[2]).toBeLessThan(rp[5]);
    expect(rp[5]).toBeLessThan(rp[10]);
    expect(rp[50]).toBeLessThan(rp[100]);
  });
  it("la crecida de 2 años queda cerca de la mediana de los máximos anuales", () => {
    const sorted = [...maxima].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(Math.abs(rp[2] - median)).toBeLessThan(10);
  });
});
