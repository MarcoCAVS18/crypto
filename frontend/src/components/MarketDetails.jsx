// "Detalles → Mercado": lectura de la IA, indicadores (macro/técnicos) y noticias. Un panel de filas por tema, sin cajas anidadas.
import { useState } from 'react';
import { RefreshCw, ExternalLink, Newspaper, AlertTriangle } from 'lucide-react';
import { Panel } from './ui/Panel';
import { Row, Rows } from './ui/Row';
import { Section } from './ui/Section';
import { refreshGoldContext, refreshCryptoNews } from '../services/api';
import { fmtPrice, rsiTag, rsiTone, trendText, trendTone } from '../utils/signalView';

const SENT = { bullish: { label: 'Alcista', text: 'text-accent', bg: 'bg-accent/15' }, neutral: { label: 'Neutral', text: 'text-warn', bg: 'bg-warn/15' }, bearish: { label: 'Bajista', text: 'text-pink', bg: 'bg-pink/15' } };

const relTime = (iso) => {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora'; if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60); return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
};
const pctText = (v) => (v == null ? null : `${v >= 0 ? '+' : ''}${v.toFixed(2)} %`);

const REAL = { very_bullish: ['Muy alcista para el oro', 'accent'], bullish: ['Alcista para el oro', 'accent'], neutral: ['Neutral', 'muted'], bearish: ['Bajista para el oro', 'pink'] };
const COT = { contrarian_bull: ['Señal contraria alcista (extremo corto)', 'accent'], bullish: ['Alcista (largo moderado)', 'accent'], neutral: ['Posición equilibrada', 'muted'], crowded_long: ['Riesgo de corrección (extremo largo)', 'pink'] };

function goldRows(ctx) {
  const m = ctx.macro ?? {}; const rows = [];
  if (m.dxy) rows.push({ k: 'dxy', label: 'Dólar (DXY)', sub: 'Si el dólar sube, presiona al oro', value: m.dxy.value?.toFixed(2), extra: pctText(m.dxy.changePercent), tone: m.dxy.changePercent > 0 ? 'pink' : m.dxy.changePercent < 0 ? 'accent' : 'muted' });
  if (m.tenYearYield) rows.push({ k: 'y10', label: 'Bono 10Y', sub: 'Rendimiento alto = mayor costo de oportunidad', value: `${m.tenYearYield.value?.toFixed(2)} %` });
  const ry = m.realYield ?? ctx.realYield;
  if (ry) { const [t, tone] = REAL[ry.sentiment] ?? REAL.neutral; rows.push({ k: 'ry', label: 'Tasa real 10Y', sub: t, value: `${ry.value?.toFixed(2)} %`, tone }); }
  if (m.gvz) { const v = m.gvz.value; rows.push({ k: 'gvz', label: 'Volatilidad del oro (GVZ)', sub: v > 25 ? 'Alta: entrar con cuidado' : v > 20 ? 'Elevada: precaución' : v < 15 ? 'Baja: tendencia estable' : 'Normal', value: v?.toFixed(1), tone: v > 25 ? 'pink' : v < 15 ? 'accent' : 'ink' }); }
  const ratio = ctx.goldSilverRatio;
  if (ratio != null) rows.push({ k: 'gs', label: 'Ratio oro / plata', sub: ratio > 90 ? 'Oro caro frente a la plata' : ratio < 70 ? 'Rally en ambos metales' : 'Normal', value: ratio.toFixed(1), tone: ratio > 90 ? 'pink' : ratio < 70 ? 'accent' : 'ink' });
  if (ctx.premium?.premiumPct != null) rows.push({ k: 'prem', label: 'Prima de PAXG vs oro', sub: ctx.premium.stale ? 'Referencia desactualizada (mercado cerrado)' : 'Frente a futuros COMEX', value: pctText(ctx.premium.premiumPct), tone: Math.abs(ctx.premium.premiumPct) >= 0.5 ? 'warn' : 'ink' });
  const cot = m.cot ?? ctx.cot;
  if (cot) { const [t, tone] = COT[cot.sentiment] ?? COT.neutral; rows.push({ k: 'cot', label: 'Especuladores (COT)', sub: `${t}${cot.weekChange != null ? ` · semana ${cot.weekChange >= 0 ? '+' : ''}${(cot.weekChange / 1000).toFixed(0)}k` : ''}`, value: `${cot.netSpec >= 0 ? '+' : ''}${(cot.netSpec / 1000).toFixed(0)}k`, tone }); }
  const db = m.dailyBias ?? ctx.dailyBias;
  if (db) rows.push({ k: 'db', label: 'Tendencia diaria del oro', sub: db.longAlignment ? `Largo plazo: ${{ bull: 'alcista', bear: 'bajista', mixed: 'mixto' }[db.longAlignment]}` : null, value: { bull: 'Alcista', bear: 'Bajista', mixed: 'Mixta' }[db.alignment] ?? '—', tone: db.alignment === 'bull' ? 'accent' : db.alignment === 'bear' ? 'pink' : 'warn' });
  return rows;
}

