// Alerta de fuente caída: avisa (push) cuando el contexto de oro lleva varias horas seguidas con degradación SEVERA,
// con antispam. Un dato caído un rato es normal (el modo degradado ya lo muestra); tres horas seguidas no.

export const ALERT_AFTER_SNAPSHOTS = 3;          // snapshots horarios consecutivos con degradación severa
export const ALERT_COOLDOWN_MS = 12 * 3600e3;

/**
 * @param {object} p
 * @param {string|null} p.currentLevel      - nivel del ciclo actual ('none'|'partial'|'severe'|null)
 * @param {Array<{dataHealth?:{level?:string}}>} p.previousSnapshots - más nuevo primero
 * @param {number|null} p.lastAlertAt
 * @param {number} p.now
 * @returns {{ alert:boolean, reason:string }}
 */
export function shouldAlertSourcesDown({ currentLevel, previousSnapshots = [], lastAlertAt = null, now = Date.now() }) {
  if (currentLevel !== 'severe') return { alert: false, reason: 'no-severe' };
  const needed = ALERT_AFTER_SNAPSHOTS - 1;
  const prev = previousSnapshots.slice(0, needed);
  if (prev.length < needed || !prev.every(s => s?.dataHealth?.level === 'severe')) return { alert: false, reason: 'not-persistent' };
  if (lastAlertAt && now - lastAlertAt < ALERT_COOLDOWN_MS) return { alert: false, reason: 'cooldown' };
  return { alert: true, reason: 'persistent-severe' };
}
