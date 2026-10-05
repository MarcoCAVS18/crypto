// Panel de futuros perpetuos XAUUSDT — señal LONG/SHORT/NEUTRAL con leverage
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Panel } from './ui/Panel';
import { Row, Rows } from './ui/Row';
import { Section } from './ui/Section';
import { IconButton } from './ui/IconButton';
import { RefreshCw } from 'lucide-react';
import { fetchFuturesData } from '../services/api';
import { useAppStore } from '../store/appStore';
import { effectiveCashUsd } from '../utils/cash';

const DIRECTION = {
  LONG:    { word: 'Long',    gloss: 'Apostar a que sube',  text: 'text-accent' },
  SHORT:   { word: 'Short',   gloss: 'Apostar a que baja',  text: 'text-pink' },
  NEUTRAL: { word: 'Esperar', gloss: 'Sin señal clara',     text: 'text-warn' }
};
const CONFIDENCE = { high: 'alta', medium: 'media', low: 'baja' };

function fmt(n, decimals = 2) {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const usd = (n, d = 2) => (n == null ? '—' : `$${fmt(n, d)}`);

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
      totalCapital:    effectiveCashUsd(userState),
      cashPercent:     100,
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

  const availableCash = effectiveCashUsd(userState);

  const dir = DIRECTION[data?.signal?.direction ?? 'NEUTRAL'];
  const sig = data?.signal;
  const tech = data?.technicals;

  return (
    <div className="space-y-7">
      <section>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Oro · Futuros perpetuos</p>
            {data && <p className="text-[40px] leading-none font-bold text-ink tracking-tight mt-1">{usd(data.market?.markPrice)}</p>}
            {data && <p className={`text-sm font-semibold mt-2 num ${(data.market?.change24h ?? 0) >= 0 ? 'text-accent' : 'text-pink'}`}>{fmtPct(data.market?.change24h, 2)} <span className="text-muted font-normal">en 24 h</span></p>}
          </div>
          <IconButton icon={RefreshCw} label="Actualizar" onClick={() => load(leverage, true)} spin={loading} disabled={loading} />
        </div>
      </section>

      {loading && !data && <div className="flex justify-center py-16"><span className="w-7 h-7 border-2 border-line border-t-accent rounded-full animate-spin" /></div>}
      {error && <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-pink/10 text-pink text-sm"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

      {data && (
        <>
          <Panel className="space-y-3">
            <p className="text-sm text-muted">Señal en futuros{sig?.confidence ? ` · confianza ${CONFIDENCE[sig.confidence] ?? sig.confidence}` : ''}</p>
            <p className={`text-5xl font-bold tracking-tight ${dir.text}`}>{dir.word}</p>
            <p className="text-sm text-muted">{dir.gloss}</p>
            {sig?.reasoning && <p className="text-sm text-ink/90 leading-relaxed">{sig.reasoning}</p>}
            {sig?.positionUsd != null && sig.direction !== 'NEUTRAL' && (
              <div className="rounded-2xl bg-panel-2 px-4 py-3">
                <p className="text-sm text-ink">Posición sugerida: <b className="num">{usd(sig.positionUsd)}</b>{sig.leverage > 1 && <span className="text-muted"> × {sig.leverage}x = {usd(sig.positionUsd * sig.leverage)} nocional</span>}</p>
                {availableCash > 0 && <p className="text-xs text-muted mt-0.5">de {usd(availableCash)} USDT disponibles</p>}
              </div>
            )}
          </Panel>

          <Section title="Apalancamiento" action={
            <span className="flex items-center gap-3">
              {aiLeverage && aiLeverage !== leverage && <button onClick={() => { setLeverage(aiLeverage); load(aiLeverage); }} className="text-xs font-semibold text-accent">Sugerido: {aiLeverage}x</button>}
              <b className="text-lg text-ink num">{leverage}x</b>
            </span>}>
            <Panel className="space-y-3">
              <input type="range" min="1" max="20" step="1" value={leverage} onChange={handleLeverageChange} className="w-full" aria-label="Apalancamiento" />
              <div className="flex justify-between text-xs text-faint num"><span>1x</span><span>5x</span><span>10x</span><span>15x</span><span>20x</span></div>
              {leverage !== (sig?.leverage ?? 10) && (
                <button onClick={handleApplyLeverage} disabled={loading} className="w-full py-3.5 rounded-full bg-accent text-accent-ink font-bold disabled:opacity-40">{loading ? 'Recalculando…' : 'Recalcular con este apalancamiento'}</button>
              )}
            </Panel>
          </Section>

          <Section title={`Niveles clave (${leverage}x)`}>
            <Panel className="!py-1"><Rows>
              <Row label="Zona de entrada" value={`${usd(sig?.entryZone?.low)} – ${usd(sig?.entryZone?.high)}`} />
              <Row label="Stop loss" sub={sig?.stopLossPercent ? `${sig.stopLossPercent} % desde la entrada` : null} value={`${usd(sig?.stopLossPrice)}`} tone="pink" />
              <Row label="Liquidación estimada" value={`${usd(sig?.liquidationPrice)}`} tone="warn" />
              <Row label="Funding cada 8 h" sub={data.market?.fundingRate != null ? `${fmtPct(data.market.fundingRatePerDay, 3)} por día` : null}
                value={data.market?.fundingRate != null ? fmtPct(data.market.fundingRate, 4) : 'N/D'} tone={(data.market?.fundingRate ?? 0) < 0 ? 'accent' : 'ink'} />
            </Rows></Panel>
          </Section>

          <Section title="Indicadores (1 h)">
            <Panel className="!py-1"><Rows>
              <Row label="RSI" value={tech?.rsi != null ? `${tech.rsi}` : '—'} />
              <Row label="Tendencia" sub="Corto plazo · largo plazo" value={`${tech?.trendShort ?? '—'} · ${tech?.trendLong ?? '—'}`} />
              <Row label="Volatilidad (ATR)" value={tech?.atr != null ? `${usd(tech.atr)}${tech.atrPercent != null ? ` · ${tech.atrPercent} %` : ''}` : '—'} />
              <Row label="Volumen" value={tech?.volumeStatus ?? '—'} />
            </Rows></Panel>
          </Section>

          {data.goldContext?.headlines?.length > 0 && (
            <Section title="Noticias del oro">
              <Panel className="!py-1"><Rows>
                {data.goldContext.headlines.slice(0, 4).map((h, i) => (
                  <div key={i} className="py-3.5 text-sm text-ink leading-snug break-words">
                    {h.url ? <a href={h.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{h.title}</a> : h.title}
                  </div>
                ))}
              </Rows></Panel>
            </Section>
          )}

          {sig?.keyRisks?.length > 0 && (
            <Section title="Riesgos clave">
              <Panel className="space-y-2.5">
                {sig.keyRisks.map((risk, i) => <p key={i} className="flex gap-2.5 text-sm text-muted leading-relaxed"><AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" /><span className="min-w-0 break-words">{risk}</span></p>)}
              </Panel>
            </Section>
          )}

          <p className="text-center text-faint text-xs px-4">Información educativa, no es asesoramiento financiero. Los futuros con apalancamiento pueden liquidarse por completo.</p>
        </>
      )}
    </div>
  );
}

export default FuturesPanel;
