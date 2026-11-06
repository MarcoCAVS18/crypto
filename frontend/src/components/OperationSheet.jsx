// Hoja "Nueva operación": tipo, activo, precio, monto y unidades (se calculan entre sí). Mismas validaciones que antes.
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { PillTabs } from './ui/PillTabs';
import { sanitizeDecimal } from '../utils/decimalInput';
import { operationIssues, priceFarFromMarket } from '../utils/opChecks';
import { useAppStore } from '../store/appStore';
import { cashAfter } from '../utils/signalView';

const EXCHANGES = ['Binance', 'Coinbase', 'Kraken', 'OKX', 'Bybit', 'Manual'];
const today = () => new Date().toISOString().split('T')[0];
const emptyForm = (symbol) => ({ date: today(), symbol, type: 'BUY', amount_usd: '', price: '', units: '', fee: '', exchange: 'Binance', notes: '' });
const cls = 'w-full bg-panel-2 border border-line rounded-2xl px-4 py-3 text-ink placeholder:text-faint focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/60';

function Field({ label, children }) {
  return <label className="block space-y-1.5"><span className="text-xs text-muted">{label}</span>{children}</label>;
}
const Num = ({ value, onChange, placeholder }) => (
  <input type="text" inputMode="decimal" value={value} onChange={e => onChange(sanitizeDecimal(e.target.value))} placeholder={placeholder} className={cls} />
);

const toForm = (op) => ({
  date: String(op.date ?? '').slice(0, 10) || today(), symbol: op.symbol, type: op.type,
  amount_usd: String(op.amount_usd ?? ''), price: String(op.price ?? ''), units: String(op.units ?? ''),
  fee: op.fee > 0 ? String(op.fee) : '', exchange: op.exchange || 'Binance', notes: op.notes ?? ''
});

/**
 * Nueva operación, o —con `editing`— corrige una existente. `draft` = datos para precargar (reintentar una que falló o registrar la compra de la señal).
 * `deduct` = { cash } ofrece descontar la compra de tus USDT (solo al registrar una compra de la señal); `onSaved(data, { deduct })` avisa que se guardó.
 * El padre le cambia la `key` en cada apertura (formulario siempre fresco).
 */