function techRows(ta) {
  if (!ta) return [];
  const vol = { muy_alto: 'Alto', creciendo: 'Subiendo', normal: 'Normal', decreciendo: 'Bajando', muy_bajo: 'Bajo' }[ta.volumeStatus];
  return [
    { k: 'tr', label: 'Tendencia', sub: 'Corto plazo · largo plazo', right: <p className="text-sm font-semibold"><span className={trendTone(ta.trendShort) === 'accent' ? 'text-accent' : 'text-pink'}>{trendText(ta.trendShort)}</span><span className="text-faint"> · </span><span className={trendTone(ta.trendLong) === 'accent' ? 'text-accent' : 'text-pink'}>{trendText(ta.trendLong)}</span></p> },
    ta.rsi != null && { k: 'rsi', label: 'RSI 14', sub: rsiTag(ta.rsi), value: ta.rsi.toFixed(1), tone: rsiTone(ta.rsi) },
    ta.atrPercent != null && { k: 'atr', label: 'Volatilidad (ATR)', sub: 'Rango típico por vela', value: `${ta.atrPercent} %`, tone: ta.atrPercent > 5 ? 'pink' : 'ink' },
    vol && { k: 'vol', label: 'Volumen', sub: ta.volumeRatio ? `×${ta.volumeRatio} del promedio` : null, value: vol },
    ta.ema20 != null && { k: 'e20', label: 'Medias móviles', sub: `EMA 20 · 50 · 200`, right: <p className="text-xs font-semibold text-ink num text-right">{fmtPrice(ta.ema20)} · {fmtPrice(ta.ema50)} · {fmtPrice(ta.ema200)}</p> },
    ta.vwap != null && { k: 'vwap', label: 'VWAP 24 h', value: fmtPrice(ta.vwap) }
  ].filter(Boolean);
}

