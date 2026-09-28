// GET /api/health/deep — estado de configuración y de los insumos del score de oro.
// No dispara llamadas a fuentes externas: lee el último contexto de oro cacheado, así que es barato
// y sirve para monitoreo. Hace visible lo que antes fallaba en silencio (p. ej. la tasa real).

import express from 'express';
import { getGoldContextCache, getLatestSnapshots } from '../config/database.js';
import { getCalendarCoverage } from '../data/macroCalendar.js';
import { summarizeSources } from '../services/dataHealth.js';
import { GROQ_MODEL } from '../services/groqChat.js';

const router = express.Router();

// Un contexto de oro más viejo que esto sugiere que nadie lo está refrescando
const CONTEXT_STALE_MINUTES = 3 * 60;
// El job de snapshots corre cada hora: más de 3 h sin snapshot nuevo = el job no está corriendo
const SNAPSHOT_STALE_MINUTES = 3 * 60;

/** Puro y testeable: arma el reporte a partir de la configuración y del último contexto cacheado. */
export function buildHealthReport({ config, cachedContext, calendar, lastSnapshot = undefined, now = Date.now() }) {
  const warnings = [];
  if (!config.groqKey) warnings.push('GROQ_API_KEY no configurada: sin análisis de IA ni chat.');
  if (!config.fredKey) warnings.push('FRED_API_KEY no configurada: sin series de FRED (se usan fallbacks sin clave).');

  let goldContext = { cached: false };
  if (cachedContext) {
    const health = summarizeSources(cachedContext.sources);
    const ageMinutes = cachedContext.fetchedAt ? Math.round((now - Date.parse(cachedContext.fetchedAt)) / 60000) : null;
    goldContext = {
      cached: true,
      fetchedAt: cachedContext.fetchedAt ?? null,
      ageMinutes,
      analysisError: cachedContext.analysisError ?? null,
      degraded: health?.degraded ?? null,
      level: health?.level ?? null,
      missing: health?.missing ?? [],
      stale: health?.stale ?? [],
      sources: cachedContext.sources ?? null
    };
    if (health?.degraded) warnings.push(health.message);
    if (ageMinutes != null && ageMinutes > CONTEXT_STALE_MINUTES) warnings.push(`Contexto de oro sin refrescar hace ${ageMinutes} min.`);
    if (cachedContext.analysisError) warnings.push(`Análisis de IA falló: ${cachedContext.analysisError}`);
  }

  // Snapshots horarios: `undefined` = no se consultó; `null` = no hay ninguno todavía
  let snapshots;
  if (lastSnapshot !== undefined) {
    if (lastSnapshot === null) {
      snapshots = { last: null };
      warnings.push('Todavía no hay snapshots de mercado (¿corrió el job snapshotJob?).');
    } else {
      const ageMinutes = Math.round((now - lastSnapshot.ts) / 60000);
      snapshots = { last: { id: lastSnapshot.id, ts: lastSnapshot.ts, ageMinutes, modelVersion: lastSnapshot.modelVersion ?? null } };
      if (ageMinutes > SNAPSHOT_STALE_MINUTES) warnings.push(`Último snapshot de mercado hace ${ageMinutes} min: el job snapshotJob no está corriendo.`);
    }
  }

  if (calendar.daysCovered < 45) warnings.push(`Calendario macro: quedan ${calendar.daysCovered} días de cobertura (hasta ${calendar.lastEventDate}).`);
  if (calendar.unverifiedUpcoming > 0) warnings.push(`Calendario macro: ${calendar.unverifiedUpcoming} eventos próximos con fecha sin verificar.`);

  return {
    status: warnings.length ? 'degraded' : 'ok',
    timestamp: new Date(now).toISOString(),
    config,
    goldContext,
    ...(snapshots ? { snapshots } : {}),
    calendar,
    warnings
  };
}

router.get('/', async (_req, res) => {
  const config = {
    groqKey: !!process.env.GROQ_API_KEY,
    fredKey: !!process.env.FRED_API_KEY,
    vapidKeys: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    groqModel: GROQ_MODEL
  };

  let cachedContext = null;
  let readError = null;
  try { cachedContext = await getGoldContextCache(); } catch (e) { readError = e.message; }

  // Último snapshot de PAXG; si la consulta falla no se inventa estado (queda sin informar)
  let lastSnapshot;
  try { lastSnapshot = (await getLatestSnapshots('PAXG', 1))[0] ?? null; } catch { lastSnapshot = undefined; }

  const report = buildHealthReport({ config, cachedContext, calendar: getCalendarCoverage(), lastSnapshot });
  if (readError) {
    report.goldContext = { cached: false, error: readError };
    report.warnings.push(`No se pudo leer el caché del contexto de oro: ${readError}`);
    report.status = 'degraded';
  }
  res.set('Cache-Control', 'no-store');
  res.json(report);
});

export default router;
