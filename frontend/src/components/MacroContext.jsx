import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Newspaper, BrainCircuit, Clock } from 'lucide-react';

const SENTIMENT = {
  bullish: { label: 'Alcista',  color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', Icon: TrendingUp,  dot: 'bg-emerald-400' },
  neutral: { label: 'Neutral',  color: 'text-amber-400',   bg: 'bg-amber-500/10  border-amber-500/20',   Icon: Minus,       dot: 'bg-amber-400' },
  bearish: { label: 'Bajista',  color: 'text-red-400',     bg: 'bg-red-500/10    border-red-500/20',     Icon: TrendingDown, dot: 'bg-red-400' }
};

function Delta({ v, invert = false }) {
  if (v == null) return null;
  const positive = invert ? v < 0 : v > 0;
  const negative = invert ? v > 0 : v < 0;
  const sign = v >= 0 ? '+' : '';
  return (
    <span className={`text-xs tabular font-medium ${positive ? 'text-emerald-400' : negative ? 'text-red-400' : 'text-slate-500'}`}>
      {sign}{v.toFixed(2)}%
    </span>
  );
}

function MacroStat({ label, value, delta, invertDelta, sub }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <div className="min-w-0 pr-2">
        <p className="text-sm text-slate-300">{label}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold text-white tabular">{value ?? '—'}</span>
        {delta != null && <Delta v={delta} invert={invertDelta} />}
      </div>
    </div>
  );
}

function relativeTime(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

export function MacroContext({ goldContext }) {
  if (!goldContext) return null;
  const { macro, sentiment, reasoning, keyFactors = [], headlines = [], fetchedAt, fromCache } = goldContext;
  const s = SENTIMENT[sentiment] ?? SENTIMENT.neutral;
  const SentIcon = s.Icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="rounded-2xl border border-white/[0.06] bg-slate-900/70 backdrop-blur-sm overflow-hidden"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Contexto Macro · Oro</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
          {fromCache && <Clock className="w-3 h-3" />}
          <span>{relativeTime(fetchedAt)}</span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* AI sentiment block */}
        <div className={`flex items-start gap-3.5 p-4 rounded-xl border ${s.bg}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${s.bg}`}>
            <SentIcon className={`w-4 h-4 ${s.color}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-sm font-bold ${s.color}`}>Oro {s.label}</span>
              <span className="text-[10px] text-slate-600 uppercase tracking-wider">análisis IA</span>
            </div>
            {reasoning && (
              <p className="text-xs text-slate-300 leading-relaxed mb-2">{reasoning}</p>
            )}
            {keyFactors.length > 0 && (
              <ul className="space-y-1">
                {keyFactors.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
                    <span className={`mt-1 w-1 h-1 rounded-full shrink-0 ${s.dot}`} />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Macro indicators */}
        {macro && (macro.dxy || macro.tenYearYield) && (
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">Indicadores</p>
            <div className="bg-slate-900/50 rounded-xl px-4 border border-white/[0.04]">
              {macro.dxy && (
                <MacroStat
                  label="DXY · Dólar EEUU"
                  value={macro.dxy.value?.toFixed(2)}
                  delta={macro.dxy.changePercent}
                  invertDelta
                  sub="Dólar sube → presión bajista en oro"
                />
              )}
              {macro.tenYearYield && (
                <MacroStat
                  label="Bono 10Y · Treasury"
                  value={`${macro.tenYearYield.value?.toFixed(2)}%`}
                  delta={macro.tenYearYield.changePercent}
                  invertDelta
                  sub="Yield alto → mayor costo oportunidad"
                />
              )}
            </div>
          </div>
        )}

        {/* Headlines */}
        {headlines.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Newspaper className="w-3 h-3 text-slate-600" />
              <p className="text-[10px] text-slate-600 uppercase tracking-widest">Últimas noticias</p>
            </div>
            <ul className="space-y-2">
              {headlines.slice(0, 5).map((h, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.2 }}
                  className="flex items-start gap-2 text-xs text-slate-500 leading-relaxed"
                >
                  <span className="shrink-0 text-slate-700 font-mono tabular">{i + 1}.</span>
                  <span>{h}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default MacroContext;
