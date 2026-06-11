// Hero principal: gráfico de velas a pantalla completa con zonas pintadas
// y un glass panel que muestra la decisión actual.
import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpCircle, Clock, ArrowDownCircle, ChevronDown, Sparkles } from 'lucide-react';
import { fetchCandles } from '../services/api';

const ACTION_STYLE = {
  BUY:  {
    label: 'COMPRAR', sub: 'Señal de entrada',
    Icon: ArrowUpCircle,
    ring: 'shadow-emerald-500/20', accent: 'text-emerald-400',
    glow: 'rgba(52,211,153,0.18)',
    border: 'border-emerald-500/25', bg: 'bg-emerald-950/30'
  },
  WAIT: {
    label: 'ESPERAR', sub: 'Sin señal clara',
    Icon: Clock,
    ring: 'shadow-amber-500/15', accent: 'text-amber-400',
    glow: 'rgba(251,191,36,0.14)',
    border: 'border-amber-500/20', bg: 'bg-amber-950/20'
  },
  SELL: {
    label: 'VENDER', sub: 'Señal de salida',
    Icon: ArrowDownCircle,
    ring: 'shadow-rose-500/20', accent: 'text-rose-400',
    glow: 'rgba(251,113,133,0.18)',
    border: 'border-rose-500/25', bg: 'bg-rose-950/30'
  }
};

const RANGES = [
  { id: '1d',  label: '1D', granularity: '15m', count: 96  },
  { id: '7d',  label: '7D', granularity: '1h',  count: 168 },
  { id: '30d', label: '1M', granularity: '4h',  count: 180 },
  { id: '90d', label: '3M', granularity: '1d',  count: 90  }
];

export function MarketHero({ symbol, price, change24h, zones, decision, onOpenDetails }) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const seriesRef    = useRef(null);
  const [range, setRange]               = useState('7d');
  const [candles, setCandles]           = useState([]);
  const [loadingCandles, setLoadingCandles] = useState(false);

  const action   = decision?.action ?? 'WAIT';
  const cfg      = ACTION_STYLE[action] ?? ACTION_STYLE.WAIT;
  const Icon     = cfg.Icon;
  const rangeCfg = useMemo(() => RANGES.find(r => r.id === range) ?? RANGES[1], [range]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingCandles(true);
      try {
        const data      = await fetchCandles(symbol, rangeCfg.granularity, rangeCfg.count);
        if (cancelled) return;
        const formatted = (data?.candles ?? []).map(c => ({
          time:  Math.floor((c.timestamp ?? c.time) / 1000),
          open:  c.open, high: c.high, low: c.low, close: c.close
        }));
        setCandles(formatted);
      } catch (err) {
        console.warn('No se pudieron cargar las velas:', err.message);
        if (!cancelled) setCandles([]);
      } finally {
        if (!cancelled) setLoadingCandles(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [symbol, rangeCfg.granularity, rangeCfg.count]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout:    { background: { color: 'transparent' }, textColor: '#64748b', fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' },
      grid:      { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
      timeScale: { borderColor: 'rgba(255,255,255,0.04)', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.04)' },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: 'rgba(148,163,184,0.25)', width: 1, style: 3, labelBackgroundColor: '#1e293b' },
        horzLine: { color: 'rgba(148,163,184,0.25)', width: 1, style: 3, labelBackgroundColor: '#1e293b' }
      },
      handleScroll: false,
      handleScale:  false
    });

    const series = chart.addCandlestickSeries({
      upColor:         '#10b981',
      downColor:       '#f43f5e',
      borderUpColor:   '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor:     '#10b981',
      wickDownColor:   '#f43f5e',
      priceFormat: { type: 'price', precision: symbol === 'BTC' ? 0 : 2, minMove: symbol === 'BTC' ? 1 : 0.01 }
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e?.contentRect) chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [symbol]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (candles.length > 0) {
      seriesRef.current.setData(candles);
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles]);

  useEffect(() => {
    if (!seriesRef.current || !zones) return;
    const series = seriesRef.current;
    const lines  = [];
    const addLine = (price, color, title) =>
      lines.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title }));
    if (zones.buy?.max)  addLine(zones.buy.max,  'rgba(16,185,129,0.5)',  'Buy zone');
    if (zones.sell?.min) addLine(zones.sell.min, 'rgba(244,63,94,0.5)',   'Sell zone');
    return () => lines.forEach(l => series.removePriceLine(l));
  }, [zones]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-3xl border border-white/[0.06] bg-[#060b1c]"
      style={{ minHeight: '460px' }}
    >
      {/* Chart canvas */}
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* Bottom gradient overlay */}
      <div className="absolute inset-x-0 bottom-0 h-56 z-10 bg-gradient-to-t from-[#060b1c] via-[#060b1c]/80 to-transparent pointer-events-none" />

      {/* Top bar — symbol + price + range */}
      <div className="relative z-20 flex items-start justify-between p-4 pointer-events-none">
        <div className="pointer-events-auto">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">{symbol}</span>
            <span className="text-3xl font-bold text-white tabular">
              {price ? `$${price.toLocaleString('en-US', { maximumFractionDigits: symbol === 'BTC' ? 0 : 2 })}` : '—'}
            </span>
            {change24h != null && (
              <span className={`text-sm font-semibold tabular px-2 py-0.5 rounded-lg ${
                change24h >= 0
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-rose-400 bg-rose-500/10'
              }`}>
                {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* Range selector */}
        <div className="pointer-events-auto flex items-center gap-0.5 bg-slate-900/70 border border-white/[0.06] rounded-lg p-1 backdrop-blur-sm">
          {RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors tabular ${
                range === r.id
                  ? 'bg-violet-500/20 text-violet-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loadingCandles && candles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-slate-600">Cargando velas...</span>
        </div>
      )}

      {/* Glass decision panel */}
      <AnimatePresence mode="wait">
        <motion.div
          key={action}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-x-4 bottom-4 z-20"
        >
          <div
            className={`rounded-2xl border border-white/[0.07] bg-[#08111f]/70 backdrop-blur-xl shadow-2xl p-4`}
            style={{ boxShadow: `0 0 50px -18px ${cfg.glow}` }}
          >
            <div className="flex items-start gap-3.5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg} border ${cfg.border} shrink-0`}>
                <Icon className={`w-5 h-5 ${cfg.accent}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0 mb-1">
                  <span className={`text-base font-bold tracking-wider ${cfg.accent}`}>{cfg.label}</span>
                  <span className="text-[10px] text-slate-500">{cfg.sub}</span>
                </div>
                {decision?.reason ? (
                  <p className="text-sm text-slate-300 leading-relaxed line-clamp-2">{decision.reason}</p>
                ) : (
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Configurá tu posición para ver una señal personalizada.
                  </p>
                )}
              </div>
              <button
                onClick={onOpenDetails}
                className="shrink-0 group flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-widest">Detalles</span>
                <ChevronDown className="w-3 h-3 group-hover:translate-y-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default MarketHero;
