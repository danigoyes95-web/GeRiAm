#!/usr/bin/env python3
"""
Precálculo para el mapa de impacto de crecidas (estimación de primer nivel).

1. Relieve: el mismo modelo de elevación del mapa 3D (Terrarium z13, ~19 m) y los mismos cauces
   trazados por scripts/trace-cauce.py (direcciones de flujo por priority-flood).
2. HAND (Height Above Nearest Drainage, Nobre et al. 2011; base del mapeo de inundación del
   National Water Model de NOAA): para cada celda del valle, la celda del río a la que drena y su
   altura sobre ella. Con un nivel de agua h en ese tramo, la celda se inunda si HAND < h y la
   profundidad es h − HAND.
3. Curvas de descarga sintéticas por tramo de 500 m (Zheng et al. 2018, método NOAA/NWM):
   para cada nivel h, área mojada A, ancho superficial W, radio hidráulico R = A/W y caudal de
   Manning Q = (1/n)·A·R^(2/3)·√S, con la pendiente S del río en el tramo.
4. Exposición: edificaciones (huellas de OpenStreetMap vía Mapbox Streets, z16) y puentes sobre el río.
5. Zonas: cada tramo del río toma el nombre del poblado o barrio más cercano.

Salida (public/flood/): meta.json, cells.bin (celdas del valle) y buildings.bin.
Uso:  NEXT_PUBLIC_MAPBOX_TOKEN=… python3 scripts/flood-hazard.py [--cache DIR]
"""
import gzip
import importlib.util
import io
import json
import math
import os
import sys
import urllib.error
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
spec = importlib.util.spec_from_file_location("trace_cauce", os.path.join(HERE, "trace-cauce.py"))
tc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tc)

Z = tc.Z
SITES = ["CHQ", "MLC", "CQH"]
N_MANNING = 0.05  # río de montaña con cantos y vegetación en riberas (Chow 1959)
MAX_HAND = 20.0  # m: celdas más altas no se consideran inundables
MAX_DIST_M = 2500  # m: distancia máxima de la celda a su punto de drenaje en el río
SEG_KM = 0.5
LEVELS = [0.3, 0.6, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20]
PLACE_TYPES = {"hamlet", "village", "town", "city", "quarter", "neighbourhood", "suburb"}


def cell_size_m(lat):
    return 40075016.686 * math.cos(math.radians(lat)) / (256 * 2**Z)


def fetch(url):
    return urllib.request.urlopen(url, timeout=40).read()


