import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, BarChart3, Activity, Zap, LineChart } from 'lucide-react';

// RSI mini gauge bar
function RsiBar({ rsi }) {
  if (rsi == null) return null;
  const pct = Math.max(0, Math.min(100, rsi));
  const color = rsi > 70 ? 'bg-red-500' : rsi < 30 ? 'bg-emerald-500' : 'bg-blue-500';
  return (
    <div className="mt-1.5 h-1 bg-slate-700/60 rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
      />
    </div>
  );
}

// Trend arrow indicator
function TrendBadge({ direction }) {
  const isUp = direction === 'alcista';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md
      ${isUp ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
      {isUp ? '↑' : '↓'} {isUp ? 'Alcista' : 'Bajista'}
    </span>
  );
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } }
};
const cardAnim = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.25 } }
};

export function TechnicalAnalysis({ analysis }) {
  const { trendShort, trendLong, volumeStatus, volumeRatio, rsi, atr, atrPercent, ema20, ema50, ema200, vwap } = analysis;

  const metrics = [
    {
      label: 'Tendencia Corta',
      sub: ema20 ? `EMA20 · $${fmtPrice(ema20)}` : 'vs EMA 20',
      Icon: trendShort === 'alcista' ? TrendingUp : TrendingDown,
      color: trendShort === 'alcista' ? 'text-emerald-400' : 'text-red-400',
      value: <TrendBadge direction={trendShort} />
    },
    {
      label: 'Tendencia Larga',
      sub: ema200 ? `EMA200 · $${fmtPrice(ema200)}` : 'vs EMA 200',
      Icon: trendLong === 'alcista' ? TrendingUp : TrendingDown,
      color: trendLong === 'alcista' ? 'text-emerald-400' : 'text-red-400',
      value: <TrendBadge direction={trendLong} />
    },
    {
      label: 'RSI (14)',
      sub: getRsiLabel(rsi),
      Icon: Activity,
      color: getRsiColor(rsi),
      value: rsi != null ? (
        <div>
          <span className={`font-bold text-sm tabular ${getRsiColor(rsi)}`}>{rsi.toFixed(1)}</span>
          <RsiBar rsi={rsi} />
        </div>
      ) : <span className="text-slate-500 text-sm">N/A</span>
    },
    {
      label: 'Volumen',
      sub: volumeRatio != null ? `×${volumeRatio} vs promedio` : '',
      Icon: BarChart3,
      color: getVolumeColor(volumeStatus),
      value: <span className={`font-semibold text-sm ${getVolumeColor(volumeStatus)}`}>{getVolumeLabel(volumeStatus)}</span>
    },
    {
      label: 'ATR · Volatilidad',
      sub: atr ? `$${fmtPrice(atr)} por vela` : '',
      Icon: Zap,
      color: getAtrColor(atrPercent),
      value: atrPercent != null ? (
        <span className={`font-bold text-sm tabular ${getAtrColor(atrPercent)}`}>{atrPercent}%</span>
      ) : <span className="text-slate-500 text-sm">N/A</span>
    },
    {
      label: 'EMA 50 / VWAP',
      sub: vwap ? `VWAP $${fmtPrice(vwap)}` : '',
      Icon: LineChart,
      color: 'text-blue-400',
      value: <span className="font-semibold text-sm text-blue-400 tabular">{ema50 ? `$${fmtPrice(ema50)}` : 'N/A'}</span>
    }
  ];

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 sm:grid-cols-3 gap-2.5"
    >
      {metrics.map((m, i) => (
        <motion.div
          key={i}
          variants={cardAnim}
          className="bg-slate-900/60 border border-white/[0.05] rounded-xl p-3.5 backdrop-blur-sm"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <m.Icon className={`w-3.5 h-3.5 ${m.color}`} />
            <span className="text-xs text-slate-500 leading-tight">{m.label}</span>
          </div>
          <div>{m.value}</div>
          {m.sub && <p className="text-[10px] text-slate-600 mt-1 leading-tight">{m.sub}</p>}
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getVolumeLabel(s) {
  return { muy_alto: 'Muy Alto', creciendo: 'Creciendo', normal: 'Normal', decreciendo: 'Bajo', muy_bajo: 'Muy Bajo' }[s] ?? 'N/A';
}
function getVolumeColor(s) {
  if (!s) return 'text-slate-400';
  if (['muy_alto','creciendo'].includes(s)) return 'text-emerald-400';
  if (['muy_bajo','decreciendo'].includes(s)) return 'text-red-400';
  return 'text-slate-300';
}
function getRsiColor(rsi) {
  if (!rsi) return 'text-slate-400';
  if (rsi > 70) return 'text-red-400';
  if (rsi > 60) return 'text-orange-400';
  if (rsi < 30) return 'text-emerald-400';
  if (rsi < 40) return 'text-blue-400';
  return 'text-slate-300';
}
function getRsiLabel(rsi) {
  if (!rsi) return '';
  if (rsi > 70) return 'Zona sobrecompra';
  if (rsi > 60) return 'Zona alta';
  if (rsi < 30) return 'Zona sobreventa';
  if (rsi < 40) return 'Zona baja';
  return 'Zona neutral';
}
function getAtrColor(p) {
  if (!p) return 'text-slate-400';
  if (p > 5) return 'text-red-400';
  if (p > 3) return 'text-orange-400';
  if (p < 1.5) return 'text-emerald-400';
  return 'text-slate-300';
}
function fmtPrice(p) {
  if (!p) return 'N/A';
  if (p >= 10000) return Math.round(p).toLocaleString('en-US');
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default TechnicalAnalysis;
