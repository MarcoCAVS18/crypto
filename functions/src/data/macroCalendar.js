// Calendario de eventos macroeconómicos de alto impacto.
// Fuente: BLS, Fed, CME — fechas reales publicadas con anticipación.
// Se mantiene en el backend para que el motor de decisión pueda consultarlo.

export const MACRO_EVENTS = [
  // ── Abril 2026 ───────────────────────────────────────────────
  { date: '2026-04-29', name: 'FOMC', fullName: 'Decisión de tasas Fed', impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-04-30', name: 'PCE',  fullName: 'PCE marzo (inflación Fed)',  impact: 'high',     assets: ['PAXG'] },

  // ── Mayo 2026 ────────────────────────────────────────────────
  { date: '2026-05-01', name: 'NFP',  fullName: 'Nóminas no agrícolas abril',        impact: 'high',     assets: ['BTC', 'PAXG'] },
  { date: '2026-05-12', name: 'CPI',  fullName: 'IPC abril (inflación EE.UU.)',       impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-05-29', name: 'PCE',  fullName: 'PCE abril (inflación Fed)',           impact: 'high',     assets: ['PAXG'] },

  // ── Junio 2026 ───────────────────────────────────────────────
  { date: '2026-06-05', name: 'NFP',  fullName: 'Nóminas no agrícolas mayo',          impact: 'high',     assets: ['BTC', 'PAXG'] },
  { date: '2026-06-10', name: 'FOMC', fullName: 'Decisión de tasas Fed',              impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-06-11', name: 'CPI',  fullName: 'IPC mayo (inflación EE.UU.)',        impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-06-26', name: 'PCE',  fullName: 'PCE mayo (inflación Fed)',            impact: 'high',     assets: ['PAXG'] },

  // ── Julio 2026 ───────────────────────────────────────────────
  { date: '2026-07-03', name: 'NFP',  fullName: 'Nóminas no agrícolas junio',         impact: 'high',     assets: ['BTC', 'PAXG'] },
  { date: '2026-07-14', name: 'CPI',  fullName: 'IPC junio (inflación EE.UU.)',       impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-07-29', name: 'FOMC', fullName: 'Decisión de tasas Fed + GDP Q2',     impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-07-31', name: 'PCE',  fullName: 'PCE junio (inflación Fed)',           impact: 'high',     assets: ['PAXG'] },

  // ── Agosto 2026 ──────────────────────────────────────────────
  { date: '2026-08-07', name: 'NFP',  fullName: 'Nóminas no agrícolas julio',         impact: 'high',     assets: ['BTC', 'PAXG'] },
  { date: '2026-08-12', name: 'CPI',  fullName: 'IPC julio (inflación EE.UU.)',       impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-08-28', name: 'PCE',  fullName: 'PCE julio (inflación Fed)',           impact: 'high',     assets: ['PAXG'] },

  // ── Septiembre 2026 ──────────────────────────────────────────
  { date: '2026-09-04', name: 'NFP',  fullName: 'Nóminas no agrícolas agosto',        impact: 'high',     assets: ['BTC', 'PAXG'] },
  { date: '2026-09-10', name: 'CPI',  fullName: 'IPC agosto (inflación EE.UU.)',      impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-09-16', name: 'FOMC', fullName: 'Decisión de tasas Fed',              impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-09-25', name: 'PCE',  fullName: 'PCE agosto (inflación Fed)',          impact: 'high',     assets: ['PAXG'] },

  // ── Octubre 2026 ─────────────────────────────────────────────
  { date: '2026-10-02', name: 'NFP',  fullName: 'Nóminas no agrícolas septiembre',    impact: 'high',     assets: ['BTC', 'PAXG'] },
  { date: '2026-10-13', name: 'CPI',  fullName: 'IPC septiembre (inflación EE.UU.)', impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-10-28', name: 'FOMC', fullName: 'Decisión de tasas Fed',              impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-10-30', name: 'PCE',  fullName: 'PCE septiembre (inflación Fed)',      impact: 'high',     assets: ['PAXG'] },

  // ── Noviembre 2026 ───────────────────────────────────────────
  { date: '2026-11-06', name: 'NFP',  fullName: 'Nóminas no agrícolas octubre',       impact: 'high',     assets: ['BTC', 'PAXG'] },
  { date: '2026-11-12', name: 'CPI',  fullName: 'IPC octubre (inflación EE.UU.)',     impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-11-25', name: 'PCE',  fullName: 'PCE octubre (inflación Fed)',         impact: 'high',     assets: ['PAXG'] },

  // ── Diciembre 2026 ───────────────────────────────────────────
  { date: '2026-12-04', name: 'NFP',  fullName: 'Nóminas no agrícolas noviembre',     impact: 'high',     assets: ['BTC', 'PAXG'] },
  { date: '2026-12-09', name: 'FOMC', fullName: 'Decisión de tasas Fed',              impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-12-10', name: 'CPI',  fullName: 'IPC noviembre (inflación EE.UU.)',   impact: 'critical', assets: ['BTC', 'PAXG'] },
  { date: '2026-12-18', name: 'PCE',  fullName: 'PCE noviembre (inflación Fed)',       impact: 'high',     assets: ['PAXG'] },
];

/**
 * Devuelve eventos relevantes para un activo dentro de los próximos N días,
 * enriquecidos con `daysUntil`.
 */
export function getUpcomingEvents(daysAhead = 7, asset = null) {
  const now  = Date.now();
  const edge = now + daysAhead * 24 * 3600 * 1000;

  return MACRO_EVENTS
    .filter(e => {
      const t = new Date(e.date).getTime();
      if (t < now || t > edge) return false;
      return asset ? e.assets.includes(asset) : true;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(e => ({
      ...e,
      daysUntil: Math.ceil((new Date(e.date).getTime() - now) / (24 * 3600 * 1000))
    }));
}
