import { motion } from 'framer-motion';
import { formatPrice } from '../utils/formatters';

const ZONE_CFG = {
  buy:     { label: 'Acumulación', color: 'text-emerald-400', bg: 'bg-emerald-500/25', dotBg: 'bg-emerald-400' },
  neutral: { label: 'Neutral',     color: 'text-amber-400',   bg: 'bg-amber-500/25',   dotBg: 'bg-amber-400'   },
  sell:    { label: 'Distribución', color: 'text-red-400',    bg: 'bg-red-500/25',     dotBg: 'bg-red-400'     }
};

export function ZoneMap({ zones, currentPrice }) {
  const totalRange = zones.sell.max - zones.buy.min;
  const pricePosition = ((currentPrice - zones.buy.min) / totalRange) * 100;
  const clampedPos = Math.max(1, Math.min(99, pricePosition));

  const buyWidth     = ((zones.buy.max     - zones.buy.min)     / totalRange) * 100;
  const neutralWidth = ((zones.neutral.max - zones.neutral.min) / totalRange) * 100;
  const sellWidth    = ((zones.sell.max    - zones.sell.min)    / totalRange) * 100;

  const zoneCfg = ZONE_CFG[zones.currentZone] ?? ZONE_CFG.neutral;

  return (
    <div className="w-full space-y-4">
      {/* Current zone label */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 uppercase tracking-widest">Posición en rango</span>
        <div className={`flex items-center gap-1.5 text-sm font-semibold ${zoneCfg.color}`}>
          <span className={`w-2 h-2 rounded-full ${zoneCfg.dotBg}`} />
          {zoneCfg.label}
        </div>
      </div>

      {/* Zone bar */}
      <div className="relative">
        {/* Price label above indicator */}
        <motion.div
          className="absolute -top-7 z-10"
          animate={{ left: `${clampedPos}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          style={{ translateX: '-50%' }}
        >
          <div className="bg-white text-slate-900 text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap shadow-lg">
            ${formatPrice(currentPrice)}
          </div>
          <div className="w-px h-2 bg-white/70 mx-auto" />
        </motion.div>

        {/* Bar */}
        <div className="relative h-8 rounded-xl overflow-hidden flex">
          <div className="bg-emerald-500/30 border-r border-slate-800 flex items-center justify-center"
            style={{ width: `${buyWidth}%` }}>
            <span className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wide">Compra</span>
          </div>
          <div className="bg-amber-500/25 border-r border-slate-800 flex items-center justify-center"
            style={{ width: `${neutralWidth}%` }}>
            <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wide">Neutral</span>
          </div>
          <div className="bg-red-500/25 flex items-center justify-center"
            style={{ width: `${sellWidth}%` }}>
            <span className="text-[10px] font-semibold text-red-300 uppercase tracking-wide">Venta</span>
          </div>

          {/* Position indicator line */}
          <motion.div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
            animate={{ left: `${clampedPos}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>

        {/* Price range labels */}
        <div className="flex justify-between mt-2 text-[10px] text-slate-600 tabular px-0.5">
          <span>${formatPrice(zones.buy.min)}</span>
          <span className="hidden sm:block">${formatPrice(zones.buy.max)}</span>
          <span className="hidden sm:block">${formatPrice(zones.sell.min)}</span>
          <span>${formatPrice(zones.sell.max)}</span>
        </div>
      </div>

      {/* Zone reasoning */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        <div className="flex items-start gap-2 text-xs">
          <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span className="text-slate-400">{zones.buy.reason}</span>
        </div>
        <div className="flex items-start gap-2 text-xs">
          <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
          <span className="text-slate-400">{zones.sell.reason}</span>
        </div>
      </div>
    </div>
  );
}

export default ZoneMap;
