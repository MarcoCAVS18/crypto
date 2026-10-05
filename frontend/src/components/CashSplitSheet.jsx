// "¿Cómo repartir mis USDT?": calculadora aparte (no toca tu señal ni tu estado). Pregunta al motor cómo repartirías ese efectivo.
import { useState } from 'react';
import { Sheet } from './ui/Sheet';
import { Panel } from './ui/Panel';
import { Row, Rows } from './ui/Row';
import { sanitizeDecimal } from '../utils/decimalInput';
import { requestDecision } from '../services/api';
import { useAppStore } from '../store/appStore';
import { assetName, fmtPrice } from '../utils/signalView';

export function CashSplitSheet({ open, onClose }) {
  const { selectedCrypto, portfolio } = useAppStore();
  const [input, setInput] = useState('');
  const [state, setState] = useState({ loading: false, ops: null, recommendation: '', cash: 0, error: false });
  const val = parseFloat(input);

  const run = async () => {
    if (!(val > 0)) return;
    setState(s => ({ ...s, loading: true, error: false }));
    try {
      const summary = portfolio.summary.find(s => s.symbol === selectedCrypto) ?? null;
      const ctx = summary?.units > 0 ? { ...summary, hasPosition: true, currentPrice: null, allBuys: [], executedBuys: [] } : null;
      const data = await requestDecision(selectedCrypto, 100, 'inversion', val, ctx);
      setState({ loading: false, ops: (data?.decision?.operations ?? []).filter(o => o.type === 'BUY'), recommendation: data?.decision?.recommendation ?? '', cash: val, error: false });
    } catch { setState({ loading: false, ops: null, recommendation: '', cash: 0, error: true }); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Repartir mis USDT">
      <div className="space-y-5">
        <p className="text-sm text-muted">Probá cómo repartirías un monto entre las zonas de compra de {assetName(selectedCrypto)}. No cambia tu señal.</p>
        <div className="flex items-baseline gap-2 bg-panel rounded-[28px] border border-line px-5 py-4 focus-within:border-accent/60">
          <span className="text-3xl font-bold text-muted">$</span>
          <input type="text" inputMode="decimal" value={input} onChange={e => setInput(sanitizeDecimal(e.target.value))} onKeyDown={e => e.key === 'Enter' && run()} placeholder="200"
            className="w-full bg-transparent text-4xl font-bold text-ink placeholder:text-faint focus:outline-none num" />
        </div>
        <button onClick={run} disabled={state.loading || !(val > 0)} className="w-full py-4 rounded-full bg-accent text-accent-ink font-bold disabled:opacity-40">{state.loading ? 'Calculando…' : 'Calcular'}</button>

        {state.error && <p className="text-sm text-pink">No se pudo calcular. Probá de nuevo.</p>}
        {state.ops && (state.ops.length === 0
          ? <p className="text-sm text-muted">Con el mercado de hoy el motor no arma compras. Mirá la señal para ver por qué.</p>
          : (
            <Panel className="!py-1">
              <Rows>
                {state.ops.map(op => (
                  <Row key={op.level} label={op.label} sub={op.price ? `a ${fmtPrice(op.price)}` : null}
                    value={op.usdAmount != null ? fmtPrice(op.usdAmount, { decimals: 0 }) : `${op.percentage} %`} tone="accent" />
                ))}
              </Rows>
            </Panel>
          ))}
        {state.recommendation && <p className="text-xs text-muted leading-relaxed">{state.recommendation}</p>}
      </div>
    </Sheet>
  );
}

export default CashSplitSheet;
