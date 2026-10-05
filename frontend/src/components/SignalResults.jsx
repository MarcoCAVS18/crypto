// "Cómo le fue a la señal": cuánto la seguiste y qué pasó después, por activo. Reemplaza al viejo "Historial de señales IA".
import { useEffect, useMemo, useState } from 'react';
import { Panel } from './ui/Panel';
import { PillTabs } from './ui/PillTabs';
import { Row, Rows } from './ui/Row';
import { Section } from './ui/Section';
import { fetchDecisions, fetchMetrics } from '../services/api';
import { metricRows, pct, rate } from '../utils/metricsFormat';
import { signalOutcome } from '../utils/portfolioView';
import { actionView, fmtPrice, assetTab } from '../utils/signalView';
import { useAppStore } from '../store/appStore';

const HORIZONS = [{ id: 5, label: '5 días' }, { id: 20, label: '20 días' }, { id: 60, label: '60 días' }];
const day = (ts) => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }); };

function useAsync(fn, deps) {
  const [s, setS] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let off = false;
    setS({ loading: true, data: null, error: null });
    fn().then(data => !off && setS({ loading: false, data, error: null }))
      .catch(e => !off && setS({ loading: false, data: null, error: e.response?.data?.error ?? e.message ?? 'error de red' }));
    return () => { off = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return s;
}

function Follow({ follow }) {
  if (!follow?.signals) return null;
  const rows = [
    ['Señales de compra/venta', `${follow.signals}`],
    ['Las seguiste', `${follow.followed}${Number.isFinite(follow.followRate) ? ` · ${rate(follow.followRate)}` : ''}`]
  ];
  if (Number.isFinite(follow.meanRetFollowed) && Number.isFinite(follow.meanRetNotFollowed)) {
    rows.push(['Retorno a 20 d si la seguiste', pct(follow.meanRetFollowed)], ['Retorno a 20 d si no', pct(follow.meanRetNotFollowed)]);
  }
  if (follow.operationsWithoutSignal > 0) rows.push(['Operaciones tuyas sin señal', `${follow.operationsWithoutSignal} de ${follow.operations}`]);
  return (
    <div>
      <Rows>{rows.map(([k, v]) => <Row key={k} label={k} value={v} />)}</Rows>
      <p className="text-xs text-faint leading-relaxed pt-2 pb-1">Una señal repetida durante horas cuenta una vez. Se considera seguida si cargaste una operación del mismo tipo ese día o el siguiente.</p>
    </div>
  );
}

function Hits({ metrics, h, setH }) {
  const rows = metricRows(metrics.summary, h);
  return (
    <div className="space-y-3">
      <PillTabs options={HORIZONS} value={h} onChange={setH} size="sm" layoutId="horizon-pill" />
      {rows.length === 0 ? (
        <p className="text-sm text-muted leading-relaxed">Todavía no hay señales con {h} días cumplidos. Cada una se evalúa a 1, 5, 20 y 60 días y se compara con operar un día cualquiera.</p>
      ) : (
        <Rows>
          {rows.map(r => (
            <Row key={r.action} label={actionView(r.action).word} sub={`${r.n} señal${r.n === 1 ? '' : 'es'}${r.lowSample ? ' · pocas, no concluyente' : ''} · al azar acertarías ${r.base}`}
              value={`${r.hit} acierto`} right={<p className="text-xs text-muted num">{r.ret} medio</p>} tone={r.lowSample ? 'muted' : 'ink'} />
          ))}
        </Rows>
      )}
    </div>
  );
}

export function SignalResults({ symbols }) {
  const [symbol, setSymbol] = useState(symbols[0]);
  const [h, setH] = useState(20);
  const price = useAppStore(s => s.cryptoData[symbol]?.price);
  const active = symbols.includes(symbol) ? symbol : symbols[0];
  const decisions = useAsync(() => fetchDecisions(active, 100), [active]);
  const metrics = useAsync(() => fetchMetrics(active), [active]);

  const list = useMemo(() => {
    const raw = decisions.data;
    const arr = Array.isArray(raw) ? raw : raw?.decisions ?? [];
    return [...arr].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [decisions.data]);
  const recent = list.filter(d => d.decision !== 'WAIT').slice(0, 4);
  const counts = { BUY: 0, WAIT: 0, SELL: 0 };
  list.forEach(d => { if (counts[d.decision] !== undefined) counts[d.decision] += 1; });

  return (
    <Section title="Cómo te fue con las señales">
      <Panel className="space-y-5">
        {symbols.length > 1 && <PillTabs options={symbols.map(s => ({ id: s, label: assetTab(s) }))} value={active} onChange={setSymbol} size="sm" layoutId="results-pill" />}

        {decisions.loading || metrics.loading ? <div className="h-24 rounded-2xl bg-panel-2 animate-pulse" /> : (
          <>
            {decisions.error && <p className="text-xs text-warn">No se pudo leer el historial ({decisions.error}).</p>}
            {list.length === 0 && !decisions.error ? (
              <p className="text-sm text-muted leading-relaxed">Todavía no hay señales registradas. Se guarda una por hora cuando abrís el análisis.</p>
            ) : list.length > 0 && (
              <p className="text-sm text-muted"><b className="text-ink">{list.length}</b> señales guardadas: <span className="text-accent font-semibold">{counts.BUY} compra</span> · <span className="text-warn font-semibold">{counts.WAIT} esperar</span> · <span className="text-pink font-semibold">{counts.SELL} venta</span></p>
            )}

            {metrics.error ? <p className="text-xs text-warn">No se pudieron leer los resultados reales ({metrics.error}).</p> : metrics.data && (
              <>
                <Follow follow={metrics.data.follow} />
                <Hits metrics={metrics.data} h={h} setH={setH} />
                {metrics.data.shadow?.n > 0 && (
                  <p className="text-xs text-muted leading-relaxed">Contra comprar un monto fijo cada tanto (a 20 d): el motor {pct(metrics.data.shadow.champion.meanRet)} ({metrics.data.shadow.champion.buys} compras) · monto fijo {pct(metrics.data.shadow.shadow.meanRet)} ({metrics.data.shadow.shadow.buys}).</p>
                )}
              </>
            )}

            {recent.length > 0 && (
              <div>
                <p className="text-xs text-muted mb-1">Últimas señales y qué pasó desde entonces</p>
                <Rows>
                  {recent.map((d, i) => {
                    const v = actionView(d.decision); const o = signalOutcome(d.decision, d.price, price);
                    return <Row key={`${d.timestamp}-${i}`} label={v.word} sub={`${day(d.timestamp)}${d.price ? ` · ${fmtPrice(d.price)}` : ''}`} value={o ? `${o.pct >= 0 ? '+' : ''}${o.pct.toFixed(1)} %` : null} tone={o ? (o.good ? 'accent' : 'pink') : 'ink'} />;
                  })}
                </Rows>
              </div>
            )}
          </>
        )}
      </Panel>
    </Section>
  );
}

export default SignalResults;
