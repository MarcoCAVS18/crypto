// LA señal de la pantalla: una sola tarjeta con la acción en grande, el motivo en una línea, el monto y lo que pasa con tu promedio.
// (Reemplaza el panel de vidrio del hero, la tarjeta de recomendación y el bloque de órdenes que repetían lo mismo.)
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Panel } from './ui/Panel';
import { Spinner } from './ui/Spinner';
import { actionView, strengthDots, summarizeOps, totalDcaEffect, fmtPrice } from '../utils/signalView';

const GLOW = { accent: 'rgba(88,226,111,0.16)', warn: 'rgba(243,217,92,0.12)', pink: 'rgba(255,95,168,0.14)' };

function Dots({ n, bg }) {
  return (
    <span className="flex gap-1" aria-label={`Fuerza ${n} de 3`}>
      {[1, 2, 3].map(i => <span key={i} className={`w-2 h-2 rounded-full ${i <= n ? bg : 'bg-white/10'}`} />)}
    </span>
  );
}

export function SignalCard({ symbol, decision, loading, portfolioSummary, onOpenDetails, onConfigure }) {
  if (loading) {
    return <Panel className="flex items-center justify-center py-12"><Spinner /></Panel>;
  }
  if (!decision) {
    return (
      <Panel className="text-center space-y-4 py-8">
        <p className="text-base font-semibold text-ink">Todavía no hay señal</p>
        <p className="text-sm text-muted">Cargá cuántos USDT tenés disponibles y te digo qué hacer con {symbol}.</p>
        <button onClick={onConfigure} className="mx-auto px-6 py-3 rounded-full bg-accent text-accent-ink font-semibold text-sm glow-accent">Cargar mis USDT</button>
      </Panel>
    );
  }

  const view = actionView(decision.action);
  const ops = summarizeOps(decision.operations);
  const effect = ops.type === 'BUY' ? totalDcaEffect(decision.operations, portfolioSummary) : null;

  return (
    <motion.div key={`${decision.action}-${decision.strength}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Panel className="relative overflow-hidden" style={{ backgroundImage: `radial-gradient(120% 90% at 0% 0%, ${GLOW[view.tone]}, transparent 60%)` }}>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">Señal para {symbol}</p>
          <Dots n={strengthDots(decision.strength)} bg={view.bg} />
        </div>

        <p className={`text-[40px] leading-tight font-bold mt-1 ${view.text}`}>{view.word}</p>
        {decision.reason && <p className="text-sm text-muted mt-1 leading-relaxed line-clamp-3">{decision.reason}</p>}

        {ops.count > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="rounded-2xl bg-panel-2/70 border border-line p-3.5">
              <p className="text-xs text-muted">{ops.type === 'BUY' ? 'Comprar hasta' : 'Vender'}</p>
              <p className="text-2xl font-bold text-ink mt-0.5">{ops.totalUsd != null ? fmtPrice(ops.totalUsd, { decimals: 0 }) : `${ops.count} tramos`}</p>
              <p className="text-xs text-muted mt-0.5">{ops.totalUsd != null ? `en ${ops.count} ${ops.count === 1 ? 'tramo' : 'tramos'}` : 'cargá tus USDT para ver el monto'}</p>
            </div>
            <div className="rounded-2xl bg-panel-2/70 border border-line p-3.5">
              <p className="text-xs text-muted">{effect ? 'Tu promedio' : 'Precio de entrada'}</p>
              {effect ? (
                <>
                  <p className="text-base font-bold text-ink mt-1 flex items-center gap-1.5 flex-wrap">{fmtPrice(effect.from)} <ArrowRight className="w-3.5 h-3.5 text-muted" /> {fmtPrice(effect.to)}</p>
                  <p className={`text-xs mt-0.5 font-semibold ${effect.improves ? 'text-accent' : 'text-warn'}`}>{effect.deltaPct >= 0 ? '+' : ''}{effect.deltaPct.toFixed(1)} %</p>
                </>
              ) : (
                <p className="text-2xl font-bold text-ink mt-0.5">{fmtPrice(decision.operations[0]?.price)}</p>
              )}
            </div>
          </div>
        )}

        <button onClick={onOpenDetails} className="mt-5 w-full py-3.5 rounded-full bg-accent text-accent-ink font-semibold text-sm glow-accent active:scale-[0.99] transition">
          Ver por qué y las órdenes
        </button>
      </Panel>
    </motion.div>
  );
}

export default SignalCard;
