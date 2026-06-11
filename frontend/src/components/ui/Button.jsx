import { motion } from 'framer-motion';

const variants = {
  primary:   'bg-violet-600 hover:bg-violet-500 text-white border border-violet-500/50 shadow-lg shadow-violet-500/20',
  secondary: 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-white/[0.08]',
  ghost:     'bg-transparent hover:bg-white/[0.06] text-slate-300 border border-transparent',
  danger:    'bg-rose-600/90 hover:bg-rose-500 text-white border border-rose-500/50 shadow-lg shadow-rose-500/20',
  success:   'bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-500/50 shadow-lg shadow-emerald-500/20'
};

export function Button({ children, onClick, variant = 'primary', disabled = false, className = '', type = 'button' }) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.01 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      transition={{ duration: 0.1 }}
      className={`
        px-4 py-2.5 rounded-xl font-medium text-sm transition-colors
        focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:ring-offset-1 focus:ring-offset-slate-950
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variants[variant]} ${className}
      `}
    >
      {children}
    </motion.button>
  );
}

export default Button;
