// Aviso de zona (compra/distribución) en la campana: se dispara solo cuando la zona CAMBIA y se puede descartar por 4 h.
// Es un dato del precio, no una orden: la que decide si toca comprar es la señal (y el push sale de la señal, no de la zona). (Antes vivía dentro de PriceAlertBanner, que ocupaba una card entera.)
import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'crypto_dismissed_alerts';
const TTL_MS = 4 * 3600 * 1000;

function getDismissed() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}
const wasDismissedRecently = (key) => { const d = getDismissed()[key]; return !!d && Date.now() - d < TTL_MS; };

export function useZoneAlert(symbol, price, zones) {
  const [alert, setAlert] = useState(null);
  const prevZoneRef = useRef(null);

  useEffect(() => {
    if (!price || !zones) return;
    const { currentZone } = zones;
    const prevZone = prevZoneRef.current;
    prevZoneRef.current = currentZone;
    if (prevZone && prevZone === currentZone) return;     // solo cuando la zona cambia

    let next = null;
    if (currentZone === 'buy' || currentZone === 'sell') {
      const key = `${symbol}_${currentZone}_${Math.round(price / 100)}`;
      if (!wasDismissedRecently(key)) {
        next = { key, type: currentZone, symbol, price,
          message: currentZone === 'buy' ? `${symbol} entró en zona de compra` : `${symbol} entró en zona de distribución`,
          hint: 'La señal decide si toca operar' };
      }
    }
    setAlert(next);
  }, [symbol, price, zones]);

  const dismiss = useCallback(() => {
    setAlert(current => {
      if (current) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...getDismissed(), [current.key]: Date.now() })); } catch { /* sin storage */ }
      }
      return null;
    });
  }, []);

  return { alert, dismiss };
}
