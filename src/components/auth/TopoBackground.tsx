/** Fondo decorativo de curvas de nivel (SVG generado, sin imágenes). */
export function TopoBackground({ className }: { className?: string }) {
  const lines = Array.from({ length: 16 }, (_, i) => i);
  return (
    <svg className={className} viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="topo-fade" cx="35%" cy="40%" r="75%">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g fill="none" stroke="url(#topo-fade)" strokeWidth="1">
        {lines.map((i) => {
          const r = 40 + i * 34;
          const wob = 10 + i * 2.2;
          const pts = Array.from({ length: 49 }, (_, k) => {
            const a = (k / 48) * Math.PI * 2;
            const rr = r + Math.sin(a * 3 + i * 0.7) * wob + Math.cos(a * 5 - i) * wob * 0.4;
            return `${(280 + Math.cos(a) * rr * 1.25).toFixed(1)},${(320 + Math.sin(a) * rr).toFixed(1)}`;
          });
          return <polygon key={i} points={pts.join(" ")} opacity={1 - i / 18} />;
        })}
      </g>
    </svg>
  );
}
