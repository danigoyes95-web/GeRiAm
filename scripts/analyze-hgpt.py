# Análisis de los registros de las estaciones HGPT (lluvia/temperatura) usado para calibrar el simulador.
# Uso: python3 scripts/analyze-hgpt.py <carpeta con chq_1h.csv, mlc_1h.csv, chq_1m.csv, mlc_1m.csv>
import sys, json, pandas as pd, numpy as np
D = sys.argv[1]
out = {}
for code, name in [("chq", "Chiquiurco HGPT-MT-01"), ("mlc", "Mulacorral HGPT-MT-10")]:
    h = pd.read_csv(f"{D}/{code}_1h.csv", parse_dates=["Fecha"]).set_index("Fecha").sort_index()
    p = h["Precipitación (mm)"]
    t = h["Temperatura (°C)"]
    # cobertura: horas con dato de temperatura como proxy de estación operando
    years = h.index.year
    cov = t.notna().groupby(years).mean().round(2).to_dict()
    # años con >= 85% de cobertura de temperatura -> años "completos" para climatología
    good_years = [y for y, c in cov.items() if c >= 0.85 and y < 2026]
    pg = p[p.index.year.isin(good_years)]
    annual = pg.groupby(pg.index.year).sum()
    monthly = pg.groupby([pg.index.year, pg.index.month]).sum().groupby(level=1).mean()
    daily = pg.resample("D").sum()
    wet_h = (pg >= 0.1)
    diurnal = pg.groupby(pg.index.hour).sum() / pg.sum()
    # eventos: horas húmedas consecutivas (permite 1 h seca intermedia)
    wet = (pg >= 0.2).astype(int)
    ev_id = (wet.diff() == 1).cumsum()
    events = []
    cur = None
    for ts, v in pg.items():
        if v >= 0.2:
            if cur is None or (ts - cur["end"]).total_seconds() > 2 * 3600:
                if cur: events.append(cur)
                cur = {"start": ts, "end": ts, "depth": 0.0, "peak": 0.0, "hours": 0}
            cur["end"] = ts; cur["depth"] += v; cur["peak"] = max(cur["peak"], v); cur["hours"] += 1
    if cur: events.append(cur)
    ev = pd.DataFrame(events)
    ev["dur_h"] = (ev["end"] - ev["start"]).dt.total_seconds() / 3600 + 1
    sig = ev[ev["depth"] >= 2]  # eventos significativos >= 2 mm
    nyears = len(good_years)
    top_hour = p.nlargest(5)
    top_day = p.resample("D").sum().nlargest(5)
    top_ev = ev.nlargest(5, "depth")
    tg = t[t.index.year.isin(good_years)]
    frost_days = (tg.resample("D").min() < 0).groupby(tg.resample("D").min().index.year).sum()
    out[code] = {
        "name": name,
        "period": [str(h.index.min()), str(h.index.max())],
        "coverage_by_year": cov,
        "good_years": good_years,
        "annual_mm": {"mean": round(annual.mean(), 1), "min": round(annual.min(), 1), "max": round(annual.max(), 1), "by_year": annual.round(0).to_dict()},
        "monthly_mean_mm": monthly.round(1).to_dict(),
        "mean_mm_day": round(annual.mean() / 365.25, 2),
        "wet_hour_freq": round(wet_h.mean(), 3),
        "rain_days_per_year": round((daily >= 1).sum() / nyears, 1),
        "diurnal_share_by_hour": diurnal.round(3).to_dict(),
        "events_per_year_ge2mm": round(len(sig) / nyears, 1),
        "event_depth_median": round(sig["depth"].median(), 1),
        "event_depth_p90": round(sig["depth"].quantile(0.9), 1),
        "event_dur_median_h": round(sig["dur_h"].median(), 1),
        "event_dur_p90_h": round(sig["dur_h"].quantile(0.9), 1),
        "event_peak_median_mmh": round(sig["peak"].median(), 1),
        "event_peak_p90_mmh": round(sig["peak"].quantile(0.9), 1),
        "event_peak_p99_mmh": round(sig["peak"].quantile(0.99), 1),
        "event_start_hour_dist": sig["start"].dt.hour.value_counts(normalize=True).sort_index().round(3).to_dict(),
        "max_hour_mm": [(str(i), float(v)) for i, v in top_hour.items()],
        "max_day_mm": [(str(i.date()), round(float(v), 1)) for i, v in top_day.items()],
        "max_events": [(str(r.start), round(r.depth, 1), round(r.dur_h, 0), round(r.peak, 1)) for r in top_ev.itertuples()],
        "max_24h_rolling": round(float(p.rolling(24).sum().max()), 1),
        "max_72h_rolling": round(float(p.rolling(72).sum().max()), 1),
        "temp_mean": round(tg.mean(), 2), "temp_min": round(tg.min(), 2), "temp_max": round(tg.max(), 2),
        "frost_days_per_year": round(frost_days.mean(), 1),
        "last_record": str(h.dropna(subset=["Temperatura (°C)"]).index.max()),
    }
    # 1 minuto: intensidades máximas
    m = pd.read_csv(f"{D}/{code}_1m.csv", parse_dates=["Fecha"]).set_index("Fecha").sort_index()
    pm = m["Precipitación (mm)"].fillna(0)
    pm = pm.resample("1min").sum()
    ints = {}
    for w in [10, 15, 30, 60]:
        r = pm.rolling(w).sum()
        ints[f"max_{w}min_mm"] = round(float(r.max()), 1)
        ints[f"max_{w}min_mmh"] = round(float(r.max()) * 60 / w, 1)
        ints[f"max_{w}min_at"] = str(r.idxmax())
    ints["resolution_mm"] = float(pm[pm > 0].min())
    ints["period"] = [str(m.index.min()), str(m.index.max())]
    ints["total_mm"] = round(float(pm.sum()), 1)
    out[code]["one_min"] = ints
print(json.dumps(out, ensure_ascii=False, indent=1, default=str))
