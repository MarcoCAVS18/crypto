import { motion } from 'framer-motion';

const variants = {
  primary:   'bg-accent text-accent-ink font-semibold hover:brightness-110',
  success:   'bg-accent text-accent-ink font-semibold hover:brightness-110',
  secondary: 'bg-panel-2 text-ink border border-line hover:bg-slate-800',
  ghost:     'bg-transparent text-muted hover:text-ink',
  danger:    'bg-pink/15 text-pink border border-pink/30 hover:bg-pink/25'
};

export function Button({ children, onClick, variant = 'primary', disabled = false, className = '', type = 'button' }) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? {} : { scale: 0.97 }}
      transition={{ duration: 0.1 }}
      className={`px-5 py-3 rounded-full text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60
        disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant] ?? variants.primary} ${className}`}
    >
      {children}
    </motion.button>
  );
}

export default Button;
