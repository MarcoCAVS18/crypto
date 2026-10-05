// Pantalla Portfolio: cuánto tenés y cómo viene (arriba), dónde está repartido, cómo evolucionó, tu actividad,
// cómo te fue con las señales y el detalle de cada operación. Se agrega una operación desde un botón, en una hoja.
import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, ChevronDown, Trash2, AlertCircle, Calculator, ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useAuthStore } from '../store/authStore';
import { fetchCryptoData } from '../services/api';
import { Panel } from './ui/Panel';
import { Section } from './ui/Section';
import { Rows } from './ui/Row';
import { Delta } from './ui/Delta';
import { PillTabs } from './ui/PillTabs';
import { DonutChart } from './ui/DonutChart';
import { DotGrid } from './ui/DotGrid';
import { InView } from './ui/InView';
import { PortfolioEvolution } from './PortfolioEvolution';
import { SignalResults } from './SignalResults';
import { OperationSheet } from './OperationSheet';
import { CashSplitSheet } from './CashSplitSheet';
import { portfolioTotals, activityCells, fmtCompact, suspiciousOps } from '../utils/portfolioView';
import { operationIssues } from '../utils/opChecks';
import { entityColor } from '../utils/chartColors';
import { assetName, assetTab, fmtPrice, fmtUnits } from '../utils/signalView';

