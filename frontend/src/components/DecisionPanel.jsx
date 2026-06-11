import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpCircle, Clock, ArrowDownCircle, Lightbulb, ShoppingCart, TrendingDown, ArrowRight, BrainCircuit, MapPin, Settings2 } from 'lucide-react';

const ACTION = {
  BUY: {
    label: 'COMPRAR',
    sublabel: 'Señal de entrada',
    Icon: ArrowUpCircle,
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-950/40',
    glow: 'shadow-emerald-500/10',
    rowBorder: 'border-emerald-500/20',
    rowBg: 'bg-emerald-500/[0.06]',
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
  },
  WAIT: {
    label: 'ESPERAR',
    sublabel: 'Sin señal clara',
    Icon: Clock,
    color: 'text-amber-400',
    border: 'border-amber-500/25',
    bg: 'bg-amber-950/30',
    glow: 'shadow-amber-500/08',
    rowBorder: 'border-amber-500/20',
    rowBg: 'bg-amber-500/[0.05]',
    badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  },
  SELL: {
    label: 'VENDER',
    sublabel: 'Señal de salida',
    Icon: ArrowDownCircle,
    color: 'text-rose-400',
    border: 'border-rose-500/30',
    bg: 'bg-rose-950/40',
    glow: 'shadow-rose-500/10',
    rowBorder: 'border-rose-500/20',
    rowBg: 'bg-rose-500/[0.06]',
    badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30'
  }
};

const strengthDots = { fuerte: 3, moderado: 2, débil: 1 };

function calcDcaEffect(op, portfolioSummary) {
  if (!portfolioSummary?.hasPosition) return null;
  if (!portfolioSummary.avgBuyPrice || !portfolioSummary.units) return null;
  if (!op.usdAmount || !op.price) return null;

  const addedUnits  = op.usdAmount / op.price;
  const newUnits    = portfolioSummary.units + addedUnits;
  const newInvested = (portfolioSummary.netInvested ?? 0) + op.usdAmount;
  const newAvg      = newInvested / newUnits;
  const avgDelta    = newAvg - portfolioSummary.avgBuyPrice;
  const avgDeltaPct = (avgDelta / portfolioSummary.avgBuyPrice) * 100;

  return { newAvg, avgDelta, avgDeltaPct, improves: avgDelta < 0 };
}

