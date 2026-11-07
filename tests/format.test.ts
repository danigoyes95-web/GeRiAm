import { describe, expect, it } from "vitest";
import { formatNumber, formatDateTime, formatDuration, formatCountdown, formatHm3 } from "@/lib/format";

describe("formato es-EC", () => {
  it("separadores de miles y decimales", () => {
    expect(formatNumber(1234.56)).toBe("1.234,56");
    expect(formatNumber(1234567.891, 1)).toBe("1.234.567,9");
    expect(formatNumber(0.5, 0)).toBe("1");
    expect(formatNumber(-12.3, 1)).toBe("−12,3");
    expect(formatNumber(null)).toBe("—");
  });
  it("fecha en America/Guayaquil", () => {
    expect(formatDateTime("2026-11-07T17:05:00Z")).toBe("07/11/2026 12:05");
    expect(formatDateTime("2026-01-01T03:00:09Z", undefined, true)).toBe("31/12/2025 22:00:09");
  });
  it("duraciones", () => {
    expect(formatDuration(140)).toBe("2 h 20 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatCountdown(8400)).toBe("02:20:00");
    expect(formatHm3(3_500_000)).toBe("3,500 hm³");
  });
});
