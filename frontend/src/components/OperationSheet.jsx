// Hoja "Nueva operación": tipo, activo, precio, monto y unidades (se calculan entre sí). Mismas validaciones que antes.
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { PillTabs } from './ui/PillTabs';
import { sanitizeDecimal } from '../utils/decimalInput';
import { operationIssues, priceFarFromMarket } from '../utils/opChecks';
import { useAppStore } from '../store/appStore';

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

export function OperationSheet({ open, onClose, symbols }) {
  const { addOperation, cryptoData, selectedCrypto } = useAppStore();
  const [form, setForm] = useState(() => emptyForm(symbols.includes(selectedCrypto) ? selectedCrypto : symbols[0]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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
    const issues = operationIssues({ amount_usd: form.amount_usd, price: form.price, units: form.units });
    if (issues.length) { setError(`${issues[0]} Revisá los tres campos.`); return; }
    const market = cryptoData?.[form.symbol]?.price;
    if (priceFarFromMarket(form.price, market) &&
        !window.confirm(`El precio que cargaste ($${parseFloat(form.price).toLocaleString('en-US')}) está muy lejos del precio actual de ${form.symbol} ($${Number(market).toLocaleString('en-US', { maximumFractionDigits: 2 })}). ¿Guardar igual?`)) return;
    setSaving(true);
    try {
      await addOperation({ ...form, amount_usd: parseFloat(form.amount_usd), price: parseFloat(form.price), units: parseFloat(form.units), fee: parseFloat(form.fee) || 0 });
      setForm(emptyForm(form.symbol));
      onClose();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onClose={() => { setError(null); onClose(); }} title="Nueva operación">
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

        <button onClick={submit} disabled={saving} className="w-full py-4 rounded-full bg-accent text-accent-ink font-bold text-base glow-accent disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar operación'}
        </button>
      </div>
    </Sheet>
  );
}

export default OperationSheet;
