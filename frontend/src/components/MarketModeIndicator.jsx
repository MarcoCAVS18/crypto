import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const MODE = {
  risk_on: {
    label: 'Risk On',
    sublabel: 'Entorno favorable',
    Icon: TrendingUp,
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/40',
    bgColor: 'bg-emerald-500/10',
    glowColor: 'shadow-emerald-500/20',
    dotColor: 'bg-emerald-400',
    ringColor: 'text-emerald-500'
  },
  neutral: {
    label: 'Neutral',
    sublabel: 'Contexto mixto',
    Icon: Minus,
    textColor: 'text-amber-400',
    borderColor: 'border-amber-500/40',
    bgColor: 'bg-amber-500/10',
    glowColor: 'shadow-amber-500/20',
    dotColor: 'bg-amber-400',
    ringColor: 'text-amber-500'
  },
  risk_off: {
    label: 'Risk Off',
    sublabel: 'Precaución',
    Icon: TrendingDown,
    textColor: 'text-red-400',
    borderColor: 'border-red-500/40',
    bgColor: 'bg-red-500/10',
    glowColor: 'shadow-red-500/20',
    dotColor: 'bg-red-400',
    ringColor: 'text-red-500'
  }
};

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } }
};
const item = {
  hidden: { opacity: 0, x: -6 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.25 } }
};

export function MarketModeIndicator({ mode, reasons = [] }) {
  const cfg = MODE[mode] ?? MODE.neutral;
  const { Icon } = cfg;
  const isRiskOn = mode === 'risk_on';

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      {/* Mode badge */}
      <motion.div
        key={mode}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative"
      >
        {/* Pulsing ring for risk_on */}
        {isRiskOn && (
          <motion.div
            className={`absolute inset-0 rounded-2xl border-2 border-emerald-500/50`}
            animate={{ scale: [1, 1.15], opacity: [0.5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
          />
        )}

        <div className={`
          flex items-center gap-3 px-6 py-3 rounded-2xl border shadow-lg
          ${cfg.bgColor} ${cfg.borderColor} ${cfg.glowColor}
        `}>
          <div className="relative">
            <div className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
            {isRiskOn && (
              <motion.div
                className={`absolute inset-0 w-2 h-2 rounded-full ${cfg.dotColor}`}
                animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </div>

          <div className="flex flex-col items-start">
            <span className={`text-lg font-bold tracking-wide ${cfg.textColor}`}>{cfg.label}</span>
            <span className="text-xs text-slate-500">{cfg.sublabel}</span>
          </div>

          <Icon className={`w-5 h-5 ${cfg.textColor} ml-1`} />
        </div>
      </motion.div>

      {/* Reasons list */}
      {reasons.length > 0 && (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="w-full space-y-1.5"
        >
          {reasons.slice(0, 5).map((reason, i) => (
            <motion.div key={i} variants={item}
              className="flex items-start gap-2 text-xs text-slate-400 leading-relaxed"
            >
              <span className={`mt-1 w-1 h-1 rounded-full shrink-0 ${cfg.dotColor} opacity-70`} />
              <span>{reason}</span>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

export default MarketModeIndicator;
