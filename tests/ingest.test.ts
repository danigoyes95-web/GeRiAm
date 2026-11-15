import { describe, expect, it } from "vitest";
import { decodeBody, extractValue, validateReading } from "@/lib/ingest/decode";

const NOW = Date.parse("2026-11-15T12:00:00Z");

describe("ingesta: decodificación", () => {
  it("ChirpStack v4: equipo, contador, valor y radio", () => {
    const r = decodeBody(
      {
        deviceInfo: { devEui: "70b3d57ed0010001" },
        fCnt: 42,
        time: "2026-11-15T11:59:30Z",
        object: { nivel: 3742.51, battery: 88 },
        rxInfo: [
          { rssi: -112, snr: 1.5 },
          { rssi: -98, snr: 6 },
        ],
      },
      NOW,
    );
    expect(r.format).toBe("chirpstack");
    const u = r.uplinks[0];
    expect(u.devEui).toBe("70B3D57ED0010001");
    expect(u.fcnt).toBe(42);
    expect(u.rssi).toBe(-98); // la mejor recepción
    expect(u.battery).toBe(88);
    expect(extractValue(u, "nivel_radar")).toBe(3742.51);
  });

  it("The Things Stack v3", () => {
    const r = decodeBody(
      {
        end_device_ids: { dev_eui: "70B3D57ED0020003" },
        received_at: "2026-11-15T11:58:00Z",
        uplink_message: {
          f_cnt: 7,
          decoded_payload: { pressure: 182.4 },
          rx_metadata: [{ rssi: -105, snr: 3 }],
        },
      },
      NOW,
    );
    expect(r.format).toBe("ttn");
    expect(extractValue(r.uplinks[0], "piezometro")).toBe(182.4);
  });

  it("genérico por código de sensor y rechazo de formatos desconocidos", () => {
    const r = decodeBody(
      { readings: [{ sensor_code: "CHQ-NIV-01", value: "3742.2", ts: "2026-11-15T11:55:00Z" }] },
      NOW,
    );
    expect(r.uplinks[0]).toMatchObject({ sensorCode: "CHQ-NIV-01", value: 3742.2 });
    expect(() => decodeBody({ foo: 1 }, NOW)).toThrow(/Formato no reconocido/);
    expect(() => decodeBody({ readings: [{ value: 1 }] }, NOW)).toThrow(/sensor_code/);
  });
});

describe("ingesta: validación física", () => {
  const site = { fondo: 3721, cresta: 3745.5 };
  it("rechaza valores imposibles y fechas no creíbles", () => {
    expect(validateReading("nivel_radar", 4200, NOW, { now: NOW, site }).ok).toBe(false);
    expect(validateReading("pluviometro", -3, NOW, { now: NOW }).ok).toBe(false);
    expect(validateReading("nivel_radar", 3740, NOW + 3600_000, { now: NOW, site }).ok).toBe(false);
    expect(validateReading("nivel_radar", 3740, NOW - 8 * 86400_000, { now: NOW, site }).ok).toBe(false);
  });
  it("acepta valores normales y marca como dudoso un salto brusco (sin descartarlo)", () => {
    expect(
      validateReading("nivel_radar", 3742.5, NOW, {
        now: NOW,
        site,
        last: { value: 3742.48, ts: NOW - 60_000 },
      }),
    ).toEqual({ ok: true, quality: 0 });
    const jump = validateReading("nivel_radar", 3744.5, NOW, {
      now: NOW,
      site,
      last: { value: 3742.5, ts: NOW - 60_000 },
    });
    expect(jump.ok).toBe(true);
    expect(jump.quality).toBe(1);
  });
});