export function MarketDetails({ symbol, data }) {
  const isGold = symbol === 'PAXG' && data?.marketMode?.goldContext;
  const initial = isGold ? data.marketMode.goldContext : data?.newsContext ?? null;
  const [ctx, setCtx] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState(null);
  if (initial !== ctx && !refreshing && initial?.fetchedAt !== ctx?.fetchedAt) setCtx(initial);

  const refresh = async () => {
    setRefreshing(true); setErr(null);
    try { setCtx(isGold ? await refreshGoldContext() : await refreshCryptoNews(symbol)); }
    catch { setErr('No se pudo actualizar. Probá de nuevo.'); }
    finally { setRefreshing(false); }
  };

  const sent = SENT[ctx?.sentiment ?? ctx?.analysis?.sentiment] ?? SENT.neutral;
  const reasoning = ctx?.reasoning ?? ctx?.analysis?.reasoning;
  const factors = ctx?.keyFactors ?? ctx?.analysis?.keyFactors ?? [];
  const headlines = ctx?.headlines ?? [];
  const macro = isGold ? goldRows(ctx ?? {}) : [];
  const tech = techRows(data?.technicalAnalysis);
  const health = ctx?.dataHealth;

  const row = (r) => <Row key={r.k} label={r.label} sub={r.sub} value={r.value} tone={r.tone} right={r.right ?? (r.extra ? <p className={`text-xs ${r.tone === 'pink' ? 'text-pink' : r.tone === 'accent' ? 'text-accent' : 'text-muted'} num`}>{r.extra}</p> : null)} />;

  return (
    <div className="space-y-7">
      {health?.degraded && (
        <div className={`flex items-start gap-2.5 p-3.5 rounded-2xl text-xs ${health.level === 'severe' ? 'bg-pink/10 text-pink' : 'bg-warn/10 text-warn'}`}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{health.message}</span>
        </div>
      )}

      {ctx && (
        <Section title="Lectura de la IA" action={
          <button onClick={refresh} disabled={refreshing} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{ctx.fetchedAt ? relTime(ctx.fetchedAt) : 'Actualizar'}
          </button>}>
          <Panel className="space-y-3">
            {err && <p className="text-xs text-pink">{err}</p>}
            {ctx.analysisError ? (
              <p className="text-sm text-warn">La IA no respondió ({ctx.analysisError}). Tocá actualizar para reintentar.</p>
            ) : (
              <>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${sent.bg} ${sent.text}`}>{isGold ? 'Oro' : symbol} {sent.label.toLowerCase()}</span>
                {reasoning && <p className="text-sm text-ink/90 leading-relaxed">{reasoning}</p>}
                {factors.length > 0 && <div className="flex flex-wrap gap-2">{factors.map((f, i) => <span key={i} className="px-3 py-1 rounded-full bg-panel-2 text-xs text-muted">{f}</span>)}</div>}
              </>
            )}
          </Panel>
        </Section>
      )}

      {macro.length > 0 && <Section title="Macro del oro"><Panel className="!py-1"><Rows>{macro.map(row)}</Rows></Panel></Section>}
      {tech.length > 0 && <Section title="Indicadores técnicos"><Panel className="!py-1"><Rows>{tech.map(row)}</Rows></Panel></Section>}

      <Section title="Noticias">
        {(ctx?.headlinesSource === 'saved' || ctx?.headlinesSource === 'live+saved') && (
          <p className="text-xs text-warn mb-2">{ctx.headlinesSource === 'saved' ? 'Las fuentes no respondieron: se muestran las últimas noticias guardadas.' : 'Algunos titulares son de una consulta anterior.'}</p>
        )}
        {headlines.length === 0 ? (
          <Panel className="flex items-start gap-3 text-xs text-muted"><Newspaper className="w-4 h-4 mt-0.5 shrink-0" /><p>Sin noticias por ahora: las fuentes no respondieron o no hay titulares de las últimas 72 h. Se reintenta solo en unos minutos.</p></Panel>
        ) : (
          <Panel className="!py-1"><Rows>
            {headlines.slice(0, 6).map((h, i) => {
              const o = h && typeof h === 'object'; const title = o ? h.title : h;
              return (
                <div key={i} className="py-3.5 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink leading-snug">{title}</p>
                    {o && (h.source || h.pubDate) && <p className="text-xs text-muted mt-1">{[h.source, relTime(h.pubDate)].filter(Boolean).join(' · ')}</p>}
                  </div>
                  {o && h.url && h.url !== '#' && <a href={h.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir artículo" className="text-faint hover:text-accent mt-0.5"><ExternalLink className="w-4 h-4" /></a>}
                </div>
              );
            })}
          </Rows></Panel>
        )}
      </Section>
    </div>
  );
}

export default MarketDetails;
