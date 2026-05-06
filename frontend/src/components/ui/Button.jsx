import { motion } from 'framer-motion';

const variants = {
  primary:   'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/50 shadow-lg shadow-blue-500/20',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/[0.08]',
  ghost:     'bg-transparent hover:bg-white/[0.06] text-slate-300 border border-transparent',
  danger:    'bg-red-600/90 hover:bg-red-500 text-white border border-red-500/50 shadow-lg shadow-red-500/20',
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
        focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-1 focus:ring-offset-slate-950
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variants[variant]} ${className}
      `}
    >
      {children}
    </motion.button>
  );
}

export default Button;
