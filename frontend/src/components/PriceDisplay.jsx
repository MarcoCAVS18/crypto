import { AnimatePresence, motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatPrice, formatPercent } from '../utils/formatters';

// Icon characters for each asset
const ASSET_META = {
  BTC:  { symbol: '₿', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  PAXG: { symbol: 'Au', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' }
};

export function PriceDisplay({ symbol, price, change24h }) {
  const isPositive = change24h >= 0;
  const meta = ASSET_META[symbol] ?? { symbol: symbol?.[0] ?? '?', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' };
  const ChangeIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <div className="flex flex-col items-center gap-4 py-3">
      {/* Asset identifier */}
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-full border flex items-center justify-center font-bold text-sm ${meta.bg} ${meta.color}`}>
          {meta.symbol}
        </div>
        <div className="text-left">
          <p className="text-xs text-slate-500 uppercase tracking-widest leading-none">Precio actual</p>
          <p className="text-sm font-semibold text-slate-300 tracking-wider">{symbol} / USDT</p>
        </div>
      </div>

      {/* Animated price number */}
      <div className="relative overflow-hidden">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={Math.round(price / 10)}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="text-center"
          >
            <span className="text-4xl sm:text-5xl font-bold text-white tabular tracking-tight">
              ${formatPrice(price)}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 24h change pill */}
      {change24h !== undefined && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className={`
            flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-sm font-semibold tabular
            ${isPositive
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10    border-red-500/30    text-red-400'}
          `}
        >
          <ChangeIcon className="w-3.5 h-3.5" />
          <span>{isPositive ? '+' : ''}{formatPercent(change24h)} 24h</span>
        </motion.div>
      )}
    </div>
  );
}

export default PriceDisplay;
