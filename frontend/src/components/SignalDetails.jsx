// "Detalles → Señal": recomendación, órdenes y el porqué. La acción y el motivo ya están en la tarjeta de la pantalla.
import { Lightbulb, BrainCircuit } from 'lucide-react';
import { Panel } from './ui/Panel';
import { Row, Rows } from './ui/Row';
import { Section } from './ui/Section';
import { DecisionExplainer } from './DecisionExplainer';
import { fmtPrice, fmtUnits } from '../utils/signalView';

export function SignalDetails({ decision, marketData, symbol, onConfigure }) {
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
        </Section>
      )}

      <DecisionExplainer decision={decision} marketMode={marketData?.marketMode} symbol={symbol} />
    </div>
  );
}

export default SignalDetails;
