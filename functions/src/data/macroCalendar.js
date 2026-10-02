// Calendario de eventos macroeconómicos de alto impacto (fuente única de verdad).
//
// - Las fechas son las de PUBLICACIÓN oficial (BLS, BEA, Fed) y las horas son de Nueva York (ET):
//   NFP/CPI/PCE 08:30 ET, decisión FOMC 14:00 ET. El instante real se calcula con DST de EE.UU.
// - `verified: true` = contrastada con la fuente oficial (ver docs/PAXG_AUDIT.md §8).
//   `verified: false` = fecha estimada, por confirmar. Se muestra igual pero marcada.
// - El frontend NO tiene copia: consume GET /api/calendar.
// - TODO (P1/P3): generar desde FRED `release/dates` + calendario de la Fed.

export const MACRO_EVENTS = [
  // ── Septiembre 2026 ──────────────────────────────────────────
  { date: '2026-09-04', name: 'NFP',  fullName: 'Nóminas no agrícolas agosto',        impact: 'high',     assets: ['BTC', 'PAXG'], verified: true  },
  { date: '2026-09-11', name: 'CPI',  fullName: 'IPC agosto (inflación EE.UU.)',      impact: 'critical', assets: ['BTC', 'PAXG'], verified: true  },
  { date: '2026-09-16', name: 'FOMC', fullName: 'Decisión de tasas Fed',              impact: 'critical', assets: ['BTC', 'PAXG'], verified: true  },
  { date: '2026-09-30', name: 'PCE',  fullName: 'PCE agosto (inflación Fed)',         impact: 'high',     assets: ['PAXG'],        verified: true  },

  // ── Octubre 2026 ─────────────────────────────────────────────
  { date: '2026-10-02', name: 'NFP',  fullName: 'Nóminas no agrícolas septiembre',    impact: 'high',     assets: ['BTC', 'PAXG'], verified: true  },
  { date: '2026-10-14', name: 'CPI',  fullName: 'IPC septiembre (inflación EE.UU.)',  impact: 'critical', assets: ['BTC', 'PAXG'], verified: true  },
  { date: '2026-10-28', name: 'FOMC', fullName: 'Decisión de tasas Fed',              impact: 'critical', assets: ['BTC', 'PAXG'], verified: true  },
  { date: '2026-10-29', name: 'PCE',  fullName: 'PCE septiembre (inflación Fed)',     impact: 'high',     assets: ['PAXG'],        verified: true  },

  // ── Noviembre 2026 ───────────────────────────────────────────
  { date: '2026-11-06', name: 'NFP',  fullName: 'Nóminas no agrícolas octubre',       impact: 'high',     assets: ['BTC', 'PAXG'], verified: true  },
  { date: '2026-11-10', name: 'CPI',  fullName: 'IPC octubre (inflación EE.UU.)',     impact: 'critical', assets: ['BTC', 'PAXG'], verified: true  },
  { date: '2026-11-25', name: 'PCE',  fullName: 'PCE octubre (inflación Fed)',        impact: 'high',     assets: ['PAXG'],        verified: true  },

  // ── Diciembre 2026 ───────────────────────────────────────────
  { date: '2026-12-04', name: 'NFP',  fullName: 'Nóminas no agrícolas noviembre',     impact: 'high',     assets: ['BTC', 'PAXG'], verified: true  },
  { date: '2026-12-09', name: 'FOMC', fullName: 'Decisión de tasas Fed',              impact: 'critical', assets: ['BTC', 'PAXG'], verified: true  },
  { date: '2026-12-10', name: 'CPI',  fullName: 'IPC noviembre (inflación EE.UU.)',   impact: 'critical', assets: ['BTC', 'PAXG'], verified: true  },
  { date: '2026-12-23', name: 'PCE',  fullName: 'PCE noviembre (inflación Fed)',      impact: 'high',     assets: ['PAXG'],        verified: true  },
];

const IMPACT_NOTE = {
  FOMC: 'Alta volatilidad esperada. Considerar esperar la decisión antes de operar.',
  CPI:  'Dato clave de inflación. Mueve fuertemente al oro y cripto.',
  PCE:  'Indicador de inflación favorito de la Fed. Relevante especialmente para el oro.',
  NFP:  'Dato de empleo: influye en las expectativas de tasas y el dólar.',
};

// Hora local de Nueva York de cada publicación
const RELEASE_TIME_ET = { FOMC: '14:00', CPI: '08:30', NFP: '08:30', PCE: '08:30' };
const DEFAULT_TIME_ET = '08:30';

