import type { AreaVolumePoint } from "../domain/types";
import type { SiteParams } from "./physics";

/** Construye parámetros físicos desde una fila de geriam.sites (o equivalente). */
export function siteParamsFromRow(row: {
  code: string;
  cota_fondo: number | string;
  cota_namo: number | string;
  cota_name: number | string;
  cota_vertedero: number | string;
  cota_cresta: number | string;
  longitud_vertedero: number | string;
  coeficiente_descarga: number | string;
  caudal_entrada_base: number | string;
  caudal_salida_nominal: number | string;
  area_cuenca_km2: number | string;
  capacity_m3: number | string;
  curva_area_volumen: unknown;
}): SiteParams {
  const n = (v: number | string) => Number(v);
  return {
    code: row.code,
    fondo: n(row.cota_fondo),
    namo: n(row.cota_namo),
    name: n(row.cota_name),
    vertedero: n(row.cota_vertedero),
    cresta: n(row.cota_cresta),
    longitudVertedero: n(row.longitud_vertedero),
    coefDescarga: n(row.coeficiente_descarga),
    qinBase: n(row.caudal_entrada_base),
    qoutNominal: n(row.caudal_salida_nominal),
    areaCuencaKm2: n(row.area_cuenca_km2),
    capacity: n(row.capacity_m3),
    curve: (row.curva_area_volumen as AreaVolumePoint[]) ?? [],
    valveMax: Math.max(1.5, 6 * n(row.caudal_salida_nominal)),
  };
}