export function OperationSheet({ open, onClose, symbols, editing = null, draft = null, onFail = null, deduct = null, onSaved = null }) {
  const { addOperation, updateOperation, cryptoData, selectedCrypto } = useAppStore();
  const [form, setForm] = useState(() => (editing || draft ? toForm({ ...(editing ?? {}), ...(draft ?? {}) }) : emptyForm(symbols.includes(selectedCrypto) ? selectedCrypto : symbols[0])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deductCash, setDeductCash] = useState(true);

  const set = (field, value) => setForm(prev => {
    const u = { ...prev, [field]: value };
    if ((field === 'amount_usd' || field === 'price') && u.amount_usd && u.price) {
      const units = parseFloat(u.amount_usd) / parseFloat(u.price);
      if (!Number.isNaN(units)) u.units = units.toFixed(8);
    }
    if (field === 'units' && u.units && u.price) {
      const amount = parseFloat(u.units) * parseFloat(u.price);
      if (!Number.isNaN(amount)) u.amount_usd = amount.toFixed(2);
    }
    return u;
  });

  const submit = async () => {
    setError(null);
    if (!form.date || !form.amount_usd || !form.price || !form.units) { setError('Completá fecha, precio, monto y unidades.'); return; }
    if (![form.amount_usd, form.price, form.units].every(v => Number.isFinite(parseFloat(v)) && parseFloat(v) > 0)) { setError('Precio, monto y unidades tienen que ser números mayores que 0.'); return; }
    const issues = operationIssues({ amount_usd: form.amount_usd, price: form.price, units: form.units });
    if (issues.length) { setError(`${issues[0]} Revisá los tres campos.`); return; }
    const market = cryptoData?.[form.symbol]?.price;
    if (priceFarFromMarket(form.price, market) &&
        !window.confirm(`El precio que cargaste ($${parseFloat(form.price).toLocaleString('en-US')}) está muy lejos del precio actual de ${form.symbol} ($${Number(market).toLocaleString('en-US', { maximumFractionDigits: 2 })}). ¿Guardar igual?`)) return;
    if (saving) return;
    const data = { ...form, amount_usd: parseFloat(form.amount_usd), price: parseFloat(form.price), units: parseFloat(form.units), fee: parseFloat(form.fee) || 0 };
    // La hoja se cierra al toque (la pantalla ya muestra el cambio): esperar a la API con la hoja abierta tapaba todo si el servidor tardaba.
    // El teclado se baja antes de cerrar (en iPhone, cerrar con el teclado abierto puede dejar la pantalla trabada).
    document.activeElement?.blur?.();
    setSaving(true);
    onClose();
    try {
      if (editing) await updateOperation(editing.id, data); else await addOperation(data);
      onSaved?.(data, { deduct: !!deduct && !editing && data.type === 'BUY' && deductCash });
    } catch (e) { onFail?.(e.message, data, editing); } finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onClose={() => { setError(null); onClose(); }} title={editing ? 'Editar operación' : 'Nueva operación'}>
      <div className="space-y-5">
        <PillTabs options={[{ id: 'BUY', label: 'Compra' }, { id: 'SELL', label: 'Venta' }]} value={form.type} onChange={v => set('type', v)} layoutId="op-type" />
        {symbols.length > 1 && <PillTabs options={symbols.map(s => ({ id: s, label: s }))} value={form.symbol} onChange={v => set('symbol', v)} size="sm" layoutId="op-symbol" />}

        {error && <div className="flex items-start gap-2 text-pink text-sm p-3.5 bg-pink/10 rounded-2xl"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio por unidad (USD)"><Num value={form.price} onChange={v => set('price', v)} placeholder="4150" /></Field>
          <Field label="Monto total (USD)"><Num value={form.amount_usd} onChange={v => set('amount_usd', v)} placeholder="200" /></Field>
          <Field label="Unidades"><Num value={form.units} onChange={v => set('units', v)} placeholder="Se calcula solo" /></Field>
          <Field label={`Comisión (${form.symbol})`}><Num value={form.fee} onChange={v => set('fee', v)} placeholder="0" /></Field>
          <Field label="Fecha"><input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={cls} /></Field>
          <Field label="Exchange">
            <select value={form.exchange} onChange={e => set('exchange', e.target.value)} className={cls}>{EXCHANGES.map(x => <option key={x} value={x}>{x}</option>)}</select>
          </Field>
        </div>
        <Field label="Notas (opcional)"><input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} className={cls} /></Field>

        {deduct && !editing && form.type === 'BUY' && (
          <label className="flex items-start gap-3 rounded-2xl bg-panel-2 border border-line px-4 py-3.5 cursor-pointer">
            <input type="checkbox" checked={deductCash} onChange={e => setDeductCash(e.target.checked)} className="mt-1 w-4 h-4 accent-accent" />
            <span className="text-sm text-ink leading-snug">
              Descontar de mis USDT
              <span className="block text-xs text-muted mt-0.5">
                {parseFloat(form.amount_usd) > 0
                  ? `Te quedan $${cashAfter(deduct.cash, parseFloat(form.amount_usd)).toLocaleString('en-US', { maximumFractionDigits: 2 })} para las próximas compras (la señal reparte lo que queda).`
                  : 'Así la próxima señal reparte solo lo que te queda.'}
              </span>
            </span>
          </label>
        )}

        <button onClick={submit} disabled={saving} className="w-full py-4 rounded-full bg-accent text-accent-ink font-bold text-base glow-accent disabled:opacity-50">
          {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar operación'}
        </button>
      </div>
    </Sheet>
  );
}

export default OperationSheet;