def main():
    args = sys.argv[1:]
    cache = args[args.index("--cache") + 1] if "--cache" in args else None
    token = os.environ.get("NEXT_PUBLIC_MAPBOX_TOKEN", "")

    # ── relieve y direcciones de flujo ─────────────────────────────────────────
    dem_path = os.path.join(cache, "dem.npz") if cache else None
    if dem_path and os.path.exists(dem_path):
        d = np.load(dem_path)
        dem, x0, y0 = d["dem"], int(d["x0"]), int(d["y0"])
    else:
        dem, x0, y0 = tc.load_dem()
        if dem_path:
            np.savez_compressed(dem_path, dem=dem, x0=x0, y0=y0)
    h, w = dem.shape
    print(f"DEM {w}×{h}", file=sys.stderr)
    rec, order = tc.priority_flood(dem, with_order=True)
    paths = tc.trace_paths(dem, x0, y0, rec)
    lat0 = tc.pix_to_lonlat(w / 2, h / 2, x0, y0, Z)[1]
    cm = cell_size_m(lat0)
    cell_area = cm * cm

    # ── celdas del río, con el km de cada cauce (el mismo km de los tiempos de llegada) ──
    cauces = json.load(open(os.path.join(ROOT, "config", "cauces.tungurahua.json")))
    river_of = {}  # índice de celda → id de celda de río
    rv = []  # celdas de río: dict
    zflat = dem.ravel()
    zriv = {}
    for code in SITES:
        path = paths[code][0][1:]
        line = np.array(cauces[code])
        k = np.cos(np.radians(line[:, 1]))
        seg = np.hypot(np.diff(line[:, 0]) * 111.32 * k[:-1], np.diff(line[:, 1]) * 110.57)
        cum = np.concatenate([[0], np.cumsum(seg)])
        ll = np.array([tc.pix_to_lonlat(c + 0.5, r + 0.5, x0, y0, Z) for r, c in path])
        d2 = ((ll[:, None, 0] - line[None, :, 0]) * 111.32 * k[None, :]) ** 2 + ((ll[:, None, 1] - line[None, :, 1]) * 110.57) ** 2
        km = cum[np.argmin(d2, axis=1)]
        # perfil del río: monótono aguas abajo (mínimo acumulado) y suavizado
        z = np.minimum.accumulate(np.array([zflat[r * w + c] for r, c in path]))
        for i, (r, c) in enumerate(path):
            idx = r * w + c
            if idx not in river_of:
                river_of[idx] = len(rv)
                rv.append({"idx": idx, "lng": ll[i, 0], "lat": ll[i, 1], "km": {}})
                zriv[idx] = z[i]
            else:
                zriv[idx] = min(zriv[idx], z[i])
            rv[river_of[idx]]["km"].setdefault(code, float(km[i]))
    print(f"río: {len(rv)} celdas", file=sys.stderr)

    # pendiente local: diferencia de cota a ±0,75 km por el cauce principal de cada celda
    for code in SITES:
        cells = sorted([r for r in rv if code in r["km"]], key=lambda r: r["km"][code])
        kms = np.array([r["km"][code] for r in cells])
        zs = np.array([zriv[r["idx"]] for r in cells])
        for r in cells:
            if "S" in r:
                continue
            k0 = r["km"][code]
            a = np.searchsorted(kms, k0 - 0.75)
            b = min(len(kms) - 1, np.searchsorted(kms, k0 + 0.75))
            dz = zs[a] - zs[b]
            dk = max(0.3, kms[b] - kms[a])
            r["S"] = max(0.003, dz / (dk * 1000))

    # tramos de 500 m (cada celda al primer cauce que la contiene)
    seg_key = {}
    for r in rv:
        code = next(c for c in SITES if c in r["km"])
        key = (code, int(r["km"][code] / SEG_KM))
        r["seg"] = seg_key.setdefault(key, len(seg_key))

    # ── HAND: celda de río a la que drena cada celda (orden de proceso del priority-flood) ──
    is_r = np.zeros(h * w, dtype=bool)
    is_r[list(river_of.keys())] = True
    tgt = np.full(h * w, -1, dtype=np.int64)
    rec_l = rec.tolist()
    tgt_l = tgt.tolist()
    is_l = is_r.tolist()
    for j in order.tolist():
        if is_l[j]:
            tgt_l[j] = j
        else:
            q = rec_l[j]
            tgt_l[j] = tgt_l[q] if q >= 0 else -1
    tgt = np.array(tgt_l, dtype=np.int64)
    zr = np.zeros(h * w)
    for idx, z in zriv.items():
        zr[idx] = z
    ok = tgt >= 0
    hand = np.full(h * w, 1e9)
    hand[ok] = np.maximum(0, zflat[ok] - zr[tgt[ok]])
    rows, cols = np.divmod(np.arange(h * w), w)
    dist = np.full(h * w, 1e9)
    dist[ok] = np.hypot(rows[ok] - rows[tgt[ok]], cols[ok] - cols[tgt[ok]]) * cm
    keep = ok & (hand <= MAX_HAND) & (dist <= MAX_DIST_M)
    cells = np.nonzero(keep)[0]
    print(f"valle inundable (HAND ≤ {MAX_HAND} m): {len(cells)} celdas", file=sys.stderr)

    # recorte al rectángulo que contiene las celdas
    rr, cc = rows[cells], cols[cells]
    r0, r1, c0, c1 = int(rr.min()), int(rr.max()), int(cc.min()), int(cc.max())
    cw, ch = c1 - c0 + 1, r1 - r0 + 1
    pix = ((rr - r0) * cw + (cc - c0)).astype(np.uint32)
    hand_cm = np.round(hand[cells] * 100).astype(np.uint16)
    rid = np.array([river_of[t] for t in tgt[cells].tolist()], dtype=np.uint16)

    # ── curvas de descarga sintéticas por tramo ──
    nseg = len(seg_key)
    seg_cells = [[] for _ in range(nseg)]
    for i, r_ in enumerate(rid.tolist()):
        seg_cells[rv[r_]["seg"]].append(i)
    segments = []
    for s in range(nseg):
        mem = [r for r in rv if r["seg"] == s]
        code = next(c for c in SITES if c in mem[0]["km"])
        kms = [r["km"][code] for r in mem if code in r["km"]]
        L = max(200.0, (max(kms) - min(kms)) * 1000 + cm)
        S = float(np.median([r["S"] for r in mem]))
        hs = hand[cells[seg_cells[s]]] if seg_cells[s] else np.array([0.0])
        q, a = [], []
        for H in LEVELS:
            wet = hs < H
            A = float(np.sum(H - hs[wet]) * cell_area / L)
            W = max(cm, float(np.count_nonzero(wet) * cell_area / L))
            R = A / W
            q.append(round((1 / N_MANNING) * A * R ** (2 / 3) * math.sqrt(S), 2))
            a.append(round(A, 2))
        # caudal estrictamente creciente con el nivel
        for i in range(1, len(q)):
            q[i] = max(q[i], q[i - 1] + 0.01)
        segments.append({"S": round(S, 4), "L": round(L), "q": q, "a": a})
    # suavizado entre tramos vecinos del mismo cauce (media geométrica de 3 tramos): el DEM de ~19 m
    # produce saltos de sección de un tramo a otro que no son reales
    inv = {v: k for k, v in seg_key.items()}
    raw = [dict(s_) for s_ in segments]
    for s_i, (code, k_) in inv.items():
        nb = [seg_key[(code, k_ + d)] for d in (-1, 0, 1) if (code, k_ + d) in seg_key]
        for f in ("q", "a"):
            segments[s_i][f] = [
                round(float(np.exp(np.mean([np.log(max(1e-3, raw[n][f][j])) for n in nb]))), 2) for j in range(len(LEVELS))
            ]
        for j in range(1, len(LEVELS)):
            segments[s_i]["q"][j] = max(segments[s_i]["q"][j], segments[s_i]["q"][j - 1] + 0.01)

    # ── zonas: poblado o barrio más cercano a cada celda del río ──
    places_path = os.path.join(cache, "places.json") if cache else None
    places = json.load(open(places_path)) if places_path and os.path.exists(places_path) else None
    if places is None:
        places = []
        tiles = set()
        for r in rv[:: max(1, len(rv) // 400)]:
            tx, ty = tc.tile_xy(r["lng"], r["lat"], 13)
            tiles.add((int(tx), int(ty)))
        for tx, ty in tiles:
            places += vt_places(tx, ty, token)
        if places_path:
            json.dump(places, open(places_path, "w"))
    pl = {}
    for p in places:
        pl.setdefault(p["name"], p)
    pl = list(pl.values())
    zones, zone_of = [], {}
    P = np.array([[p["lng"], p["lat"]] for p in pl])
    for r in rv:
        d = np.hypot((P[:, 0] - r["lng"]) * 111.32, (P[:, 1] - r["lat"]) * 110.57)
        j = int(np.argmin(d))
        name = pl[j]["name"] if d[j] < 3.0 else "Río Ambato (tramo rural)"
        r["zone"] = zone_of.setdefault(name, len(zones))
        if r["zone"] == len(zones):
            zones.append(name)

    # ── exposición: edificaciones y puentes (Mapbox Streets v8, z16) ──
    cell_index = {int(p): i for i, p in enumerate(pix.tolist())}

    def to_cell(lng, lat):
        x, y = tc.tile_xy(lng, lat, Z)
        r_ = int((y - y0) * 256) - r0
        c_ = int((x - x0) * 256) - c0
        if 0 <= r_ < ch and 0 <= c_ < cw:
            return cell_index.get(r_ * cw + c_)
        return None

    # las huellas de edificaciones solo vienen completas en z16
    t14 = set()
    for i in range(len(cells)):
        if hand[cells[i]] <= 15:
            lng, lat = tc.pix_to_lonlat(cols[cells[i]] + 0.5, rows[cells[i]] + 0.5, x0, y0, Z)
            tx, ty = tc.tile_xy(lng, lat, 16)
            t14.add((int(tx), int(ty)))
    print(f"teselas z16 para exposición: {len(t14)}", file=sys.stderr)
    bcache = os.path.join(cache, "expo.json") if cache else None
    expo = json.load(open(bcache)) if bcache and os.path.exists(bcache) else None
    if expo is None:
        expo = {"b": [], "br": []}
        for n, (tx, ty) in enumerate(sorted(t14)):
            b, br = vt_exposure(tx, ty, token)
            expo["b"] += b
            expo["br"] += br
            if n % 25 == 0:
                print(f"  {n}/{len(t14)} teselas, {len(expo['b'])} edificaciones", file=sys.stderr)
        if bcache:
            json.dump(expo, open(bcache, "w"))
    seen = set()
    bld = []
    for lng, lat in expo["b"]:
        key = (round(lng, 6), round(lat, 6))
        if key in seen:
            continue
        seen.add(key)
        i = to_cell(lng, lat)
        if i is not None:
            bld.append(i)
    # puentes: tramos de vía marcados como puente a ≤ 60 m de una celda de río; se agrupan a 120 m
    RV = np.array([[r["lng"], r["lat"]] for r in rv])
    bridges = []
    for name, lng, lat in expo["br"]:
        d = np.hypot((RV[:, 0] - lng) * 111.32, (RV[:, 1] - lat) * 110.57)
        j = int(np.argmin(d))
        if d[j] > 0.06:
            continue
        if any(math.hypot((b["lng"] - lng) * 111.32, (b["lat"] - lat) * 110.57) < 0.12 for b in bridges):
            continue
        i = to_cell(lng, lat)
        if i is None:
            continue
        bridges.append({"name": name, "rid": j, "cell": i, "lng": round(lng, 5), "lat": round(lat, 5)})
    print(f"exposición: {len(bld)} edificaciones en el valle, {len(bridges)} puentes", file=sys.stderr)

    # ── salida ──
    out = os.path.join(ROOT, "public", "flood")
    os.makedirs(out, exist_ok=True)
    corners = [
        tc.pix_to_lonlat(c0, r0, x0, y0, Z),
        tc.pix_to_lonlat(c1 + 1, r0, x0, y0, Z),
        tc.pix_to_lonlat(c1 + 1, r1 + 1, x0, y0, Z),
        tc.pix_to_lonlat(c0, r1 + 1, x0, y0, Z),
    ]
    meta = {
        "version": 1,
        "method": "HAND + curvas de descarga sintéticas (Manning) sobre DEM Terrarium z13",
        "width": cw,
        "height": ch,
        "corners": [[round(a, 6), round(b, 6)] for a, b in corners],
        "cellM": round(cm, 2),
        "cellArea": round(cell_area, 1),
        "manning": N_MANNING,
        "levels": LEVELS,
        "river": {
            "lng": [round(r["lng"], 5) for r in rv],
            "lat": [round(r["lat"], 5) for r in rv],
            "seg": [r["seg"] for r in rv],
            "zone": [r["zone"] for r in rv],
            "km": {code: [round(r["km"].get(code, -1), 3) for r in rv] for code in SITES},
        },
        "segments": segments,
        "zones": zones,
        "bridges": bridges,
        "nCells": int(len(cells)),
        "nBuildings": len(bld),
    }
    json.dump(meta, open(os.path.join(out, "meta.json"), "w"), separators=(",", ":"), ensure_ascii=False)
    with open(os.path.join(out, "cells.bin"), "wb") as f:
        f.write(pix.tobytes())
        f.write(hand_cm.tobytes())
        f.write(rid.tobytes())
    np.array(bld, dtype=np.uint32).tofile(os.path.join(out, "buildings.bin"))
    print(f"✓ public/flood: {len(cells)} celdas, {nseg} tramos, {len(zones)} zonas", file=sys.stderr)


def vt_decode(tx, ty, z, token):
    import mapbox_vector_tile as mvt

    try:
        raw = fetch(f"https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/{z}/{tx}/{ty}.vector.pbf?access_token={token}")
    except urllib.error.HTTPError as e:
        if e.code != 404:  # 404 = tesela sin datos
            raise
        raw = b""
    if not raw:
        return {}, None
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    d = mvt.decode(raw)

    def ll(px, py, ext):
        n = 2**z
        lon = (tx + px / ext) / n * 360 - 180
        yy = (ty + 1 - py / ext) / n
        return lon, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy))))

    return d, ll


