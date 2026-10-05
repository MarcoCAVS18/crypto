// "Tu posición": cuántos USDT te quedan, modo y ajustes opcionales. Un solo dato obligatorio.
import { useState } from 'react';
import { Panel } from './ui/Panel';
import { PillTabs } from './ui/PillTabs';
import { sanitizeDecimal } from '../utils/decimalInput';

const MODES = [
  { id: 'inversion', label: 'Acumulando' },
  { id: 'observacion', label: 'Solo observar' }
];
const MODE_HELP = {
  inversion: 'Te marca cuándo y cuánto comprar según zonas, tendencia y tu promedio.',
  observacion: 'Solo mirás el mercado: no se arman órdenes de entrada.'
};

function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-ink">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted leading-relaxed">{hint}</span>}
    </label>
  );
}
const inputCls = 'w-full bg-panel-2 border border-line rounded-2xl px-4 py-3 text-ink placeholder:text-faint focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/60';
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

export function UserStateInput({ onSubmit, initialMode = 'inversion', initialCashUsd = 0, initialTarget = '', initialFee = '', symbol = 'PAXG', busy = false }) {
  const isGold = symbol === 'PAXG';
  const [mode, setMode] = useState(initialMode);
  const [cash, setCash] = useState(initialCashUsd > 0 ? String(initialCashUsd) : '');
  const [target, setTarget] = useState(initialTarget ?? '');
  const [fee, setFee] = useState(initialFee ?? '');
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted mb-2">USDT que tenés disponibles</p>
        <div className="flex items-baseline gap-2 bg-panel rounded-[28px] border border-line px-5 py-4 focus-within:border-accent/60">
          <span className="text-3xl font-bold text-muted">$</span>
          <input type="text" inputMode="decimal" value={cash} onChange={e => setCash(sanitizeDecimal(e.target.value))} placeholder="200"
            className="w-full bg-transparent text-4xl font-bold text-ink placeholder:text-faint focus:outline-none num" />
        </div>
        <p className="text-xs text-muted mt-2 leading-relaxed">Solo el efectivo que te queda. Lo que ya compraste se toma del Portfolio.</p>
      </div>

      <div className="space-y-2">
        <PillTabs options={MODES} value={mode} onChange={setMode} size="sm" layoutId="mode-pill" />
        <p className="text-xs text-muted">{MODE_HELP[mode]}</p>
      </div>

      <div>
        <button onClick={() => setShowMore(v => !v)} className="text-sm font-semibold text-accent">{showMore ? 'Ocultar ajustes' : 'Ajustes opcionales'}</button>
        {showMore && (
          <Panel tone="soft" className="mt-3 space-y-4">
            {isGold && (
              <Field label="Peso objetivo del oro (%)" hint="Con objetivo, el motor frena las compras si te pasás de la banda (±5 pts) y acelera si estás por debajo.">
                <input type="text" inputMode="decimal" value={target} placeholder="Sin objetivo" onChange={e => setTarget(sanitizeDecimal(e.target.value))} className={inputCls} />
              </Field>
            )}
            <Field label="Comisión por orden (%)" hint="Binance spot: 0.1 % (0.075 % pagando con BNB). Se usa para estimar costos y descartar tramos ínfimos.">
              <input type="text" inputMode="decimal" value={fee} placeholder="0.1" onChange={e => setFee(sanitizeDecimal(e.target.value))} className={inputCls} />
            </Field>
          </Panel>
        )}
      </div>

      <button disabled={busy}
        onClick={() => onSubmit({ cashUsd: num(cash) ?? 0, mode, targetPercent: isGold ? num(target) : num(initialTarget), feePercent: num(fee) })}
        className="w-full py-4 rounded-full bg-accent text-accent-ink font-bold text-base glow-accent disabled:opacity-50">
        {busy ? 'Analizando…' : 'Actualizar señal'}
      </button>
    </div>
  );
}

export default UserStateInput;
