// Portfolio P&L chart — dos vistas:
//   "Evolución": área Recharts del costo base + valor actual
//   "Velas":     candlestick lightweight-charts con marcadores de operaciones

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid
} from 'recharts';
import { createChart, ColorType } from 'lightweight-charts';
import { fetchCandles } from '../services/api';
import { Activity, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

// ── Constantes ────────────────────────────────────────────────────────────────

const CHART_BG   = '#0b1120';   // coincide con el card glass sobre body #080c18
const GRID_COLOR = 'rgba(255,255,255,0.04)';

const TIME_RANGES = [
  { label: '1m',  days: 30  },
  { label: '3m',  days: 90  },
  { label: '6m',  days: 180 },
  { label: '1a',  days: 300 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtShortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function fmtUSD(v) {
  if (v == null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function buildEvolutionData(operations, currentPrices) {
  if (!operations?.length) return [];

  const sorted = [...operations].sort((a, b) => new Date(a.date) - new Date(b.date));
  const state = {};  // { [symbol]: { units, costBasis } }
  const points = [];

  for (const op of sorted) {
    const sym = op.symbol;
    if (!state[sym]) state[sym] = { units: 0, costBasis: 0 };

    const units  = parseFloat(op.units)      || 0;
    const amount = parseFloat(op.amount_usd) || 0;

    if (op.type === 'BUY') {
      state[sym].units     += units;
      state[sym].costBasis += amount;
    } else {
      const fraction = state[sym].units > 0
        ? Math.min(1, units / state[sym].units) : 0;
      state[sym].costBasis = Math.max(0, state[sym].costBasis * (1 - fraction));
      state[sym].units     = Math.max(0, state[sym].units - units);
    }

    const totalInvested = Object.values(state).reduce((s, v) => s + v.costBasis, 0);
    points.push({
      date:     op.date,
      label:    fmtShortDate(op.date),
      invested: Math.round(totalInvested),
      op:       { type: op.type, symbol: op.symbol, amount }
    });
  }

  // Punto final: hoy con valor de mercado
  let currentValue = 0;
  for (const [sym, s] of Object.entries(state)) {
    if (s.units > 0 && currentPrices[sym]) currentValue += s.units * currentPrices[sym];
  }

  if (points.length > 0) {
    points.push({
      date:     new Date().toISOString().split('T')[0],
      label:    'Hoy',
      invested: points.at(-1).invested,
      value:    currentValue > 0 ? Math.round(currentValue) : null
    });
  }

  return points;
}

// ── Tooltip personalizado ─────────────────────────────────────────────────────

function EvolutionTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  const pnl = (p.value != null && p.invested != null) ? p.value - p.invested : null;
  const isProfit = pnl != null && pnl >= 0;

  return (
    <div className="bg-slate-900/95 border border-white/10 rounded-xl px-4 py-3 text-xs shadow-2xl backdrop-blur-sm min-w-[160px]">
      <p className="text-gray-400 font-medium mb-2">{p.label}</p>
      {p.invested != null && (
        <p className="text-blue-400">Base: {fmtUSD(p.invested)}</p>
      )}
      {p.value != null && (
        <p className="text-emerald-400 font-semibold">Valor: {fmtUSD(p.value)}</p>
      )}
      {pnl != null && (
        <p className={`font-bold mt-1 ${isProfit ? 'text-emerald-300' : 'text-red-300'}`}>
          {isProfit ? '+' : ''}{fmtUSD(pnl)}
          {p.invested > 0 && (
            <span className="opacity-70 font-normal ml-1">
              ({isProfit ? '+' : ''}{((pnl / p.invested) * 100).toFixed(1)}%)
            </span>
          )}
        </p>
      )}
      {p.op && (
        <p className={`mt-1.5 border-t border-white/5 pt-1.5 ${p.op.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
          {p.op.type} {p.op.symbol} {fmtUSD(p.op.amount)}
        </p>
      )}
    </div>
  );
}

// ── Custom dot: verde para BUY, rojo para SELL ────────────────────────────────

function OpDot({ cx, cy, payload }) {
  if (!payload?.op) return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={0} />;
  const isBuy = payload.op.type === 'BUY';
  return (
    <circle
      key={`${cx}-${cy}-dot`}
      cx={cx} cy={cy} r={5}
      fill={isBuy ? '#10b981' : '#ef4444'}
      stroke={CHART_BG} strokeWidth={2}
    />
  );
}

// ── Sub-componente: gráfico de evolución (Recharts) ───────────────────────────

function EvolucionChart({ operations, currentPrices }) {
  const data = useMemo(() => buildEvolutionData(operations, currentPrices), [operations, currentPrices]);

  if (data.length < 2) {
    return (
      <div className="h-[240px] flex items-center justify-center text-gray-600 text-sm">
        Agrega al menos 2 operaciones para ver la evolución.
      </div>
    );
  }

  const lastPoint  = data.at(-1);
  const totalInv   = lastPoint?.invested   ?? 0;
  const totalVal   = lastPoint?.value      ?? null;
  const pnl        = totalVal != null ? totalVal - totalInv : null;
  const pnlPct     = pnl != null && totalInv > 0 ? (pnl / totalInv) * 100 : null;
  const isProfit   = pnl != null && pnl >= 0;

  // Valor máximo para escalar el eje Y con un 15% de margen
  const allValues  = data.flatMap(d => [d.invested, d.value].filter(Boolean));
  const yMax       = Math.max(...allValues) * 1.15;
  const yMin       = 0;

  const tickY = (v) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`;
    return `$${v}`;
  };

  return (
    <div>
      {/* Resumen rápido */}
      <div className="flex items-center gap-6 px-1 mb-4 text-sm">
        <div>
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Invertido</p>
          <p className="text-white font-semibold tabular">{fmtUSD(totalInv)}</p>
        </div>
        {totalVal != null && (
          <>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Valor actual</p>
              <p className="text-emerald-400 font-semibold tabular">{fmtUSD(totalVal)}</p>
            </div>
            {pnl != null && (
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider">P&L</p>
                <p className={`font-bold tabular flex items-center gap-1 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isProfit
                    ? <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                    : <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                  }
                  {isProfit ? '+' : ''}{fmtUSD(pnl)}
                  {pnlPct != null && (
                    <span className="text-xs opacity-70">({isProfit ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
                  )}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Área chart */}
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="grad-inv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.22} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="grad-val" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={GRID_COLOR} vertical={false} />

          <XAxis
            dataKey="label"
            tick={{ fill: '#4b5563', fontSize: 10 }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            domain={[yMin, yMax]}
            tickFormatter={tickY}
            tick={{ fill: '#4b5563', fontSize: 10 }}
            axisLine={false} tickLine={false}
            width={46}
          />

          <Tooltip content={<EvolutionTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />

          {/* Línea de referencia al valor actual */}
          {totalVal != null && (
            <ReferenceLine
              y={totalVal}
              stroke={isProfit ? '#10b981' : '#ef4444'}
              strokeDasharray="4 3"
              strokeWidth={1}
              opacity={0.5}
            />
          )}

          {/* Área de costo base */}
          <Area
            type="stepAfter"
            dataKey="invested"
            stroke="#3b82f6"
            strokeWidth={1.5}
            fill="url(#grad-inv)"
            dot={(props) => <OpDot {...props} />}
            activeDot={{ r: 5, fill: '#3b82f6', stroke: CHART_BG, strokeWidth: 2 }}
          />

          {/* Área de valor actual (solo el último punto) */}
          {totalVal != null && (
            <Area
              type="monotone"
              dataKey="value"
              stroke={isProfit ? '#10b981' : '#ef4444'}
              strokeWidth={2}
              fill="url(#grad-val)"
              dot={{ r: 6, fill: isProfit ? '#10b981' : '#ef4444', stroke: CHART_BG, strokeWidth: 2 }}
              activeDot={{ r: 7 }}
              connectNulls={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Sub-componente: candlestick (lightweight-charts) ──────────────────────────

function VelasChart({ symbol, operations }) {
  const containerRef  = useRef(null);
  const chartRef      = useRef(null);
  const seriesRef     = useRef(null);
  const [candles, setCandles]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error,   setError]       = useState(null);
  const [range,   setRange]       = useState('3m');

  // Fetch candles al cambiar símbolo o rango
  useEffect(() => {
    if (!symbol) return;
    const days = TIME_RANGES.find(r => r.label === range)?.days ?? 90;
    const count = Math.min(300, days + 10);

    setLoading(true);
    setError(null);

    fetchCandles(symbol, '1d', count)
      .then(d => setCandles(d.candles))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbol, range]);

  // Crear / destruir chart al montar / desmontar
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: '#6b7280',
        fontSize: 11
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR }
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
      width:  containerRef.current.clientWidth,
      height: 260
    });

    const series = chart.addCandlestickSeries({
      upColor:      '#10b981',
      downColor:    '#ef4444',
      borderVisible: false,
      wickUpColor:   '#10b981',
      wickDownColor: '#ef4444'
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    // Resize observer
    const ro = new ResizeObserver(entries => {
      if (!entries[0]) return;
      chart.applyOptions({ width: entries[0].contentRect.width });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, []);

  // Actualizar datos y marcadores cuando cambian candles u operaciones
  useEffect(() => {
    if (!seriesRef.current || !candles) return;

    const days = TIME_RANGES.find(r => r.label === range)?.days ?? 90;
    const cutoff = Date.now() - days * 86_400_000;

    const chartData = candles
      .filter(c => c.timestamp > cutoff)
      .map(c => ({
        time:  Math.floor(c.timestamp / 1000),
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close
      }))
      .sort((a, b) => a.time - b.time);

    if (chartData.length === 0) return;
    seriesRef.current.setData(chartData);

    // Marcadores de operaciones
    const firstTime = chartData[0].time;
    const lastTime  = chartData.at(-1).time;

    const markers = (operations ?? [])
      .filter(op => op.symbol === symbol)
      .map(op => ({
        time:     Math.floor(new Date(op.date + 'T12:00:00Z').getTime() / 1000),
        position: op.type === 'BUY' ? 'belowBar' : 'aboveBar',
        color:    op.type === 'BUY' ? '#10b981' : '#f87171',
        shape:    op.type === 'BUY' ? 'arrowUp'  : 'arrowDown',
        text:     `${op.type} ${fmtUSD(parseFloat(op.amount_usd))}`
      }))
      .filter(m => m.time >= firstTime && m.time <= lastTime)
      .sort((a, b) => a.time - b.time);

    seriesRef.current.setMarkers(markers);
    chartRef.current.timeScale().fitContent();
  }, [candles, operations, symbol, range]);

  return (
    <div>
      {/* Controles: rango */}
      <div className="flex items-center gap-1.5 mb-3">
        {TIME_RANGES.map(r => (
          <button
            key={r.label}
            onClick={() => setRange(r.label)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
              ${range === r.label
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                : 'text-gray-500 hover:text-gray-300'}`}
          >
            {r.label}
          </button>
        ))}
        {loading && <RefreshCw className="w-3.5 h-3.5 text-gray-500 animate-spin ml-1" />}
      </div>

      {/* Canvas container */}
      <div className="relative rounded-xl overflow-hidden">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-red-400 text-xs bg-slate-900/80 z-10">
            Error cargando velas: {error}
          </div>
        )}
        <div ref={containerRef} className="w-full" />

        {/* Blur / fade inferior */}
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{
            height: '60px',
            background: `linear-gradient(to bottom, transparent 0%, ${CHART_BG}cc 55%, ${CHART_BG} 100%)`,
          }}
        />
      </div>

      {/* Leyenda de marcadores */}
      {operations?.some(op => op.symbol === symbol) && (
        <div className="flex items-center gap-4 mt-2.5 text-[11px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Compra
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            Venta
          </span>
          <span className="ml-auto text-gray-600">Velas diarias · Coinbase</span>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function PortfolioChart({ operations, currentPrices, symbols }) {
  const [tab,          setTab]          = useState('evolution');
  const [candleSymbol, setCandleSymbol] = useState(null);

  // Determinar símbolo por defecto para las velas: el que tiene más operaciones
  useEffect(() => {
    if (!operations?.length) return;
    const counts = {};
    for (const op of operations) counts[op.symbol] = (counts[op.symbol] ?? 0) + 1;
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    setCandleSymbol(best ?? symbols?.[0] ?? 'BTC');
  }, [operations, symbols]);

  if (!operations?.length) return null;

  const availableSymbols = symbols?.length
    ? symbols
    : [...new Set(operations.map(o => o.symbol))];

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 border border-white/[0.06]">
      {/* Header con tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
          <TabButton active={tab === 'evolution'} onClick={() => setTab('evolution')}>
            <Activity className="w-3.5 h-3.5" />
            Evolución
          </TabButton>
          <TabButton active={tab === 'candles'} onClick={() => setTab('candles')}>
            <CandleIcon />
            Velas
          </TabButton>
        </div>

        {/* Selector de símbolo (solo en tab velas) */}
        {tab === 'candles' && candleSymbol && (
          <div className="flex items-center gap-1">
            {availableSymbols.map(sym => (
              <button
                key={sym}
                onClick={() => setCandleSymbol(sym)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors
                  ${candleSymbol === sym
                    ? 'bg-white/10 text-white'
                    : 'text-gray-500 hover:text-gray-300'}`}
              >
                {sym}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contenido */}
      {tab === 'evolution' ? (
        <div className="relative">
          <EvolucionChart operations={operations} currentPrices={currentPrices} />
          {/* Fade inferior para la sección de evolución */}
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none rounded-b-xl"
            style={{
              height: '40px',
              background: 'linear-gradient(to bottom, transparent, rgba(9, 14, 28, 0.55))'
            }}
          />
        </div>
      ) : (
        candleSymbol && (
          <VelasChart
            symbol={candleSymbol}
            operations={operations}
          />
        )
      )}
    </div>
  );
}

// ── Micro-componentes UI ──────────────────────────────────────────────────────

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
        ${active
          ? 'bg-white/10 text-white shadow-sm'
          : 'text-gray-500 hover:text-gray-300'}`}
    >
      {children}
    </button>
  );
}

function CandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <rect x="3" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.9" />
      <line x1="4.5" y1="1" x2="4.5" y2="4"  stroke="currentColor" strokeWidth="1.2" />
      <line x1="4.5" y1="10" x2="4.5" y2="13" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="5" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.5" />
      <line x1="9.5" y1="2" x2="9.5" y2="5"  stroke="currentColor" strokeWidth="1.2" />
      <line x1="9.5" y1="10" x2="9.5" y2="12" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export default PortfolioChart;