export function DecisionPanel({ decision, portfolioSummary, compact = false, onOpenDetails }) {
  if (!decision) {
    if (compact) return null;
    return (
      <div className="bg-slate-900/40 border border-white/[0.05] rounded-2xl p-6 text-center backdrop-blur-sm">
        <Clock className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Ingresá tu estado actual para obtener una señal</p>
      </div>
    );
  }

  const { action, strength, reason, recommendation, operations = [], portfolioInsight } = decision;
  const cfg  = ACTION[action] ?? ACTION.WAIT;
  const { Icon } = cfg;
  const dots = strengthDots[strength] ?? 1;
  const buyOps  = operations.filter(o => o.type === 'BUY');
  const sellOps = operations.filter(o => o.type === 'SELL');

  // Compact mode con señal BUY/SELL pero sin operaciones específicas:
  // mostrar recomendación o prompt para configurar capital
  if (compact && buyOps.length === 0 && sellOps.length === 0) {
    if (action === 'WAIT') return null;
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={action + 'compact-rec'}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-4 backdrop-blur-sm`}
        >
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${cfg.border} shrink-0`}>
              <Icon className={`w-4.5 h-4.5 ${cfg.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              {recommendation ? (
                <>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Recomendación</span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">{recommendation}</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-300 leading-relaxed mb-2">
                    {reason}
                  </p>
                  <button
                    onClick={onOpenDetails}
                    className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Configurar capital para ver niveles exactos →
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={action + strength}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="space-y-3"
      >
        {/* Hero card — solo fuera de compact */}
        {!compact && (
          <div className={`rounded-2xl border shadow-xl ${cfg.bg} ${cfg.border} ${cfg.glow} p-5`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
                  <Icon className={`w-5 h-5 ${cfg.color}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xl font-bold tracking-widest ${cfg.color}`}>{cfg.label}</span>
                    <div className="flex items-center gap-0.5">
                      {[1,2,3].map(n => (
                        <span key={n} className={`w-1.5 h-1.5 rounded-full transition-colors ${n <= dots ? cfg.color.replace('text-','bg-') : 'bg-slate-700'}`} />
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{cfg.sublabel} · {strength}</span>
                </div>
              </div>
            </div>
            <div className="mb-4">
              <p className="text-sm text-slate-300 leading-relaxed">{reason}</p>
            </div>
            <div className="flex items-start gap-2.5 bg-slate-900/60 rounded-xl p-3.5 border border-white/[0.04]">
              <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Recomendación</span>
                <p className="text-sm text-slate-200 leading-relaxed">{recommendation}</p>
              </div>
            </div>
          </div>
        )}

        {/* Portfolio insight — solo fuera de compact */}
        {!compact && portfolioInsight?.insight && (
          <PortfolioInsightCard insight={portfolioInsight} />
        )}

        {/* BUY operations */}
        {buyOps.length > 0 && (
          <OperationGroup
            title="Órdenes de Compra"
            Icon={ShoppingCart}
            iconColor="text-emerald-400"
            ops={buyOps}
            cfg={ACTION.BUY}
            portfolioSummary={portfolioSummary}
          />
        )}

        {/* SELL operations */}
        {sellOps.length > 0 && (
          <OperationGroup
            title="Órdenes de Venta"
            Icon={TrendingDown}
            iconColor="text-rose-400"
            ops={sellOps}
            cfg={ACTION.SELL}
            portfolioSummary={null}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function PortfolioInsightCard({ insight }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, duration: 0.3 }}
      className="flex items-start gap-3 p-4 rounded-xl bg-violet-500/[0.06] border border-violet-500/20"
    >
      <BrainCircuit className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] text-violet-400/70 uppercase tracking-wider block mb-1.5">
          Análisis de tu posición
        </span>
        <p className="text-sm text-slate-300 leading-relaxed">{insight.insight}</p>
        {insight.optimalEntryPrice && (
          <div className="flex items-center gap-1.5 mt-2">
            <MapPin className="w-3 h-3 text-violet-400/60 shrink-0" />
            <span className="text-xs text-violet-400/80 font-mono tabular">
              Entrada sugerida: ${insight.optimalEntryPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function OperationGroup({ title, Icon, iconColor, ops, cfg, portfolioSummary }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.3 }}
      className={`rounded-2xl border ${cfg.border} ${cfg.bg} backdrop-blur-sm p-4`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <h3 className={`text-xs font-semibold uppercase tracking-widest ${iconColor}`}>{title}</h3>
      </div>

      <div className="space-y-2">
        {ops.map((op, i) => {
          const dca = op.type === 'BUY' ? calcDcaEffect(op, portfolioSummary) : null;
          return (
            <motion.div
              key={op.level}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.07, duration: 0.2 }}
              className={`flex flex-col gap-2 p-3 rounded-xl border ${cfg.rowBorder} ${cfg.rowBg}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 border ${cfg.rowBorder} ${cfg.color}`}>
                    {op.level}
                  </span>
                  <span className="text-sm text-slate-300 truncate">{op.label}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-7 sm:ml-0 text-right">
                  <Metric label="Precio"    value={`$${fmtOp(op.price)}`} mono />
                  {op.usdAmount != null && (
                    <Metric label="Monto"   value={`$${Math.round(op.usdAmount).toLocaleString('en-US')}`} color={cfg.color} mono />
                  )}
                  {op.units != null && (
                    <Metric label="Unidades" value={fmtUnits(op.units)} mono />
                  )}
                  <Metric label="% cap." value={`${op.percentage}%`} color={cfg.color} />
                </div>
              </div>
              {dca && <DcaPreview dca={dca} portfolioSummary={portfolioSummary} />}
            </motion.div>
          );
        })}
      </div>

      {ops.some(o => o.type === 'SELL' && o.note) && (
        <p className="text-[11px] text-slate-600 mt-2 italic">
          Registrá tu posición en el Portfolio para ver montos exactos
        </p>
      )}
    </motion.div>
  );
}

function DcaPreview({ dca, portfolioSummary }) {
  const { newAvg, avgDeltaPct, improves } = dca;
  const sign  = avgDeltaPct >= 0 ? '+' : '';
  const color = improves ? 'text-emerald-400' : 'text-amber-400';
  const bg    = improves ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-amber-500/5 border-amber-500/15';

  return (
    <div className={`ml-7 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${bg}`}>
      <span className="text-[10px] text-slate-600 uppercase tracking-wider shrink-0">Promedio tras compra</span>
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-xs text-slate-500 tabular font-mono">${fmtOp(portfolioSummary.avgBuyPrice)}</span>
        <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
        <span className={`text-xs font-semibold tabular font-mono ${color}`}>${fmtOp(newAvg)}</span>
        <span className={`text-[11px] ${color} tabular`}>({sign}{avgDeltaPct.toFixed(1)}%)</span>
      </div>
    </div>
  );
}

function Metric({ label, value, color = 'text-slate-200', mono = false }) {
  return (
    <div>
      <p className="text-[10px] text-slate-600 mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${color} ${mono ? 'tabular font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function fmtOp(price) {
  if (!price) return 'N/A';
  if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtUnits(u) {
  if (u >= 1)     return u.toFixed(4);
  if (u >= 0.001) return u.toFixed(6);
  return u.toFixed(8);
}

export default DecisionPanel;
