import { CloudRain } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

/** Subconjunto de config/climatologia.*.ts guardado en sites.metadata.clima */
export interface ClimaView {
  estacion: string;
  periodo: string;
  anios: number;
  lluvia_anual_mm: number;
  lluvia_anual_min_mm: number;
  lluvia_anual_max_mm: number;
  dias_lluvia_anio: number;
  lluvia_mensual_mm: number[];
  max_horario: { fecha: string; mm: number };
  max_diario: { fecha: string; mm: number };
  max_evento: { inicio: string; mm: number; horas: number };
  max_10min_mmh: number;
  temp_media_c: number;
  temp_min_c: number;
  dias_helada_anio: number;
}

const MESES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const fecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/** Climatología real de la estación HGPT del embalse (registros 2013–2025). */
export function ClimateCard({ clima }: { clima: ClimaView }) {
  const max = Math.max(...clima.lluvia_mensual_mm);
  const W = 300;
  const H = 96;
  const bw = W / 12;
  return (
    <Card>
      <CardHeader
        title="Climatología real"
        subtitle={`Estación ${clima.estacion} · Red HGPT · ${clima.periodo} (${clima.anios} años)`}
        icon={<CloudRain />}
      />
      <CardBody className="space-y-3">
        <figure>
          <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full" role="img" aria-label="Lluvia mensual promedio">
            {clima.lluvia_mensual_mm.map((v, i) => {
              const h = (v / max) * H;
              const peak = v >= max * 0.9;
              return (
                <g key={i}>
                  <rect x={i * bw + 3} y={H - h} width={bw - 6} height={h} rx={2} fill={peak ? "#818cf8" : "#38bdf8"} opacity={peak ? 0.95 : 0.6}>
                    <title>{`${formatNumber(v, 0)} mm`}</title>
                  </rect>
                  <text x={i * bw + bw / 2} y={H + 11} fontSize="8.5" fill="var(--fg-faint)" textAnchor="middle">
                    {MESES[i]}
                  </text>
                </g>
              );
            })}
          </svg>
          <figcaption className="text-[10.5px] text-fg-faint">Lluvia mensual promedio (mm). Temporada lluviosa: mayo–julio.</figcaption>
        </figure>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {[
            ["Lluvia anual", `${formatNumber(clima.lluvia_anual_mm, 0)} mm`, `rango ${formatNumber(clima.lluvia_anual_min_mm, 0)}–${formatNumber(clima.lluvia_anual_max_mm, 0)}`],
            ["Días con lluvia", `${formatNumber(clima.dias_lluvia_anio, 0)} / año`, "≥ 1 mm"],
            ["Récord diario", `${formatNumber(clima.max_diario.mm, 1)} mm`, fecha(clima.max_diario.fecha)],
            ["Récord horario", `${formatNumber(clima.max_horario.mm, 1)} mm`, fecha(clima.max_horario.fecha)],
            ["Mayor evento", `${formatNumber(clima.max_evento.mm, 1)} mm`, `${formatNumber(clima.max_evento.horas, 0)} h · ${fecha(clima.max_evento.inicio)}`],
            ["Intensidad 10 min", `${formatNumber(clima.max_10min_mmh, 1)} mm/h`, "máx. último año"],
            ["Temperatura media", `${formatNumber(clima.temp_media_c, 1)} °C`, `mín. ${formatNumber(clima.temp_min_c, 1)} °C`],
            ["Heladas", `${formatNumber(clima.dias_helada_anio, 1)} días / año`, "< 0 °C"],
          ].map(([k, v, sub]) => (
            <div key={k} className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
              <dt className="text-fg-faint">{k}</dt>
              <dd className="tabular mt-0.5 font-mono text-sm font-semibold">{v}</dd>
              <dd className="text-[10px] text-fg-faint">{sub}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[10.5px] leading-relaxed text-fg-faint">
          El simulador de GeRiAm genera la lluvia con estas estadísticas (frecuencia, duración e intensidad de eventos y estacionalidad), calculadas con los registros horarios y de 1 minuto de la red hidrometeorológica del Gobierno Provincial.
        </p>
      </CardBody>
    </Card>
  );
}
