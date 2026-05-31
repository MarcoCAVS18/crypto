// Sección de Portfolio personal: registro de operaciones e inversiones
import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import {
  PlusCircle, Trash2, TrendingUp, TrendingDown, Wallet,
  BarChart3, RefreshCw, ChevronDown, ChevronUp, AlertCircle,
  DollarSign, ShoppingCart, ArrowRight, Sparkles
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useAuthStore } from '../store/authStore';
import { PortfolioChart } from './PortfolioChart';
import { BacktestStats } from './BacktestStats';

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

// ── Cash Distribution Card ─────────────────────────────────────────────────────
// Completely isolated — uses its own local state and its own API call.
// Never modifies the global userState or currentDecision.

function CashDistributionCard() {
  const { selectedCrypto, portfolio } = useAppStore();

  const [inputVal, setInputVal]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [ops, setOps]             = useState([]);
  const [recommendation, setRecommendation] = useState('');
  const [cashLabel, setCashLabel] = useState(0);

  const handleApply = async () => {
    const val = parseFloat(inputVal);
    if (!val || val <= 0) return;
    setLoading(true);
    setOps([]);
    setRecommendation('');
    try {
      const portfolioSummary = portfolio.summary.find(s => s.symbol === selectedCrypto) ?? null;
      const portfolioContext = portfolioSummary?.units > 0 ? {
        ...portfolioSummary,
        hasPosition:  portfolioSummary.units > 0,
        currentPrice: null,
        allBuys:      [],
        executedBuys: []
      } : null;
      const { requestDecision } = await import('../services/api');
      const data = await requestDecision(selectedCrypto, 100, 'inversion', val, portfolioContext);
      const buyOps = data?.decision?.operations?.filter(o => o.type === 'BUY') ?? [];
      setOps(buyOps);
      setRecommendation(data?.decision?.recommendation ?? '');
      setCashLabel(val);
    } catch {
      setOps([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
        <h3 className="text-sm font-semibold text-slate-300">Distribución de efectivo</h3>
      </div>

      {/* Cash input */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            type="number"
            inputMode="decimal"
            placeholder="¿Cuánto efectivo tenés disponible?"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleApply()}
            className="w-full pl-8 pr-3 py-2.5 text-sm bg-slate-900/60 border border-white/[0.08] rounded-xl text-slate-200
                       placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
          />
        </div>
        <button
          onClick={handleApply}
          disabled={loading || !inputVal || parseFloat(inputVal) <= 0}
          className="px-4 py-2.5 rounded-xl bg-blue-600/80 hover:bg-blue-600 text-white text-sm font-medium
                     transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {loading ? '...' : 'Calcular'}
        </button>
      </div>

      {/* Results */}
      {ops.length > 0 && !loading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
            <span>Distribución sugerida para <span className="text-slate-300 font-semibold">{selectedCrypto}</span></span>
            <span className="tabular font-mono text-slate-400">
              Efectivo: ${cashLabel.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>
          {ops.map((op, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0
                               border border-emerald-500/30 text-emerald-400">
                {op.level}
              </span>
              <span className="text-sm text-slate-300 flex-1 truncate">{op.label}</span>
              <div className="flex items-center gap-3 shrink-0 text-right">
                {op.price && (
                  <div>
                    <p className="text-[9px] text-slate-600 mb-0.5">Precio</p>
                    <p className="text-xs font-mono text-slate-400 tabular">
                      ${op.price >= 1000
                        ? Math.round(op.price).toLocaleString('en-US')
                        : op.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
                {op.usdAmount != null && (
                  <div>
                    <p className="text-[9px] text-slate-600 mb-0.5">Monto</p>
                    <p className="text-sm font-semibold font-mono text-emerald-400 tabular">
                      ${Math.round(op.usdAmount).toLocaleString('en-US')}
                    </p>
                  </div>
                )}
                {op.percentage != null && (
                  <div>
                    <p className="text-[9px] text-slate-600 mb-0.5">% capital</p>
                    <p className="text-xs text-slate-400 tabular">{op.percentage}%</p>
                  </div>
                )}
              </div>
            </div>
          ))}
          {recommendation && (
            <p className="text-xs text-slate-500 italic pt-1 leading-relaxed">{recommendation}</p>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-4 text-slate-500 text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Calculando distribución...
        </div>
      )}

      {ops.length === 0 && !loading && (
        <p className="text-xs text-slate-600 text-center py-2">
          Ingresá tu capital disponible para ver cómo distribuirlo entre las zonas de compra.
        </p>
      )}
    </div>
  );
}

// ── Main section ───────────────────────────────────────────────────────────────

export function PortfolioSection() {
  const { portfolio, loadPortfolio, addOperation, removeOperation, cryptoData } = useAppStore();
  const { currentUser } = useAuthStore();
  const SUPPORTED_SYMBOLS = currentUser?.cryptos ?? ['BTC', 'PAXG'];
  const { operations, summary, loading } = portfolio;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [expandedOp, setExpandedOp] = useState(null);
  const [filterSymbol, setFilterSymbol] = useState('ALL');
  const [visibleCount, setVisibleCount] = useState(3);

  useEffect(() => {
    // No-op si ya hay datos cacheados (ver appStore.loadPortfolio)
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
    try {
      await removeOperation(id);
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredOps = filterSymbol === 'ALL'
    ? operations
    : operations.filter(o => o.symbol === filterSymbol);

  const visibleOps = filteredOps.slice(0, visibleCount);
  const hiddenCount = filteredOps.length - visibleOps.length;

  // Reset al cambiar de filtro
  useEffect(() => {
    setVisibleCount(3);
  }, [filterSymbol]);

  const currentPrices = {
    BTC: cryptoData.BTC?.price,
    ETH: cryptoData.ETH?.price,
    PAXG: cryptoData.PAXG?.price
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white shrink-0">Mi Portfolio</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadPortfolio({ force: true })}
            disabled={loading}
            title="Recargar desde Firestore"
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

      {/* Gráficos P&L + Velas */}
      {operations.length > 0 && (
        <PortfolioChart
          operations={operations}
          currentPrices={currentPrices}
          symbols={SUPPORTED_SYMBOLS}
        />
      )}

      {/* Resumen por símbolo — fila densa */}
      {summary.length > 0 && (
        <div className="space-y-2">
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

      {/* Distribución de efectivo — DCA sugerido */}
      <CashDistributionCard />

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
            <FormField label={`Fee / Comisión (${form.symbol})`}>
              <NumericInput value={form.fee}
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

      {/* AI Signal History stats */}
      <BacktestStats />

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

          <div className="relative">
            <div className="space-y-2">
              {visibleOps.map(op => (
                <OperationRow
                  key={op.id}
                  op={op}
                  expanded={expandedOp === op.id}
                  onToggle={() => setExpandedOp(expandedOp === op.id ? null : op.id)}
                  onDelete={() => handleDelete(op.id)}
                />
              ))}
            </div>

            {/* Fade inferior cuando hay más operaciones ocultas */}
            {hiddenCount > 0 && (
              <div
                className="absolute inset-x-0 bottom-0 h-14 pointer-events-none"
                style={{
                  background: 'linear-gradient(to bottom, transparent 0%, rgba(8, 12, 24, 0.75) 55%, rgba(8, 12, 24, 0.97) 100%)'
                }}
              />
            )}
          </div>

          {/* Paginación: ver más / ver menos */}
          {filteredOps.length > 3 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              {hiddenCount > 0 && (
                <button
                  onClick={() => setVisibleCount(c => c + 3)}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                >
                  <ChevronDown className="w-4 h-4" />
                  Ver más ({hiddenCount} restante{hiddenCount === 1 ? '' : 's'})
                </button>
              )}
              {visibleCount > 3 && (
                <button
                  onClick={() => setVisibleCount(3)}
                  className="text-sm text-gray-500 hover:text-gray-400 transition-colors flex items-center gap-1"
                >
                  <ChevronUp className="w-4 h-4" />
                  Ver menos
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function SummaryCard({ summary, currentPrice }) {
  const hasPrice     = currentPrice != null;
  const currentValue = hasPrice ? summary.units * currentPrice : null;
  const pnl          = hasPrice ? currentValue - summary.netInvested : null;
  const pnlPct       = hasPrice && summary.netInvested > 0 ? (pnl / summary.netInvested) * 100 : null;
  const isProfit     = pnl >= 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/50 border border-white/[0.05] hover:border-white/[0.1] transition-colors">
      {/* Símbolo */}
      <div className="flex flex-col shrink-0 min-w-[64px]">
        <span className="font-bold text-white text-sm leading-tight">{summary.symbol}</span>
        <span className="text-[10px] text-slate-500">{summary.operations} op.</span>
      </div>

      {/* Métricas en línea — colapsa en móvil mostrando lo crítico */}
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-xs min-w-0">
        <InlineMetric label="Unidades"  value={formatUnits(summary.units)} />
        <InlineMetric label="Invertido" value={`$${summary.netInvested.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
        {currentValue != null && (
          <InlineMetric label="Valor"   value={`$${currentValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
        )}
        {summary.avgBuyPrice > 0 && (
          <InlineMetric label="Avg. compra" value={formatPrice(summary.avgBuyPrice)} className="hidden sm:block" />
        )}
      </div>

      {/* P&L destacado a la derecha */}
      {pnl != null && (
        <div className={`shrink-0 text-right ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
          <div className="flex items-center gap-1 justify-end font-bold tabular text-sm">
            {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isProfit ? '+' : ''}{pnl.toLocaleString('en-US', { maximumFractionDigits: 0, style: 'currency', currency: 'USD' })}
          </div>
          {pnlPct != null && (
            <div className="text-[10px] opacity-70 tabular">{isProfit ? '+' : ''}{pnlPct.toFixed(1)}%</div>
          )}
        </div>
      )}
    </div>
  );
}

function InlineMetric({ label, value, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[10px] text-slate-500 truncate leading-tight">{label}</p>
      <p className="text-xs text-slate-200 font-semibold truncate tabular">{value}</p>
    </div>
  );
}

function OperationRow({ op, expanded, onToggle, onDelete }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
          {confirmingDelete ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-red-400">¿Eliminar esta operación?</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="text-xs px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                Confirmar
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false); }}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true); }}
              className="mt-3 flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar operación
            </button>
          )}
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