const TZ = 'America/New_York';
const HOUR_MS = 3600 * 1000;
const DAY_MS  = 24 * HOUR_MS;

// Después de la publicación el evento sigue "vivo": la volatilidad persiste unas horas.
export const POST_EVENT_WINDOW_MS = 6 * HOUR_MS;

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit'
});
const dateKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }); // YYYY-MM-DD

// Diferencia (ms) entre la hora "de pared" de Nueva York y UTC en el instante dado
function tzOffsetMs(utcMs) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
}

/**
 * Instante UTC (ms) de una fecha YYYY-MM-DD y hora HH:MM de Nueva York, con DST.
 * Ej.: FOMC 2026-09-16 14:00 ET (EDT, UTC−4) = 18:00 UTC; 2026-12-09 14:00 ET (EST) = 19:00 UTC.
 */
export function etToUtcMs(dateStr, timeStr = DEFAULT_TIME_ET) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm]  = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - tzOffsetMs(guess);
  utc = guess - tzOffsetMs(utc); // segunda pasada: correcta cerca de los cambios de DST
  return utc;
}

/** Fecha calendario (YYYY-MM-DD) en Nueva York de un instante. */
export function etDateKey(utcMs) {
  return dateKeyFmt.format(new Date(utcMs));
}

// Días de calendario (en ET) entre hoy y la fecha del evento: 0 = hoy, 1 = mañana
function calendarDaysUntil(nowMs, eventDate) {
  const [ny, nm, nd] = etDateKey(nowMs).split('-').map(Number);
  const [ey, em, ed] = eventDate.split('-').map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(ny, nm - 1, nd)) / DAY_MS);
}

// BTC/ETH/altcoins comparten los eventos de "BTC"; el oro (PAXG, XAUUSDT) los de "PAXG"
function assetKey(asset) {
  if (!asset) return null;
  const a = String(asset).toUpperCase();
  return a === 'PAXG' || a === 'XAUUSDT' || a === 'XAU' ? 'PAXG' : 'BTC';
}

/**
 * Eventos relevantes para un activo dentro de los próximos `daysAhead` días,
 * incluyendo los publicados hace menos de 6 h (`phase: 'released'`).
 *
 * @param {number} daysAhead
 * @param {string|null} asset  - 'PAXG' | 'BTC' | 'ETH' | ... | null (todos)
 * @param {number} now         - ms; inyectable para tests
 * @returns {Array<{date,name,fullName,impact,assets,verified,note,eventTime,hoursUntil,daysUntil,phase}>}
 *   daysUntil: 0 = hoy (ET), 1 = mañana. phase: 'upcoming' | 'released'.
 */
export function getUpcomingEvents(daysAhead = 7, asset = null, now = Date.now()) {
  const key  = assetKey(asset);
  const edge = now + daysAhead * DAY_MS;

  return MACRO_EVENTS
    .map(e => ({ e, t: etToUtcMs(e.date, RELEASE_TIME_ET[e.name] ?? DEFAULT_TIME_ET) }))
    .filter(({ e, t }) => t + POST_EVENT_WINDOW_MS >= now && t <= edge && (!key || e.assets.includes(key)))
    .sort((a, b) => a.t - b.t)
    .map(({ e, t }) => ({
      ...e,
      note:       IMPACT_NOTE[e.name] ?? 'Puede generar volatilidad en los mercados.',
      eventTime:  new Date(t).toISOString(),
      hoursUntil: Math.round(((t - now) / HOUR_MS) * 10) / 10,
      daysUntil:  Math.max(0, calendarDaysUntil(now, e.date)),
      phase:      t > now ? 'upcoming' : 'released'
    }));
}

/**
 * Cuánto calendario queda cargado: sirve para avisar (health) antes de quedarse sin cobertura.
 */
export function getCalendarCoverage(now = Date.now()) {
  const times = MACRO_EVENTS.map(e => etToUtcMs(e.date, RELEASE_TIME_ET[e.name] ?? DEFAULT_TIME_ET));
  const last  = Math.max(...times);
  const upcoming = MACRO_EVENTS.filter((e, i) => times[i] >= now);
  return {
    lastEventDate:     MACRO_EVENTS[times.indexOf(last)].date,
    daysCovered:       Math.max(0, Math.floor((last - now) / DAY_MS)),
    upcomingCount:     upcoming.length,
    unverifiedUpcoming: upcoming.filter(e => !e.verified).length
  };
}
