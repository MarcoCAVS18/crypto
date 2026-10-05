// Próximos eventos macro (FOMC, CPI, empleo, PCE) desde la API; se refresca cada 30 min.
import { useEffect, useState } from 'react';
import { fetchUpcomingEvents } from '../services/api';

export function useUpcomingEvents(symbol, days = 21) {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetchUpcomingEvents(days, symbol)
      .then(d => { if (!cancelled) setEvents(d.events ?? []); })
      .catch(() => { if (!cancelled) setEvents([]); });
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [symbol, days]);
  return events;
}

/** "Hoy", "Mañana" o "14 oct" */
export function eventDay(ev) {
  if (ev.phase === 'released' || ev.daysUntil === 0) return 'Hoy';
  if (ev.daysUntil === 1) return 'Mañana';
  return new Date(ev.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
