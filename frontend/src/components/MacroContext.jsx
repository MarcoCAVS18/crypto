import { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Newspaper, BrainCircuit, Clock, RefreshCw, ExternalLink } from 'lucide-react';
import { refreshGoldContext } from '../services/api';

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
  if (min < 1)   return 'ahora';
  if (min < 60)  return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const REAL_YIELD_LABELS = {
  very_bullish: { label: 'Muy alcista para oro', color: 'text-emerald-400' },
  bullish:      { label: 'Alcista para oro',      color: 'text-emerald-400' },
  neutral:      { label: 'Neutral',               color: 'text-slate-400' },
  bearish:      { label: 'Bajista para oro',       color: 'text-red-400' }
};

const COT_LABELS = {
  contrarian_bull: { label: 'Contrarian alcista', color: 'text-emerald-400', sub: 'Extremo short especulativo' },
  bullish:         { label: 'Alcista',             color: 'text-emerald-400', sub: 'Net long moderado' },
  neutral:         { label: 'Neutral',             color: 'text-slate-400',   sub: 'Posición equilibrada' },
  crowded_long:    { label: 'Riesgo de corrección',color: 'text-red-400',     sub: 'Extremo long especulativo' }
};

function RealYieldStat({ data }) {
  if (!data) return null;
  const cfg = REAL_YIELD_LABELS[data.sentiment] ?? REAL_YIELD_LABELS.neutral;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <div className="min-w-0 pr-2">
        <p className="text-sm text-slate-300">Rendimiento Real 10Y (TIPS)</p>
        <p className={`text-[10px] mt-0.5 ${cfg.color}`}>{cfg.label}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold text-white tabular">{data.value?.toFixed(2)}%</span>
      </div>
    </div>
  );
}

function CotSection({ data }) {
  if (!data) return null;
  const cfg = COT_LABELS[data.sentiment] ?? COT_LABELS.neutral;
  const weekSign = data.weekChange >= 0 ? '+' : '';
  const weekColor = data.weekChange > 0 ? 'text-emerald-400' : data.weekChange < 0 ? 'text-red-400' : 'text-slate-500';

  return (
    <div>
      <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">COT · Posición Especulativa Oro</p>
      <div className="bg-slate-900/50 rounded-xl px-4 py-3 border border-white/[0.04] space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-300">Net especulativo</p>
            <p className={`text-[10px] mt-0.5 ${cfg.color}`}>{cfg.label} · {cfg.sub}</p>
          </div>
          <span className="text-sm font-semibold text-white tabular">
            {data.netSpec >= 0 ? '+' : ''}{(data.netSpec / 1000).toFixed(0)}k
          </span>
        </div>
        {data.weekChange != null && (
          <div className="flex items-center justify-between border-t border-white/[0.04] pt-2">
            <p className="text-xs text-slate-500">Cambio semanal</p>
            <span className={`text-xs font-semibold tabular ${weekColor}`}>
              {weekSign}{(data.weekChange / 1000).toFixed(0)}k contratos
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function MacroContext({ goldContext: initialContext }) {
  const [context, setContext] = useState(initialContext);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);

  // Sync when parent prop changes (e.g. on page refresh)
  if (initialContext !== context && !refreshing) {
    setContext(initialContext);
  }

  if (!context) return null;

  const { macro, sentiment, reasoning, keyFactors = [], headlines = [], fetchedAt, fromCache, analysisError, cot, realYield } = context;
  const s = SENTIMENT[sentiment] ?? SENTIMENT.neutral;
  const SentIcon = s.Icon;
  const groqMissing = !!analysisError;

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const fresh = await refreshGoldContext();
      setContext(fresh);
    } catch (err) {
      setRefreshError('No se pudo actualizar. Intenta de nuevo.');
    } finally {
      setRefreshing(false);
    }
  };

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
        <div className="flex items-center gap-2">
          {fetchedAt && (
            <div className="flex items-center gap-1 text-[10px] text-slate-600">
              {fromCache && <Clock className="w-3 h-3" />}
              <span>{relativeTime(fetchedAt)}</span>
            </div>
          )}
          <motion.button
            onClick={handleRefresh}
            disabled={refreshing}
            whileTap={{ scale: 0.9 }}
            title="Forzar actualización (ignora caché)"
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
          </motion.button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Error de refresh */}
        {refreshError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {refreshError}
          </p>
        )}

        {/* AI sentiment block */}
        <div className={`flex items-start gap-3.5 p-4 rounded-xl border ${s.bg}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${s.bg}`}>
            <SentIcon className={`w-4 h-4 ${s.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className={`text-sm font-bold ${s.color}`}>Oro {s.label}</span>
              <span className="text-[10px] text-slate-600 uppercase tracking-wider">análisis IA</span>
            </div>

            {groqMissing ? (
              <div className="space-y-1.5">
                <p className="text-xs text-amber-400/80 font-medium">Error al contactar Groq:</p>
                <p className="text-xs text-slate-400 font-mono bg-slate-800/60 rounded-lg px-2.5 py-2 leading-relaxed break-all">
                  {analysisError}
                </p>
                <p className="text-xs text-slate-600">Presioná ↻ para reintentar.</p>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* Macro indicators */}
        {macro && (macro.dxy || macro.tenYearYield || macro.realYield) && (
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
              {(macro.realYield ?? realYield) && (
                <RealYieldStat data={macro.realYield ?? realYield} />
              )}
            </div>
          </div>
        )}

        {/* COT Report */}
        {(macro?.cot ?? cot) && (
          <CotSection data={macro?.cot ?? cot} />
        )}

        {/* Headlines */}
        {headlines.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Newspaper className="w-3 h-3 text-slate-600" />
              <p className="text-[10px] text-slate-600 uppercase tracking-widest">Últimas noticias</p>
            </div>
            <ul className="space-y-2.5">
              {headlines.slice(0, 6).map((h, i) => {
                const isObj  = h && typeof h === 'object';
                const title  = isObj ? h.title  : h;
                const url    = isObj ? h.url    : null;
                const source = isObj ? h.source : null;
                const age    = isObj ? relativeTime(h.pubDate) : null;

                return (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.2 }}
                    className="flex items-start gap-2"
                  >
                    <span className="shrink-0 text-slate-700 font-mono tabular text-xs mt-0.5">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-400 leading-relaxed">{title}</p>
                      {(source || age) && (
                        <div className="flex items-center gap-2 mt-1">
                          {source && (
                            <span className="text-[10px] text-slate-600 bg-slate-800/60 px-1.5 py-0.5 rounded">
                              {source}
                            </span>
                          )}
                          {age && (
                            <span className="text-[10px] text-slate-700">{age}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir artículo"
                        className="shrink-0 mt-0.5 text-slate-700 hover:text-blue-400 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default MacroContext;
