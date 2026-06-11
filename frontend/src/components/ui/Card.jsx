import { motion } from 'framer-motion';

const variants = {
  default:     'bg-slate-900/50 border border-white/[0.06]',
  highlighted: 'bg-slate-900/70 border border-violet-500/25 shadow-lg shadow-violet-500/[0.06]',
  buy:         'bg-emerald-950/35 border border-emerald-500/20',
  sell:        'bg-rose-950/35 border border-rose-500/20',
  neutral:     'bg-amber-950/25 border border-amber-500/20',
  flat:        'bg-slate-900/40 border border-white/[0.04]'
};

export function Card({ children, className = '', variant = 'default', hover = false, animate = false }) {
  const base = `rounded-2xl p-5 backdrop-blur-sm ${variants[variant]} ${className}`;

  if (animate || hover) {
    return (
      <motion.div
        className={base}
        initial={animate ? { opacity: 0, y: 16 } : undefined}
        animate={animate ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        whileHover={hover ? { borderColor: 'rgba(255,255,255,0.12)', y: -1 } : undefined}
      >
        {children}
      </motion.div>
    );
  }

  return <div className={base}>{children}</div>;
}

export default Card;
