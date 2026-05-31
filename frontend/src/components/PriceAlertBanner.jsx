import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, TrendingUp, TrendingDown } from 'lucide-react';

const STORAGE_KEY = 'crypto_dismissed_alerts';

function getDismissed() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}
function dismiss(key) {
  const d = getDismissed();
  d[key] = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}
function wasDismissedRecently(key, ttlMs = 4 * 3600 * 1000) {
  const d = getDismissed();
  return d[key] && (Date.now() - d[key]) < ttlMs;
}

export function PriceAlertBanner({ symbol, price, zones }) {
  const [alert, setAlert] = useState(null);
  const prevZoneRef = useRef(null);

  useEffect(() => {
    if (!price || !zones) return;

    const { currentZone } = zones;
    const prevZone = prevZoneRef.current;
    prevZoneRef.current = currentZone;

    // Solo disparar alerta cuando la zona cambia (no en cada render)
    if (prevZone && prevZone === currentZone) return;

    let newAlert = null;

    if (currentZone === 'buy') {
      const key = `${symbol}_buy_${Math.round(price / 100)}`;
      if (!wasDismissedRecently(key)) {
        newAlert = { key, type: 'buy', symbol, price, message: `${symbol} entró en zona de compra` };
      }
    } else if (currentZone === 'sell') {
      const key = `${symbol}_sell_${Math.round(price / 100)}`;
      if (!wasDismissedRecently(key)) {
        newAlert = { key, type: 'sell', symbol, price, message: `${symbol} entró en zona de distribución` };
      }
    }

    setAlert(newAlert);
  }, [symbol, price, zones]);

  const isBuy  = alert?.type === 'buy';
  const colors = isBuy
    ? { bg: 'bg-emerald-950/80', border: 'border-emerald-500/40', text: 'text-emerald-300', icon: 'text-emerald-400', sub: 'text-emerald-400/70', Icon: TrendingUp }
    : { bg: 'bg-red-950/80',     border: 'border-red-500/40',     text: 'text-red-300',     icon: 'text-red-400',     sub: 'text-red-400/70',     Icon: TrendingDown };

  const handleDismiss = () => {
    dismiss(alert.key);
    setAlert(null);
  };

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          key={alert.key}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="overflow-hidden mb-1"
        >
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border backdrop-blur-sm ${colors.bg} ${colors.border}`}>
            <colors.Icon className={`w-4 h-4 shrink-0 ${colors.icon}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${colors.text}`}>{alert.message}</p>
              <p className={`text-xs mt-0.5 ${colors.sub}`}>
                Precio actual: ${alert.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                {isBuy ? ' · Oportunidad de acumulación' : ' · Evaluar toma de ganancias'}
              </p>
            </div>
            <Bell className={`w-3.5 h-3.5 shrink-0 ${colors.icon} opacity-60`} />
            <button
              onClick={handleDismiss}
              className={`w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/[0.08] transition-colors ${colors.sub}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PriceAlertBanner;
