import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

/** Calidad de enlace LoRa por RSSI (dBm) y SNR (dB). */
export function signalQuality(rssi: number | null | undefined, snr: number | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (rssi === null || rssi === undefined) return 0;
  const s = snr ?? 0;
  if (rssi > -90 && s > 5) return 4;
  if (rssi > -100 && s > 0) return 3;
  if (rssi > -110 && s > -7) return 2;
  if (rssi > -120) return 1;
  return 0;
}

export function SignalBars({ rssi, snr, showValues = false, className }: { rssi: number | null | undefined; snr: number | null | undefined; showValues?: boolean; className?: string }) {
  const q = signalQuality(rssi, snr);
  const color = q >= 3 ? "bg-lvl-normal" : q === 2 ? "bg-lvl-amarilla" : q === 1 ? "bg-lvl-naranja" : "bg-lvl-sin-datos";
  const label = ["Sin señal", "Débil", "Regular", "Buena", "Excelente"][q];
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={`${label} · RSSI ${formatNumber(rssi, 0)} dBm · SNR ${formatNumber(snr, 1)} dB`}>
      <span className="inline-flex h-3.5 items-end gap-[2px]" role="img" aria-label={`Señal ${label}`}>
        {[1, 2, 3, 4].map((b) => (
          <span key={b} className={cn("w-[3px] rounded-[1px]", b <= q ? color : "bg-surface-3")} style={{ height: `${b * 25}%` }} />
        ))}
      </span>
      {showValues && (
        <span className="tabular font-mono text-[11px] text-fg-muted">
          {formatNumber(rssi, 0)} dBm · {formatNumber(snr, 1)} dB
        </span>
      )}
    </span>
  );
}
