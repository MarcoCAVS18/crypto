// "Detalles → Señal": recomendación, órdenes y el porqué. La acción y el motivo ya están en la tarjeta de la pantalla.
import { Lightbulb, BrainCircuit, Sparkles } from 'lucide-react';
import { Panel } from './ui/Panel';
import { Row, Rows } from './ui/Row';
import { Section } from './ui/Section';
import { DecisionExplainer } from './DecisionExplainer';
import { fmtPrice, fmtUnits, usageOf, aiView } from '../utils/signalView';

export function SignalDetails({ decision, marketData, symbol, cashUsd = 0, onConfigure }) {
  if (!decision) {
    return (
      <Panel className="text-center space-y-4 py-10">
        <p className="text-sm text-muted">Cargá tus USDT disponibles para ver la señal y las órdenes.</p>
        <button onClick={onConfigure} className="px-6 py-3 rounded-full bg-accent text-accent-ink font-semibold text-sm">Cargar mis USDT</button>
      </Panel>
    );
  }
  const ops = (decision.operations ?? []).filter(o => o.type === 'BUY' || o.type === 'SELL');
  const isBuy = ops[0]?.type !== 'SELL';
  const usage = usageOf(decision.operations, cashUsd);
  const ai = aiView(decision);

  return (
    <div className="space-y-7">
      {decision.recommendation && (
        <Panel tone="soft" className="flex gap-3">
          <Lightbulb className="w-5 h-5 text-warn shrink-0 mt-0.5" />
          <div className="space-y-2">
            {decision.recommendation.split(/\s·\s/).map((t, i) => <p key={i} className="text-sm text-ink/90 leading-relaxed">{t.replace(/^⚠️?\s*/, '')}</p>)}
          </div>
        </Panel>
      )}

      {ai && (
        <Panel tone="soft" className="flex gap-3">
          <Sparkles className={`w-5 h-5 shrink-0 mt-0.5 ${ai.tone === 'warn' ? 'text-warn' : ai.tone === 'muted' ? 'text-muted' : 'text-accent'}`} />
          <div className="space-y-2 min-w-0">
            <p className="text-xs text-muted">{ai.title}{ai.confidence != null ? ` · confianza ${ai.confidence} %` : ''}</p>
            {ai.text && <p className="text-sm text-ink/90 leading-relaxed">{ai.text}</p>}
            {ai.detail && <p className="text-sm text-ink leading-relaxed font-semibold">{ai.detail}</p>}
            {ai.factors.length > 0 && (
              <ul className="space-y-1">
                {ai.factors.map((f, i) => <li key={i} className="text-xs text-muted leading-relaxed">· {f}</li>)}
              </ul>
            )}
            {ai.notes.map((n, i) => <p key={i} className="text-xs text-warn leading-relaxed">{n}</p>)}
            {ai.kind !== 'unavailable' && (
              <p className="text-[11px] text-muted/80 leading-relaxed">
                La IA solo afina el momento y el tamaño de una compra que la regla ya permite (tamaño entre ×0.5 y ×1.5, 1–3 tramos, espera máxima de 3 días). Su criterio no está probado con historia: se guarda cada decisión para medirla.
              </p>
            )}
          </div>
        </Panel>
      )}

      {decision.portfolioInsight?.insight && (
        <Panel tone="soft" className="flex gap-3">
          <BrainCircuit className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div><p className="text-xs text-muted mb-1">Análisis de tu posición</p><p className="text-sm text-ink/90 leading-relaxed">{decision.portfolioInsight.insight}</p></div>
        </Panel>
      )}

      {ops.length > 0 && (
        <Section title={isBuy ? 'Órdenes de compra' : 'Órdenes de venta'}>
          <Panel className="!py-1">
            <Rows>
              {ops.map(op => (
                <Row key={op.level} label={op.label}
                  sub={[`a ${fmtPrice(op.price, { decimals: op.price >= 1000 ? 0 : 2 })}`, op.units != null ? `${fmtUnits(op.units)} u.` : null, op.estCostUsd != null ? `costo ≈ $${op.estCostUsd.toFixed(2)}` : null].filter(Boolean).join(' · ')}
                  value={op.usdAmount != null ? fmtPrice(op.usdAmount, { decimals: 0 }) : `${op.percentage} %`} tone={isBuy ? 'accent' : 'pink'} />
              ))}
            </Rows>
          </Panel>
          {usage && (
            <Panel tone="soft" className="mt-3 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-ink">Usás <b className="num">{fmtPrice(usage.usd, { decimals: 0 })}</b> de tus <b className="num">{fmtPrice(usage.cash, { decimals: 0 })}</b></p>
                <p className="text-sm font-semibold text-accent num">{usage.pct} %</p>
              </div>
              <div className="h-2 rounded-full bg-panel-2 overflow-hidden" role="img" aria-label={`Usás el ${usage.pct} % de tus USDT`}>
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, usage.pct)}%` }} />
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Reserva: <b className="text-ink num">{fmtPrice(usage.reserve, { decimals: 0 })}</b> para las próximas compras o por si el precio sigue bajando.
              </p>
            </Panel>
          )}
        </Section>
      )}

      <DecisionExplainer decision={decision} marketMode={marketData?.marketMode} symbol={symbol} cashUsd={cashUsd} />
    </div>
  );
}

export default SignalDetails;
