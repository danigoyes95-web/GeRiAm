#!/usr/bin/env python3
"""
Traza el cauce real aguas abajo de cada presa a partir del relieve (modelo digital de elevación).

Método hidrológico estándar:
  1. Descarga teselas de elevación Terrarium (AWS Open Data, las mismas del mapa 3D) en z13 (~19 m/píxel).
  2. "Priority-flood" desde los bordes: rellena depresiones y asigna a cada celda la dirección de
     flujo hacia la salida (equivalente a D8 sobre un DEM hidrológicamente corregido).
  3. Desde un punto aguas abajo de la cortina, sigue las direcciones de flujo hasta Ambato.
  4. Simplifica (Douglas–Peucker) y suaviza (Chaikin) para un trazo limpio en el mapa.

Uso:  python3 scripts/trace-cauce.py > /tmp/cauces.json
Salida: {"CHQ": [[lng, lat], ...], "MLC": [...]} — se copia a config/sites.tungurahua.ts.
"""
import heapq
import io
import json
import math
import sys
import urllib.request

import numpy as np
from PIL import Image

Z = 13
BBOX = (-78.875, -1.300, -78.575, -1.150)  # oeste, sur, este, norte
AMBATO = (-78.6168, -1.2491)
DAMS = {"CHQ": (-78.81032, -1.20855), "MLC": (-78.82772, -1.19575)}
LAKES = {"CHQ": (-78.806672, -1.205154), "MLC": (-78.826447, -1.190775)}


def tile_xy(lon, lat, z):
    n = 2**z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def pix_to_lonlat(px, py, x0, y0, z):
    n = 2**z
    lon = (x0 + px / 256) / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y0 + py / 256) / n))))
    return lon, lat


def load_dem():
    xa, ya = tile_xy(BBOX[0], BBOX[3], Z)
    xb, yb = tile_xy(BBOX[2], BBOX[1], Z)
    x0, x1, y0, y1 = int(xa), int(xb), int(ya), int(yb)
    dem = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), dtype=np.float64)
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png"
            img = np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=30).read())).convert("RGB"), dtype=np.float64)
            e = img[:, :, 0] * 256 + img[:, :, 1] + img[:, :, 2] / 256 - 32768
            dem[(ty - y0) * 256 : (ty - y0 + 1) * 256, (tx - x0) * 256 : (tx - x0 + 1) * 256] = e
    return dem, x0, y0


def priority_flood(dem):
    """Devuelve, para cada celda, el índice de la celda hacia la que drena (o -1 en los bordes)."""
    h, w = dem.shape
    rec = np.full(h * w, -1, dtype=np.int64)
    done = np.zeros(h * w, dtype=bool)
    pq = []
    for r in range(h):
        for c in (0, w - 1):
            heapq.heappush(pq, (dem[r, c], r * w + c))
            done[r * w + c] = True
    for c in range(1, w - 1):
        for r in (0, h - 1):
            heapq.heappush(pq, (dem[r, c], r * w + c))
            done[r * w + c] = True
    nb = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    eps = 1e-4
    while pq:
        z, i = heapq.heappop(pq)
        r, c = divmod(i, w)
        for dr, dc in nb:
            rr, cc = r + dr, c + dc
            if 0 <= rr < h and 0 <= cc < w:
                j = rr * w + cc
                if not done[j]:
                    done[j] = True
                    rec[j] = i
                    heapq.heappush(pq, (max(dem[rr, cc], z + eps), j))
    return rec


def rdp(pts, tol):
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    ab = b - a
    n = np.hypot(*ab) or 1e-12
    d = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / n for p in pts]
    k = int(np.argmax(d))
    if d[k] > tol:
        return rdp(pts[: k + 1], tol)[:-1] + rdp(pts[k:], tol)
    return [pts[0], pts[-1]]


def chaikin(pts, it=2):
    for _ in range(it):
        out = [pts[0]]
        for p, q in zip(pts[:-1], pts[1:]):
            out.append((0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]))
            out.append((0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]))
        out.append(pts[-1])
        pts = out
    return pts


def main():
    dem, x0, y0 = load_dem()
    h, w = dem.shape
    print(f"DEM {w}×{h} celdas, {dem.min():.0f}–{dem.max():.0f} m", file=sys.stderr)
    rec = priority_flood(dem)
    ax, ay = tile_xy(*AMBATO, Z)
    amb = ((ay - y0) * 256, (ax - x0) * 256)
    out = {}
    for code, (lon, lat) in DAMS.items():
        dx, dy = tile_xy(lon, lat, Z)
        r0, c0 = int((dy - y0) * 256), int((dx - x0) * 256)
        lx, ly = tile_xy(*LAKES[code], Z)
        lr, lc = (ly - y0) * 256, (lx - x0) * 256
        # inicio: celda más baja a 4–12 celdas de la cortina, del lado opuesto al embalse
        best = None
        for r in range(r0 - 12, r0 + 13):
            for c in range(c0 - 12, c0 + 13):
                d = math.hypot(r - r0, c - c0)
                if 4 <= d <= 12 and math.hypot(r - lr, c - lc) > math.hypot(r0 - lr, c0 - lc) + 2:
                    if best is None or dem[r, c] < dem[best]:
                        best = (r, c)
        path = [(r0, c0)]
        i = best[0] * w + best[1]
        closest = 1e9
        while i >= 0 and len(path) < 20000:
            r, c = divmod(i, w)
            path.append((r, c))
            closest = min(closest, math.hypot(r - amb[0], c - amb[1]))
            # se corta al pasar junto a Ambato (≈1,1 km), antes de que el río siga hacia el noreste
            if closest * 19 < 1100:
                break
            i = rec[i]
        ll = [pix_to_lonlat(c + 0.5, r + 0.5, x0, y0, Z) for r, c in path]
        km = sum(math.hypot((b[0] - a[0]) * 111.32 * math.cos(math.radians(a[1])), (b[1] - a[1]) * 110.57) for a, b in zip(ll[:-1], ll[1:]))
        simp = chaikin(rdp(ll, 0.00018), 2)
        print(f"{code}: {len(path)} celdas → {len(simp)} puntos, {km:.1f} km; llega a {closest * 19:.0f} m de Ambato; cota inicio {dem[path[1]]:.0f} m", file=sys.stderr)
        out[code] = [[round(p[0], 5), round(p[1], 5)] for p in simp]
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