def vt_places(tx, ty, token):
    d, ll = vt_decode(tx, ty, 13, token)
    out = []
    L = d.get("place_label")
    if not L:
        return out
    for f in L["features"]:
        p = f["properties"]
        if p.get("type") in PLACE_TYPES and p.get("name"):
            lng, lat = ll(*f["geometry"]["coordinates"], L["extent"])
            out.append({"name": p["name"], "lng": lng, "lat": lat})
    return out


def vt_exposure(tx, ty, token):
    d, ll = vt_decode(tx, ty, 16, token)
    blds, brs = [], []
    L = d.get("building")
    if L:
        for f in L["features"]:
            g = f["geometry"]
            polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
            for poly in polys:
                ring = poly[0]
                x = sum(p[0] for p in ring) / len(ring)
                y = sum(p[1] for p in ring) / len(ring)
                blds.append(ll(x, y, L["extent"]))
    L = d.get("road")
    if L:
        for f in L["features"]:
            if f["properties"].get("structure") != "bridge":
                continue
            g = f["geometry"]
            lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
            for line in lines:
                p = line[len(line) // 2]
                lng, lat = ll(p[0], p[1], L["extent"])
                cls = f["properties"].get("class", "")
                label = {
                    "path": "Pasarela peatonal",
                    "pedestrian": "Pasarela peatonal",
                    "track": "Puente de camino",
                    "service": "Puente de vía de servicio",
                    "street": "Puente de calle",
                    "street_limited": "Puente de calle",
                    "tertiary": "Puente de vía terciaria",
                    "secondary": "Puente de vía secundaria",
                    "primary": "Puente de vía principal",
                    "primary_link": "Puente de vía principal",
                    "trunk": "Puente de vía troncal",
                }.get(cls, "Puente")
                name = f["properties"].get("name")
                brs.append([f"Puente {name}" if name else label, lng, lat])
    return blds, brs


if __name__ == "__main__":
    main()
