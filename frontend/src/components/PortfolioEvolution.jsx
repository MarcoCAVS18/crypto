// Evolución: lo que pusiste (costo base) contra lo que vale hoy. Dos líneas de 2 px, leyenda arriba, grilla casi invisible.
import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { evolutionSeries, fmtCompact } from '../utils/portfolioView';
import { CHART_GRID, CHART_TEXT } from '../utils/chartColors';

const C_INVESTED = '#3b9fd1';
const C_VALUE = '#2da84a';
const SURFACE = '#0b120d';
const shortDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-2xl bg-panel-2 border border-line px-3.5 py-2.5 text-xs shadow-xl">
      <p className="text-muted mb-1">{p.today ? 'Hoy' : shortDate(p.date)}</p>
      <p className="text-ink num">Invertido: <b>{fmtCompact(p.invested)}</b></p>
      {p.value != null && <p className="text-ink num">Vale: <b>{fmtCompact(p.value)}</b></p>}
      {p.op && <p className="text-muted mt-1">{p.op.type === 'BUY' ? 'Compra' : 'Venta'} {p.op.symbol} · {fmtCompact(p.op.amount)}</p>}
    </div>
  );
}

function Dot({ cx, cy, payload }) {
  if (cx == null || !payload?.op) return null;
  return <circle cx={cx} cy={cy} r={4.5} fill={payload.op.type === 'BUY' ? C_VALUE : '#e0468a'} stroke={SURFACE} strokeWidth={2} />;
}

export function PortfolioEvolution({ operations, prices }) {
  const data = useMemo(() => evolutionSeries(operations, prices).map(p => ({ ...p, label: p.today ? 'Hoy' : shortDate(p.date) })), [operations, prices]);
  if (data.length < 3) {
    return <p className="text-sm text-muted text-center py-10">Con 2 operaciones o más vas a ver acá cómo evoluciona.</p>;
  }
  const max = Math.max(...data.flatMap(d => [d.invested, d.value].filter(Number.isFinite))) * 1.12;
  return (
    <div>
      <div className="flex items-center gap-5 mb-3 text-xs text-muted">
        <span className="flex items-center gap-2"><i className="w-3 h-[2px] rounded-full" style={{ background: C_INVESTED }} />Invertido</span>
        <span className="flex items-center gap-2"><i className="w-3 h-[2px] rounded-full" style={{ background: C_VALUE }} />Vale hoy</span>
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="evo-inv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C_INVESTED} stopOpacity={0.18} /><stop offset="100%" stopColor={C_INVESTED} stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART_TEXT, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
          <YAxis domain={[0, max]} tickFormatter={fmtCompact} tick={{ fill: CHART_TEXT, fontSize: 10 }} axisLine={false} tickLine={false} width={48} tickCount={4} />
          <Tooltip content={<Tip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
          <Area type="stepAfter" dataKey="invested" stroke={C_INVESTED} strokeWidth={2} fill="url(#evo-inv)" dot={<Dot />} activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive animationDuration={1100} animationEasing="ease-out" />
          <Area type="monotone" dataKey="value" stroke={C_VALUE} strokeWidth={2} fill="none" connectNulls={false} dot={{ r: 5, fill: C_VALUE, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive animationBegin={600} animationDuration={600} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PortfolioEvolution;
