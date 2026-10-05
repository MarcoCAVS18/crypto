// Donut de distribución (referencia: "Portfolio Statistic"). SVG puro, extremos redondeados y un pequeño hueco entre tramos.
// Paleta de DATOS validada contra la superficie oscura (dataviz/validate_palette.js: banda de luminosidad, croma y contraste OK;
// separación para daltonismo verde↔rosa en banda "WARN" ⇒ siempre con leyenda + valores y 2 px de separación entre tramos).
// Los neones (#58e26f…) quedan para la interfaz (botones, pestañas activas), no para marcas de datos.
const PALETTE = ['#3b9fd1', '#2da84a', '#e0468a'];

export function DonutChart({ segments = [], size = 200, thickness = 26, top = null, bottom = null }) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  const r = (size - thickness) / 2, c = 2 * Math.PI * r, cx = size / 2;
  const gap = segments.length > 1 ? Math.min(10, c * 0.025) : 0;
  let offset = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label="Distribución del portfolio">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={thickness} />
        {total > 0 && segments.map((s, i) => {
          const len = Math.max(0, (s.value / total) * c - gap);
          const el = (
            <circle key={s.label ?? i} cx={cx} cy={cx} r={r} fill="none" stroke={s.color ?? PALETTE[i % PALETTE.length]} strokeWidth={thickness}
              strokeLinecap="round" strokeDasharray={`${Math.max(0.01, len)} ${c}`} strokeDashoffset={-offset} />
          );
          offset += (s.value / total) * c;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        {top && <span className="text-[11px] text-muted">{top}</span>}
        {bottom && <span className="text-2xl font-bold text-ink num leading-tight">{bottom}</span>}
      </div>
    </div>
  );
}

export const DONUT_COLORS = PALETTE;
export default DonutChart;
