// Sección de Portfolio personal: registro de operaciones e inversiones
import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import {
  PlusCircle, Trash2, TrendingUp, TrendingDown, Wallet,
  BarChart3, RefreshCw, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import { useAppStore } from '../store/appStore';

const SUPPORTED_SYMBOLS = ['BTC', 'PAXG', 'ETH', 'USDT', 'USDC'];
const EXCHANGES = ['Binance', 'Coinbase', 'Kraken', 'OKX', 'Bybit', 'Manual'];

const EMPTY_FORM = {
  date: new Date().toISOString().split('T')[0],
  symbol: 'BTC',
  type: 'BUY',
  amount_usd: '',
  price: '',
  units: '',
  fee: '',
  exchange: 'Binance',
  notes: ''
};

export function PortfolioSection() {
  const { portfolio, loadPortfolio, addOperation, removeOperation, cryptoData } = useAppStore();
  const { operations, summary, loading } = portfolio;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [expandedOp, setExpandedOp] = useState(null);
  const [filterSymbol, setFilterSymbol] = useState('ALL');

  useEffect(() => {
    loadPortfolio();
  }, []);

  // Calcular units automáticamente si se tienen amount y price
  const handleFormChange = (field, value) => {
    setForm(prev => {
      const updated = { ...prev, [field]: value };
      if ((field === 'amount_usd' || field === 'price') && updated.amount_usd && updated.price) {
        const units = parseFloat(updated.amount_usd) / parseFloat(updated.price);
        if (!isNaN(units)) updated.units = units.toFixed(8);
      }
      if (field === 'units' && updated.units && updated.price) {
        const amount = parseFloat(updated.units) * parseFloat(updated.price);
        if (!isNaN(amount)) updated.amount_usd = amount.toFixed(2);
      }
      return updated;
    });
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.date || !form.amount_usd || !form.price || !form.units) {
      setError('Completa todos los campos requeridos');
      return;
    }
    setSaving(true);
    try {
      await addOperation({
        ...form,
        amount_usd: parseFloat(form.amount_usd),
        price: parseFloat(form.price),
        units: parseFloat(form.units),
        fee: parseFloat(form.fee) || 0
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta operación?')) return;
    try {
      await removeOperation(id);
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredOps = filterSymbol === 'ALL'
    ? operations
    : operations.filter(o => o.symbol === filterSymbol);

  const currentPrices = {
    BTC: cryptoData.BTC?.price,
    PAXG: cryptoData.PAXG?.price
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white shrink-0">Mi Portfolio</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={loadPortfolio}
            disabled={loading}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 text-sm">
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Agregar operación</span>
            <span className="sm:hidden">Agregar</span>
          </Button>
        </div>
      </div>

      {/* Resumen por símbolo */}
      {summary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {summary.map(s => (
            <SummaryCard key={s.symbol} summary={s} currentPrice={currentPrices[s.symbol]} />
          ))}
        </div>
      )}

      {summary.length === 0 && !loading && (
        <Card className="text-center py-8 text-gray-500">
          <Wallet className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>Aún no hay operaciones registradas.</p>
          <p className="text-sm mt-1">Agrega tu primera compra o venta para ver el balance.</p>
        </Card>
      )}

      {/* Formulario de nueva operación */}
      {showForm && (
        <Card className="border border-blue-500/30">
          <h3 className="text-sm font-semibold text-blue-400 mb-4">Nueva Operación</h3>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm mb-3 p-2 bg-red-500/10 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Fecha */}
            <FormField label="Fecha *">
              <input type="date" value={form.date}
                onChange={e => handleFormChange('date', e.target.value)}
                className={inputClass} />
            </FormField>

            {/* Símbolo */}
            <FormField label="Activo *">
              <select value={form.symbol}
                onChange={e => handleFormChange('symbol', e.target.value)}
                className={inputClass}>
                {SUPPORTED_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>

            {/* Tipo */}
            <FormField label="Tipo *">
              <div className="flex gap-2">
                {['BUY', 'SELL'].map(t => (
                  <button
                    key={t}
                    onClick={() => handleFormChange('type', t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                      ${form.type === t
                        ? t === 'BUY' ? 'bg-green-500/20 border border-green-500 text-green-400'
                          : 'bg-red-500/20 border border-red-500 text-red-400'
                        : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                  >
                    {t === 'BUY' ? 'Compra' : 'Venta'}
                  </button>
                ))}
              </div>
            </FormField>

            {/* Precio */}
            <FormField label="Precio por unidad (USD) *">
              <NumericInput value={form.price} prefix="$"
                onChange={v => handleFormChange('price', v)} placeholder="Ej: 95000" />
            </FormField>

            {/* Monto USD */}
            <FormField label="Monto total (USD) *">
              <NumericInput value={form.amount_usd} prefix="$"
                onChange={v => handleFormChange('amount_usd', v)} placeholder="Ej: 500" />
            </FormField>

            {/* Unidades */}
            <FormField label="Unidades *">
              <NumericInput value={form.units}
                onChange={v => handleFormChange('units', v)} placeholder="Auto-calculado" />
            </FormField>

            {/* Fee */}
            <FormField label="Fee / Comisión (USD)">
              <NumericInput value={form.fee} prefix="$"
                onChange={v => handleFormChange('fee', v)} placeholder="0" />
            </FormField>

            {/* Exchange */}
            <FormField label="Exchange">
              <select value={form.exchange}
                onChange={e => handleFormChange('exchange', e.target.value)}
                className={inputClass}>
                {EXCHANGES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </FormField>

            {/* Notas */}
            <FormField label="Notas">
              <input type="text" value={form.notes}
                onChange={e => handleFormChange('notes', e.target.value)}
                placeholder="Opcional"
                className={inputClass} />
            </FormField>
          </div>

          <div className="flex gap-2 mt-4">
            <Button onClick={handleSubmit} disabled={saving} className="flex-1">
              {saving ? 'Guardando...' : 'Guardar Operación'}
            </Button>
            <button
              onClick={() => { setShowForm(false); setError(null); }}
              className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors text-sm"
            >
              Cancelar
            </button>
          </div>
        </Card>
      )}

      {/* Lista de operaciones */}
      {operations.length > 0 && (
        <div className="space-y-3">
          {/* Filtro por símbolo */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Filtrar:</span>
            {['ALL', ...SUPPORTED_SYMBOLS].map(s => (
              <button
                key={s}
                onClick={() => setFilterSymbol(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                  ${filterSymbol === s
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredOps.map(op => (
              <OperationRow
                key={op.id}
                op={op}
                expanded={expandedOp === op.id}
                onToggle={() => setExpandedOp(expandedOp === op.id ? null : op.id)}
                onDelete={() => handleDelete(op.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function SummaryCard({ summary, currentPrice }) {
  const hasPrice = currentPrice != null;
  const currentValue = hasPrice ? summary.units * currentPrice : null;
  const pnl = hasPrice ? currentValue - summary.netInvested : null;
  const pnlPct = hasPrice && summary.netInvested > 0 ? (pnl / summary.netInvested) * 100 : null;
  const isProfit = pnl >= 0;

  return (
    <Card className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-400" />
          <span className="font-bold text-white">{summary.symbol}</span>
        </div>
        <span className="text-xs text-gray-500">{summary.operations} op.</span>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Metric label="Unidades" value={formatUnits(summary.units)} />
        <Metric label="Invertido neto" value={`$${summary.netInvested.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
        {summary.avgBuyPrice > 0 && (
          <Metric label="Precio prom. compra" value={formatPrice(summary.avgBuyPrice)} />
        )}
        {hasPrice && (
          <Metric label="Precio actual" value={formatPrice(currentPrice)} />
        )}
        {currentValue != null && (
          <Metric label="Valor actual" value={`$${currentValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
        )}
        {pnl != null && (
          <div>
            <p className="text-xs text-gray-500">P&L no realizado</p>
            <p className={`font-semibold flex items-center gap-1 ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
              {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isProfit ? '+' : ''}{pnl.toLocaleString('en-US', { maximumFractionDigits: 0, style: 'currency', currency: 'USD' })}
              {pnlPct != null && <span className="text-xs opacity-70">({isProfit ? '+' : ''}{pnlPct.toFixed(1)}%)</span>}
            </p>
          </div>
        )}
      </div>

      {!hasPrice && summary.units > 0 && (
        <p className="text-xs text-gray-600">Carga los datos de mercado para ver el P&L</p>
      )}
    </Card>
  );
}

function OperationRow({ op, expanded, onToggle, onDelete }) {
  const isBuy = op.type === 'BUY';
  const color = isBuy ? 'text-green-400' : 'text-red-400';
  const bg = isBuy ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20';

  return (
    <div className={`rounded-lg border ${bg} overflow-hidden`}>
      <div
        className="flex items-center gap-2 sm:gap-3 p-3 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={onToggle}
      >
        {/* Badge tipo */}
        <Badge color={isBuy ? 'green' : 'red'} size="sm">{op.type}</Badge>

        {/* Símbolo + fecha */}
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-white text-sm">{op.symbol}</span>
          <span className="text-gray-500 text-xs ml-1.5">{op.date}</span>
        </div>

        {/* Monto + unidades */}
        <div className="text-right shrink-0 max-w-[120px] sm:max-w-none">
          <p className={`text-sm font-mono font-semibold ${color} truncate`}>
            ${parseFloat(op.amount_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-500 truncate">{formatUnits(op.units)} @ {formatPrice(op.price)}</p>
        </div>

        {/* Toggle */}
        <div className="text-gray-600 shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Detalle expandido */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
            <Metric label="Exchange" value={op.exchange || 'N/A'} />
            <Metric label="Fee" value={op.fee > 0 ? `$${op.fee}` : 'Sin fee'} />
            <Metric label="Precio" value={formatPrice(op.price)} />
            {op.notes && <Metric label="Notas" value={op.notes} />}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="mt-3 flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar operación
          </button>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function FormField({ label, children, className = '' }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-xs text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function NumericInput({ value, onChange, placeholder, prefix }) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        placeholder={placeholder}
        className={`${inputClass} ${prefix ? 'pl-6' : ''}`}
      />
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-200 font-medium">{value}</p>
    </div>
  );
}

function formatPrice(price) {
  if (!price) return 'N/A';
  const p = parseFloat(price);
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function formatUnits(units) {
  if (!units) return '0';
  const u = parseFloat(units);
  if (u >= 1) return u.toFixed(4);
  if (u >= 0.001) return u.toFixed(6);
  return u.toFixed(8);
}

const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-600';

export default PortfolioSection;
