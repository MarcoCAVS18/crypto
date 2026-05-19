// Hero principal: gráfico de velas a pantalla completa con zonas pintadas
// y un glass panel que muestra la decisión actual.
import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpCircle, Clock, ArrowDownCircle, ChevronDown, Sparkles } from 'lucide-react';
import { fetchCandles } from '../services/api';

const ACTION_STYLE = {
  BUY:  { label: 'COMPRAR', sub: 'Señal de entrada', Icon: ArrowUpCircle, ring: 'shadow-emerald-500/20', accent: 'text-emerald-400', glow: 'rgba(52,211,153,0.18)' },
  WAIT: { label: 'ESPERAR', sub: 'Sin señal clara',  Icon: Clock,         ring: 'shadow-amber-500/15',   accent: 'text-amber-400',   glow: 'rgba(251,191,36,0.15)' },
  SELL: { label: 'VENDER',  sub: 'Señal de salida',  Icon: ArrowDownCircle, ring: 'shadow-red-500/20',   accent: 'text-red-400',     glow: 'rgba(248,113,113,0.18)' }
};

const RANGES = [
  { id: '1d',  label: '1D', granularity: '15m', count: 96  },
  { id: '7d',  label: '7D', granularity: '1h',  count: 168 },
  { id: '30d', label: '1M', granularity: '4h',  count: 180 },
  { id: '90d', label: '3M', granularity: '1d',  count: 90  }
];

export function MarketHero({
  symbol,
  price,
  change24h,
  zones,
  decision,
  onOpenDetails
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const [range, setRange] = useState('7d');
  const [candles, setCandles] = useState([]);
  const [loadingCandles, setLoadingCandles] = useState(false);

  const action = decision?.action ?? 'WAIT';
  const cfg = ACTION_STYLE[action] ?? ACTION_STYLE.WAIT;
  const Icon = cfg.Icon;

  const rangeCfg = useMemo(() => RANGES.find(r => r.id === range) ?? RANGES[1], [range]);

  // ── Fetch candles ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingCandles(true);
      try {
        const data = await fetchCandles(symbol, rangeCfg.granularity, rangeCfg.count);
        if (cancelled) return;
        const formatted = (data?.candles ?? []).map(c => ({
          time: Math.floor((c.timestamp ?? c.time) / 1000),
          open: c.open, high: c.high, low: c.low, close: c.close
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

  // ── Setup chart ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout:    { background: { color: 'transparent' }, textColor: '#64748b', fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' },
      grid:      { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      timeScale: { borderColor: 'rgba(255,255,255,0.05)', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.05)' },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: 'rgba(148,163,184,0.3)', width: 1, style: 3, labelBackgroundColor: '#1e293b' },
        horzLine: { color: 'rgba(148,163,184,0.3)', width: 1, style: 3, labelBackgroundColor: '#1e293b' }
      },
      handleScroll: false,
      handleScale:  false
    });

    const series = chart.addCandlestickSeries({
      upColor:        '#10b981',
      downColor:      '#ef4444',
      borderUpColor:  '#10b981',
      borderDownColor:'#ef4444',
      wickUpColor:    '#10b981',
      wickDownColor:  '#ef4444',
      priceFormat:    { type: 'price', precision: symbol === 'BTC' ? 0 : 2, minMove: symbol === 'BTC' ? 1 : 0.01 }
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e?.contentRect) chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [symbol]);

  // ── Set candles + zone overlays ────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current) return;
    if (candles.length > 0) {
      seriesRef.current.setData(candles);
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles]);

  // Pintar zonas como price lines
  useEffect(() => {
    if (!seriesRef.current || !zones) return;
    const series = seriesRef.current;
    const lines = [];
    const addLine = (price, color, title) => lines.push(series.createPriceLine({
      price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title
    }));
    if (zones.buy?.max)  addLine(zones.buy.max,  'rgba(16,185,129,0.5)',  'Buy zone');
    if (zones.sell?.min) addLine(zones.sell.min, 'rgba(239,68,68,0.5)',   'Sell zone');
    return () => lines.forEach(l => series.removePriceLine(l));
  }, [zones]);

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/[0.06] bg-slate-950"
         style={{ minHeight: '460px' }}>
      {/* Chart canvas — fills the entire area */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Soft gradient at the bottom for the glass panel */}
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent pointer-events-none" />

      {/* Top bar — symbol + price + range selector */}
      <div className="relative flex items-start justify-between p-4 pointer-events-none">
        <div className="pointer-events-auto">
          <div className="flex items-baseline gap-3">
            <span className="text-xs uppercase tracking-widest text-slate-500">{symbol}</span>
            <span className="text-2xl font-bold text-white tabular">
              {price ? `$${price.toLocaleString('en-US', { maximumFractionDigits: symbol === 'BTC' ? 0 : 2 })}` : '—'}
            </span>
            {change24h != null && (
              <span className={`text-sm font-semibold tabular ${change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* Range selector */}
        <div className="pointer-events-auto flex items-center gap-1 bg-slate-900/70 border border-white/[0.06] rounded-lg p-1 backdrop-blur-sm">
          {RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors tabular ${
                range === r.id ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:text-slate-300'
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

      {/* Glass decision panel — bottom */}
      <AnimatePresence mode="wait">
        <motion.div
          key={action}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-x-4 bottom-4"
        >
          <div className={`rounded-2xl border border-white/[0.06] bg-slate-900/60 backdrop-blur-xl shadow-2xl ${cfg.ring} p-5`}
               style={{ boxShadow: `0 0 60px -20px ${cfg.glow}` }}>
            <div className="flex items-start gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center bg-slate-950/60 border border-white/[0.06] ${cfg.accent}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0 mb-1">
                  <span className={`text-base font-bold tracking-wider ${cfg.accent}`}>{cfg.label}</span>
                  <span className="text-[10px] text-slate-500">{cfg.sub}</span>
                </div>
                {decision?.reason && (
                  <p className="text-sm text-slate-300 leading-relaxed line-clamp-2">{decision.reason}</p>
                )}
                {!decision && (
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