const money = (v, d = 0) => `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const signed = (v) => `${v >= 0 ? '+' : '-'}${money(v)}`;
const shortDay = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

function Position({ p, i, onReview }) {
  const up = (p.pnl ?? 0) >= 0;
  return (
    <div className="py-3.5">
    <div className="flex items-center gap-4">
      <span className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: entityColor(p.symbol, i) }}>{assetTab(p.symbol).slice(0, 4)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink truncate">{assetName(p.symbol)}</p>
        <p className="text-xs text-muted num truncate">{fmtUnits(p.units)} · promedio {p.avg ? fmtPrice(p.avg) : '—'}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-ink num">{p.value != null ? money(p.value) : 'Sin precio'}</p>
        {p.pnl != null && <p className={`text-xs font-semibold num ${p.suspect ? 'text-warn' : up ? 'text-accent' : 'text-pink'}`}>{signed(p.pnl)} · {up ? '+' : ''}{p.pnlPct.toFixed(1)} %</p>}
      </div>
    </div>
    {p.suspect && (
      <div className="mt-3 rounded-2xl bg-warn/10 px-4 py-3 text-xs text-warn leading-relaxed">
        Tu promedio ({fmtPrice(p.avg)}) está muy lejos del precio actual ({fmtPrice(p.price)}): si no compraste hace años, hay una operación con el precio mal cargado y este P&L no es real.{' '}
        <button onClick={() => onReview(p.symbol)} className="font-bold underline">Revisar operaciones</button>
      </div>
    )}
    </div>
  );
}

function OperationItem({ op, expanded, onToggle, onDelete, onEdit, suspect }) {
  const [confirming, setConfirming] = useState(false);
  const buy = op.type === 'BUY';
  const bad = operationIssues(op).length > 0;
  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center gap-4 py-3.5 text-left">
        <span className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${buy ? 'bg-accent/15 text-accent' : 'bg-pink/15 text-pink'}`}>
          {buy ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{buy ? 'Compra' : 'Venta'} {assetTab(op.symbol)}{(bad || suspect) && <span className="ml-2 text-xs font-medium text-warn">{bad ? 'no cuadra' : 'precio raro'}</span>}</p>
          <p className="text-xs text-muted num truncate">{shortDay(op.date)} · {fmtUnits(parseFloat(op.units))} @ {fmtPrice(parseFloat(op.price))}</p>
        </div>
        <p className={`text-sm font-bold num shrink-0 ${buy ? 'text-ink' : 'text-pink'}`}>{buy ? '' : '+'}{money(parseFloat(op.amount_usd))}</p>
        <ChevronDown className={`w-4 h-4 text-faint shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="pb-4 pl-[60px] space-y-3 text-xs text-muted">
          <p>{[op.exchange || 'Manual', op.fee > 0 ? `comisión ${op.fee}` : 'sin comisión', op.notes].filter(Boolean).join(' · ')}</p>
          {bad && <p className="text-warn leading-relaxed">El monto no coincide con unidades × precio: deforma tu promedio y el P&L. Si es un error, eliminala.</p>}
          {suspect && !bad && <p className="text-warn leading-relaxed">El precio está a más de 5× del precio actual del activo. Si no es una compra de hace años, es un error de carga: eliminala y volvé a cargarla.</p>}
          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-pink">¿Eliminar?</span>
              <button onClick={onDelete} className="px-3.5 py-1.5 rounded-full bg-pink text-bg font-semibold">Sí, eliminar</button>
              <button onClick={() => setConfirming(false)} className="px-3.5 py-1.5 rounded-full bg-panel-2 text-ink">Cancelar</button>
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <button onClick={onEdit} className="flex items-center gap-1.5 font-semibold text-accent"><Pencil className="w-3.5 h-3.5" />Editar</button>
              <button onClick={() => setConfirming(true)} className="flex items-center gap-1.5 text-pink/80 hover:text-pink"><Trash2 className="w-3.5 h-3.5" />Eliminar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PortfolioSection() {
  const { portfolio, removeOperation, cryptoData } = useAppStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const symbols = currentUser?.cryptos?.filter(s => s !== 'XAUUSDT') ?? ['BTC', 'PAXG'];
  const { operations, summary, loading } = portfolio;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);       // operación que se está corrigiendo (null = alta nueva)
  const [splitOpen, setSplitOpen] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [visible, setVisible] = useState(5);
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState(null);

  // Precios de todo lo que tenés: el store solo trae el activo abierto en Inicio, así que el resto se pide acá.
  const [extra, setExtra] = useState({});
  const held = summary.filter(s => s.units > 1e-9).map(s => s.symbol).join(',');
  useEffect(() => {
    let off = false;
    held.split(',').filter(sym => sym && !cryptoData[sym]?.price && !extra[sym]).forEach(sym => {
      fetchCryptoData(sym).then(d => { if (!off && Number.isFinite(d?.price)) setExtra(e => ({ ...e, [sym]: d.price })); }).catch(() => {});
    });
    return () => { off = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held]);
  const prices = useMemo(() => ({ ...extra, ...Object.fromEntries(Object.entries(cryptoData).filter(([, v]) => v?.price).map(([k, v]) => [k, v.price])) }), [cryptoData, extra]);
  const totals = useMemo(() => portfolioTotals(summary, prices), [summary, prices]);
  const activity = useMemo(() => activityCells(operations), [operations]);
  const bad = operations.filter(o => operationIssues(o).length > 0);
  const odd = useMemo(() => suspiciousOps(operations, prices), [operations, prices]);
  const review = (symbol) => { setFilter(symbol); setVisible(50); document.getElementById('operaciones')?.scrollIntoView({ behavior: 'smooth' }); };
  const shown = operations.filter(o => filter === 'ALL' || o.symbol === filter);
  const slice = shown.slice(0, visible);
  const up = (totals.pnl ?? 0) >= 0;

  const remove = async (id) => { try { await removeOperation(id); setExpanded(null); } catch (e) { setError(e.message); } };

  if (operations.length === 0 && !loading) {
    return (
      <div className="space-y-6">
        <Panel className="text-center py-14 space-y-4">
          <span className="mx-auto w-14 h-14 rounded-full bg-accent/15 text-accent flex items-center justify-center"><Wallet className="w-6 h-6" /></span>
          <div><p className="text-lg font-bold text-ink">Todavía no cargaste operaciones</p><p className="text-sm text-muted mt-1">Cargá tu primera compra o venta y acá vas a ver cuánto tenés y cómo viene.</p></div>
          <button onClick={() => { setEditing(null); setFormOpen(true); }} className="px-6 py-3.5 rounded-full bg-accent text-accent-ink font-bold glow-accent">Agregar operación</button>
        </Panel>
        <OperationSheet key={editing?.id ?? 'new'} open={formOpen} onClose={() => setFormOpen(false)} symbols={symbols} editing={editing} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Balance */}
      <section>
        <p className="text-sm text-muted">Tus posiciones valen</p>
        <div className="flex items-end justify-between gap-3 mt-1">
          <p className="text-[48px] leading-none font-bold text-ink tracking-tight">{totals.value != null ? money(totals.value) : '—'}</p>
          <button onClick={() => { setEditing(null); setFormOpen(true); }} aria-label="Agregar operación" className="w-14 h-14 rounded-full bg-accent text-accent-ink flex items-center justify-center glow-accent shrink-0"><Plus className="w-6 h-6" /></button>
        </div>
        {totals.pnl != null && (
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <Delta value={totals.pnlPct} />
            <span className={`text-sm font-semibold num ${up ? 'text-accent' : 'text-pink'}`}>{signed(totals.pnl)}</span>
            <span className="text-sm text-muted">sobre {money(totals.invested)} invertidos</span>
          </div>
        )}
        {totals.positions.some(p => p.suspect) && <p className="text-xs text-warn mt-2">Hay una posición con datos dudosos: el total y el P&L de arriba no son confiables hasta corregirla.</p>}
        {totals.unpriced > 0 && <p className="text-xs text-warn mt-2">Falta el precio de {totals.unpriced} activo{totals.unpriced === 1 ? '' : 's'}: no se suma al total. Actualizá para reintentar.</p>}
        {totals.realized !== 0 && <p className="text-xs text-muted mt-2">Ganancia ya realizada con ventas: <span className="num font-semibold text-ink">{signed(totals.realized)}</span></p>}
      </section>

      {error && <div className="flex items-start gap-2 text-pink text-sm p-3.5 bg-pink/10 rounded-2xl"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}

      {/* Distribución + posiciones */}
      {totals.positions.length > 0 && (
        <Section title="Distribución">
          <Panel className="space-y-2">
            {totals.value != null && totals.positions.length > 0 && (
              <InView minHeight={190} className="flex items-center justify-center gap-6 py-2 flex-wrap">
                <DonutChart size={168} thickness={22} top="Total" bottom={fmtCompact(totals.value)}
                  segments={totals.positions.filter(p => p.value != null).map((p, i) => ({ label: p.symbol, value: p.value, color: entityColor(p.symbol, i) }))} />
                <ul className="space-y-2.5 min-w-[130px]">
                  {totals.positions.filter(p => p.value != null).map((p, i) => (
                    <li key={p.symbol} className="flex items-center gap-2.5 text-sm">
                      <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entityColor(p.symbol, i) }} />
                      <span className="text-muted flex-1">{assetTab(p.symbol)}</span>
                      <b className="text-ink num">{p.share.toFixed(0)} %</b>
                    </li>
                  ))}
                </ul>
              </InView>
            )}
            <Rows>{totals.positions.map((p, i) => <Position key={p.symbol} p={p} i={i} onReview={review} />)}</Rows>
          </Panel>
        </Section>
      )}

      <Section title="Evolución"><Panel><InView minHeight={230}><PortfolioEvolution operations={operations} prices={prices} /></InView></Panel></Section>

      <Section title="Tu actividad">
        <Panel className="space-y-3">
          <InView minHeight={140}><DotGrid cells={activity} weeks={12} /></InView>
          <p className="flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-accent" />Compra</span>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-pink" />Venta</span>
            <span className="ml-auto">últimas 12 semanas</span>
          </p>
        </Panel>
      </Section>

      <SignalResults symbols={symbols} />

      {/* Operaciones */}
      <Section id="operaciones" title="Operaciones" action={<button onClick={() => setSplitOpen(true)} className="flex items-center gap-1.5 text-xs font-semibold text-accent"><Calculator className="w-3.5 h-3.5" />Repartir USDT</button>}>
        {bad.length > 0 && (
          <div className="flex items-start gap-2.5 p-3.5 mb-3 rounded-2xl bg-warn/10 text-warn text-xs leading-relaxed">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{bad.length === 1 ? 'Hay 1 operación' : `Hay ${bad.length} operaciones`} con datos que no cuadran ({bad.slice(0, 3).map(o => `${o.symbol} ${o.date}`).join(', ')}{bad.length > 3 ? '…' : ''}). Deforman el promedio y el P&L: abrila y eliminala si es un error.</span>
          </div>
        )}
        {symbols.length > 1 && <div className="mb-3"><PillTabs options={[{ id: 'ALL', label: 'Todas' }, ...symbols.map(s => ({ id: s, label: assetTab(s) }))]} value={filter} onChange={(f) => { setFilter(f); setVisible(5); }} size="sm" layoutId="ops-filter" /></div>}
        <Panel className="!py-1">
          <Rows>{slice.map(op => <OperationItem key={op.id} op={op} expanded={expanded === op.id} onToggle={() => setExpanded(expanded === op.id ? null : op.id)} onDelete={() => remove(op.id)} onEdit={() => { setEditing(op); setFormOpen(true); }} suspect={odd.has(op.id)} />)}</Rows>
          {shown.length === 0 && <p className="text-sm text-muted py-6 text-center">No hay operaciones de este activo.</p>}
        </Panel>
        {shown.length > visible && <button onClick={() => setVisible(v => v + 5)} className="mt-3 w-full py-3 rounded-full bg-panel border border-line text-sm font-semibold text-ink">Ver {Math.min(5, shown.length - visible)} más</button>}
      </Section>

      <OperationSheet key={editing?.id ?? 'new'} open={formOpen} onClose={() => setFormOpen(false)} symbols={symbols} editing={editing} />
      <CashSplitSheet open={splitOpen} onClose={() => setSplitOpen(false)} />
    </div>
  );
}

export default PortfolioSection;
