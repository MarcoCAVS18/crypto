// Precio grande + rango en píldoras + gráfico de velas SIN caja (el gráfico es el protagonista de la pantalla).
import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { fetchCandles } from '../services/api';
import { toChartCandles } from '../utils/chartCandles';
import { PillTabs } from './ui/PillTabs';
import { Delta } from './ui/Delta';
import { assetName, fmtPrice } from '../utils/signalView';
import { CANDLE_UP, CANDLE_DOWN, CHART_GRID, CHART_TEXT } from '../utils/chartColors';

const RANGES = [
  { id: '1d',  label: '1D', granularity: '15m', count: 96  },
  { id: '7d',  label: '7D', granularity: '1h',  count: 168 },
  { id: '30d', label: '1M', granularity: '4h',  count: 180 },
  { id: '90d', label: '3M', granularity: '1d',  count: 90  }
];

export function AssetHero({ symbol, price, change24h, zones, high24h, low24h }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const [range, setRange] = useState('7d');
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const rangeCfg = useMemo(() => RANGES.find(r => r.id === range) ?? RANGES[1], [range]);

  useEffect(() => {
    let cancelled = false;
    setCandles([]); setError(null); setLoading(true);       // vaciar al cambiar de rango: nunca velas del rango anterior bajo la etiqueta nueva
    fetchCandles(symbol, rangeCfg.granularity, rangeCfg.count)
      .then(data => { if (!cancelled) setCandles(toChartCandles(data?.candles)); })
      .catch(err => { console.warn('No se pudieron cargar las velas:', err.message); if (!cancelled) setError('No se pudieron cargar las velas'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, rangeCfg.granularity, rangeCfg.count]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: 'transparent' }, textColor: CHART_TEXT, fontFamily: "'DM Sans Variable', system-ui, sans-serif", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: CHART_GRID } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.08 } },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: 'rgba(255,255,255,0.18)', width: 1, style: 0, labelBackgroundColor: '#18221b' },
        horzLine: { color: 'rgba(255,255,255,0.18)', width: 1, style: 0, labelBackgroundColor: '#18221b' }
      },
      handleScroll: false, handleScale: false
    });
    const series = chart.addCandlestickSeries({
      upColor: CANDLE_UP, downColor: CANDLE_DOWN, borderUpColor: CANDLE_UP, borderDownColor: CANDLE_DOWN, wickUpColor: CANDLE_UP, wickDownColor: CANDLE_DOWN,
      priceFormat: { type: 'price', precision: symbol === 'BTC' ? 0 : 2, minMove: symbol === 'BTC' ? 1 : 0.01 }
    });
    chartRef.current = chart; seriesRef.current = series;
    const ro = new ResizeObserver(entries => { const e = entries[0]; if (e?.contentRect) chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height }); });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [symbol]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(candles);                  // también con [] (limpia la serie anterior)
    if (candles.length > 0) {
      chartRef.current?.timeScale().fitContent();
      // las velas "se dibujan" de izquierda a derecha (si el usuario no pidió menos movimiento)
      const el = containerRef.current;
      if (el?.animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        el.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 800, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      }
    }
  }, [candles]);

  // Zonas de compra / venta: dos líneas finas (etiqueta en el eje), sin llenar el gráfico de texto
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !zones) return;
    const lines = [];
    const add = (p, color, title) => lines.push(series.createPriceLine({ price: p, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title }));
    if (zones.buy?.max) add(zones.buy.max, 'rgba(45,168,74,0.7)', 'Compra');
    if (zones.sell?.min) add(zones.sell.min, 'rgba(224,70,138,0.7)', 'Venta');
    // al desmontar, el gráfico ya fue destruido (su efecto corre antes): quitar la línea puede fallar y no importa
    return () => lines.forEach(l => { try { series.removePriceLine(l); } catch { /* gráfico ya destruido */ } });
  }, [zones]);

  return (
    <section>
      <p className="text-sm text-muted">{assetName(symbol)}</p>
      <div className="flex items-end gap-3 mt-1 flex-wrap">
        <span className="text-[44px] leading-none font-bold text-ink tracking-tight">{fmtPrice(price, { decimals: symbol === 'BTC' ? 0 : 2 })}</span>
        <Delta value={change24h} digits={2} className="mb-1" />
      </div>
      {Number.isFinite(low24h) && Number.isFinite(high24h) && (
        <p className="text-xs text-muted mt-2">24 h · mín <span className="text-ink num">{fmtPrice(low24h)}</span> · máx <span className="text-ink num">{fmtPrice(high24h)}</span></p>
      )}

      <PillTabs className="mt-5" size="sm" layoutId="range-pill" value={range} onChange={setRange} options={RANGES.map(r => ({ id: r.id, label: r.label }))} />

      <div className="relative w-full h-[250px] mt-3 -mx-1">
        <div ref={containerRef} className="absolute inset-0" />
        {candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-muted">{loading ? 'Cargando velas…' : (error ?? 'Sin velas para este rango')}</span>
          </div>
        )}
      </div>
    </section>
  );
}

export default AssetHero;
