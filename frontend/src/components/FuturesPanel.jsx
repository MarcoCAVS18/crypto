// Panel de futuros perpetuos XAUUSDT — señal LONG/SHORT/NEUTRAL con leverage
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, DollarSign } from 'lucide-react';
import { fetchFuturesData } from '../services/api';
import { useAppStore } from '../store/appStore';

const DIRECTION_CONFIG = {
  LONG:    { label: 'LONG',    bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: TrendingUp },
  SHORT:   { label: 'SHORT',   bg: 'bg-rose-500/15',    border: 'border-rose-500/30',    text: 'text-rose-400',    icon: TrendingDown },
  NEUTRAL: { label: 'NEUTRAL', bg: 'bg-slate-700/40',   border: 'border-slate-600/40',   text: 'text-slate-400',   icon: Minus },
};

const CONFIDENCE_COLOR = {
  high:   'bg-emerald-500',
  medium: 'bg-amber-500',
  low:    'bg-rose-500',
};

function fmt(n, decimals = 2) {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n, decimals = 4) {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}

export function FuturesPanel() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [leverage, setLeverage] = useState(10);
  const [aiLeverage, setAiLeverage] = useState(null);
  const [showRisks, setShowRisks] = useState(false);

  const userState  = useAppStore(s => s.userState);
  const portfolio  = useAppStore(s => s.portfolio);
  const cryptoData = useAppStore(s => s.cryptoData);

  const buildPortfolioContext = useCallback(() => {
    const paxgEntry = portfolio?.summary?.find(s => s.symbol === 'PAXG');
    const paxgPrice = cryptoData?.PAXG?.price ?? 0;
    return {
      totalCapital:    userState?.totalCapital ?? 0,
      cashPercent:     userState?.cashPercent  ?? 100,
      paxgUnits:       paxgEntry?.units        ?? 0,
      paxgAvgPrice:    paxgEntry?.avgBuyPrice  ?? 0,
      paxgCurrentPrice: paxgPrice,
    };
  }, [userState, portfolio, cryptoData]);

  const load = useCallback(async (lev = leverage, force = false) => {
    setLoading(true);
    setError('');
    try {
      const ctx = buildPortfolioContext();
      const res = await fetchFuturesData('xauusdt', lev, ctx, force);
      setData(res);
      if (res?.signal?.leverage) setAiLeverage(res.signal.leverage);
    } catch (e) {
      setError(e.message ?? 'Error cargando datos de futuros');
    } finally {
      setLoading(false);
    }
  }, [leverage, buildPortfolioContext]);

  useEffect(() => { load(); }, []);

  const handleLeverageChange = (e) => {
    const v = Number(e.target.value);
    setLeverage(v);
  };

  const handleApplyLeverage = () => load(leverage, false);

  const availableCash = (userState?.totalCapital ?? 0) * ((userState?.cashPercent ?? 100) / 100);

  const dir = DIRECTION_CONFIG[data?.signal?.direction ?? 'NEUTRAL'];
  const DirIcon = dir.icon;

  return (
    <div className="space-y-4">

      {/* Header card */}
      <div className="rounded-2xl bg-slate-900/60 border border-white/[0.07] p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white font-bold text-lg">XAUT Perp</span>
              <span className="text-xs text-slate-500 bg-slate-800/80 border border-white/[0.06] rounded-md px-2 py-0.5">
                Gold Futures
              </span>
            </div>
            {data && (
              <p className="text-slate-500 text-xs">
                Mark: <span className="text-slate-300 font-semibold">${fmt(data.market?.markPrice)}</span>
                <span className="ml-2 text-slate-600">·</span>
                <span className={`ml-2 ${(data.market?.change24h ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {fmtPct(data.market?.change24h, 2)} 24h
                </span>
              </p>
            )}
          </div>
          <motion.button
            onClick={() => load(leverage, true)}
            disabled={loading}
            whileTap={{ scale: 0.93 }}
            className="w-8 h-8 rounded-lg bg-slate-800/50 border border-white/[0.06] flex items-center justify-center
                       hover:bg-slate-700/60 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </motion.button>
        </div>

        {/* Direction badge */}
        {loading && !data ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-slate-700 border-t-slate-400 rounded-full animate-spin" />
          </div>
        ) : data ? (
          <motion.div
            key={data?.signal?.direction}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border ${dir.bg} ${dir.border}`}
          >
            <DirIcon className={`w-6 h-6 ${dir.text} shrink-0`} />
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className={`font-bold text-lg tracking-wide ${dir.text}`}>{dir.label}</span>
                {data.signal?.confidence && (
                  <span className="text-xs text-slate-500 capitalize">· confianza {data.signal.confidence}</span>
                )}
              </div>
              {data.signal?.reasoning && (
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 break-words">{data.signal.reasoning}</p>
              )}
            </div>
          </motion.div>
        ) : null}

        {/* Posición sugerida basada en portfolio */}
        {data?.signal?.positionUsd != null && data.signal.direction !== 'NEUTRAL' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/25"
          >
            <DollarSign className="w-5 h-5 text-violet-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-violet-300 font-semibold text-sm">
                Posición sugerida: <span className="text-white">${fmt(data.signal.positionUsd)}</span>
                {data.signal.leverage > 1 && (
                  <span className="ml-1 text-violet-400/70">× {data.signal.leverage}x = ${fmt(data.signal.positionUsd * data.signal.leverage)} nocional</span>
                )}
              </p>
              {availableCash > 0 && (
                <p className="text-violet-400/60 text-xs mt-0.5">
                  de ${fmt(availableCash)} disponibles ({userState?.cashPercent ?? 100}% de tu capital)
                </p>
              )}
            </div>
          </motion.div>
        )}

        {error && (
          <div className="flex items-start gap-2 mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
            <p className="text-rose-400 text-xs">{error}</p>
          </div>
        )}
      </div>

      {data && (
        <>
          {/* Leverage control */}
          <div className="rounded-2xl bg-slate-900/60 border border-white/[0.07] p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-300 text-sm font-medium">Apalancamiento</p>
              <div className="flex items-center gap-2">
                {aiLeverage && aiLeverage !== leverage && (
                  <button
                    onClick={() => { setLeverage(aiLeverage); load(aiLeverage); }}
                    className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    IA sugiere {aiLeverage}x
                  </button>
                )}
                <span className="text-white font-bold text-base tabular-nums">{leverage}x</span>
              </div>
            </div>
            <input
              type="range"
              min="1" max="20" step="1"
              value={leverage}
              onChange={handleLeverageChange}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                         [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-600 mt-1 px-0.5">
              <span>1x</span><span>5x</span><span>10x</span><span>15x</span><span>20x</span>
            </div>
            {leverage !== (data.signal?.leverage ?? 10) && (
              <motion.button
                onClick={handleApplyLeverage}
                disabled={loading}
                whileTap={{ scale: 0.97 }}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full mt-3 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500
                           text-white text-sm font-semibold transition-colors disabled:opacity-40"
              >
                {loading ? 'Recalculando…' : 'Recalcular con este leverage'}
              </motion.button>
            )}
          </div>

          {/* Precios clave */}
          <div className="rounded-2xl bg-slate-900/60 border border-white/[0.07] p-5 space-y-3">
            <p className="text-slate-300 text-sm font-medium mb-1">Niveles clave ({leverage}x)</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-slate-500 text-xs mb-1">Zona de entrada</p>
                <p className="text-slate-200 font-semibold text-sm">
                  ${fmt(data.signal?.entryZone?.low)} – ${fmt(data.signal?.entryZone?.high)}
                </p>
              </div>
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                <p className="text-rose-400/70 text-xs mb-1">Stop loss</p>
                <p className="text-rose-300 font-semibold text-sm">
                  ${fmt(data.signal?.stopLossPrice)}
                  {data.signal?.stopLossPercent && (
                    <span className="text-xs font-normal ml-1 text-rose-400/60">
                      ({data.signal.stopLossPercent}%)
                    </span>
                  )}
                </p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                <p className="text-amber-400/70 text-xs mb-1">Liquidación est.</p>
                <p className="text-amber-300 font-semibold text-sm">${fmt(data.signal?.liquidationPrice)}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-slate-500 text-xs mb-1">Funding (8h)</p>
                {data.market?.fundingRate != null ? (
                  <p className={`font-semibold text-sm ${(data.market.fundingRate ?? 0) < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {fmtPct(data.market.fundingRate, 4)}
                    <span className="text-xs font-normal ml-1 text-slate-500">
                      ({fmtPct(data.market.fundingRatePerDay, 3)}/día)
                    </span>
                  </p>
                ) : (
                  <p className="text-slate-500 text-sm">N/A</p>
                )}
              </div>
            </div>
          </div>

          {/* Indicadores técnicos */}
          <div className="rounded-2xl bg-slate-900/60 border border-white/[0.07] p-5">
            <p className="text-slate-300 text-sm font-medium mb-3">Técnicos (1h)</p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2.5">
              {[
                { label: 'RSI',         value: data.technicals?.rsi != null ? `${data.technicals.rsi}` : '—' },
                { label: 'Tendencia C', value: data.technicals?.trendShort ?? '—' },
                { label: 'Tendencia L', value: data.technicals?.trendLong  ?? '—' },
                { label: 'ATR',         value: data.technicals?.atr != null ? `$${fmt(data.technicals.atr)}` : '—' },
                { label: 'ATR %',       value: data.technicals?.atrPercent != null ? `${data.technicals.atrPercent}%` : '—' },
                { label: 'Volumen',     value: data.technicals?.volumeStatus ?? '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-slate-600 text-[10px] mb-0.5">{label}</p>
                  <p className="text-slate-200 text-xs font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Contexto macro / news */}
          {data.goldContext && (
            <div className="rounded-2xl bg-slate-900/60 border border-white/[0.07] p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-300 text-sm font-medium">Contexto oro</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold capitalize ${
                    data.goldContext.sentiment === 'bullish' ? 'text-emerald-400' :
                    data.goldContext.sentiment === 'bearish' ? 'text-rose-400' : 'text-slate-400'
                  }`}>{data.goldContext.sentiment}</span>
                  {data.goldContext.score != null && (
                    <span className="text-xs text-slate-600">({data.goldContext.score > 0 ? '+' : ''}{data.goldContext.score})</span>
                  )}
                </div>
              </div>
              {data.goldContext.headlines?.length > 0 && (
                <ul className="space-y-1.5">
                  {data.goldContext.headlines.slice(0, 4).map((h, i) => (
                    <li key={i} className="text-slate-400 text-xs leading-relaxed break-words min-w-0">
                      <span className="text-slate-600 mr-1.5">·</span>
                      {h.url ? (
                        <a href={h.url} target="_blank" rel="noopener noreferrer"
                           className="hover:text-slate-200 transition-colors break-words">
                          {h.title}
                        </a>
                      ) : h.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Riesgos clave */}
          {data.signal?.keyRisks?.length > 0 && (
            <div className="rounded-2xl bg-slate-900/60 border border-white/[0.07] overflow-hidden">
              <button
                onClick={() => setShowRisks(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-slate-300 text-sm font-medium">Riesgos clave</span>
                  <span className="text-xs text-slate-600">({data.signal.keyRisks.length})</span>
                </div>
                {showRisks ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </button>
              <AnimatePresence>
                {showRisks && (
                  <motion.div
                    initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <ul className="px-5 pb-4 space-y-1.5">
                      {data.signal.keyRisks.map((risk, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-400 break-words min-w-0">
                          <span className="text-amber-400 mt-0.5 shrink-0">·</span>
                          <span className="min-w-0 break-words">{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-center text-slate-700 text-[10px] px-4 pb-2">
            Información educativa. No es asesoramiento financiero. Los futuros con apalancamiento conllevan riesgo de liquidación total.
          </p>
        </>
      )}
    </div>
  );
}

export default FuturesPanel;
