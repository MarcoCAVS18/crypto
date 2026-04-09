import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpCircle, Clock, ArrowDownCircle, Lightbulb, ShoppingCart, TrendingDown } from 'lucide-react';

const ACTION = {
  BUY: {
    label: 'COMPRAR',
    sublabel: 'Señal de entrada',
    Icon: ArrowUpCircle,
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-950/50',
    glow: 'shadow-emerald-500/15',
    rowBorder: 'border-emerald-500/20',
    rowBg: 'bg-emerald-500/5',
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
  },
  WAIT: {
    label: 'ESPERAR',
    sublabel: 'Sin señal clara',
    Icon: Clock,
    color: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-950/40',
    glow: 'shadow-amber-500/10',
    rowBorder: 'border-amber-500/20',
    rowBg: 'bg-amber-500/5',
    badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  },
  SELL: {
    label: 'VENDER',
    sublabel: 'Señal de salida',
    Icon: ArrowDownCircle,
    color: 'text-red-400',
    border: 'border-red-500/30',
    bg: 'bg-red-950/50',
    glow: 'shadow-red-500/15',
    rowBorder: 'border-red-500/20',
    rowBg: 'bg-red-500/5',
    badgeColor: 'bg-red-500/20 text-red-400 border-red-500/30'
  }
};

const strengthDots = { fuerte: 3, moderado: 2, débil: 1 };

export function DecisionPanel({ decision }) {
  if (!decision) {
    return (
      <div className="bg-slate-900/50 border border-white/[0.05] rounded-2xl p-6 text-center backdrop-blur-sm">
        <Clock className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Ingresa tu estado actual para obtener una señal</p>
      </div>
    );
  }

  const { action, strength, reason, recommendation, operations = [] } = decision;
  const cfg = ACTION[action] ?? ACTION.WAIT;
  const { Icon } = cfg;
  const dots = strengthDots[strength] ?? 1;
  const buyOps = operations.filter(o => o.type === 'BUY');
  const sellOps = operations.filter(o => o.type === 'SELL');

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
        {/* Hero card */}
        <div className={`rounded-2xl border shadow-xl ${cfg.bg} ${cfg.border} ${cfg.glow} p-5`}>
          {/* Action header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
                <Icon className={`w-5 h-5 ${cfg.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-bold tracking-widest ${cfg.color}`}>{cfg.label}</span>
                  {/* Strength dots */}
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

          {/* Reason */}
          <div className="mb-4">
            <p className="text-sm text-slate-300 leading-relaxed">{reason}</p>
          </div>

          {/* Recommendation */}
          <div className="flex items-start gap-2.5 bg-slate-900/60 rounded-xl p-3.5 border border-white/[0.04]">
            <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Recomendación</span>
              <p className="text-sm text-slate-200 leading-relaxed">{recommendation}</p>
            </div>
          </div>
        </div>

        {/* BUY operations */}
        {buyOps.length > 0 && (
          <OperationGroup
            title="Órdenes de Compra"
            Icon={ShoppingCart}
            iconColor="text-emerald-400"
            ops={buyOps}
            color="emerald"
            cfg={ACTION.BUY}
          />
        )}

        {/* SELL operations */}
        {sellOps.length > 0 && (
          <OperationGroup
            title="Órdenes de Venta"
            Icon={TrendingDown}
            iconColor="text-red-400"
            ops={sellOps}
            color="red"
            cfg={ACTION.SELL}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function OperationGroup({ title, Icon, iconColor, ops, cfg }) {
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
        {ops.map((op, i) => (
          <motion.div
            key={op.level}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.07, duration: 0.2 }}
            className={`flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl border ${cfg.rowBorder} ${cfg.rowBg}`}
          >
            {/* Level badge + label */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <span className={`
                w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0
                border ${cfg.rowBorder} ${cfg.color}
              `}>{op.level}</span>
              <span className="text-sm text-slate-300 truncate">{op.label}</span>
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-4 shrink-0 ml-7 sm:ml-0 text-right">
              <Metric label="Precio" value={`$${fmtOp(op.price)}`} mono />
              {op.usdAmount != null && (
                <Metric label="Monto" value={`$${Math.round(op.usdAmount).toLocaleString('en-US')}`} color={cfg.color} mono />
              )}
              {op.units != null && (
                <Metric label="Unidades" value={fmtUnits(op.units)} mono />
              )}
              <Metric label="% cap." value={`${op.percentage}%`} color={cfg.color} />
            </div>
          </motion.div>
        ))}
      </div>

      {ops.some(o => o.type === 'SELL' && o.note) && (
        <p className="text-[11px] text-slate-600 mt-2 italic">
          Registra tu posición en el Portfolio para ver montos exactos
        </p>
      )}
    </motion.div>
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
