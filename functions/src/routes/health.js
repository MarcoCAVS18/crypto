// GET /api/health/deep — estado de configuración y de los insumos del score de oro.
// No dispara llamadas a fuentes externas: lee el último contexto de oro cacheado, así que es barato
// y sirve para monitoreo. Hace visible lo que antes fallaba en silencio (p. ej. la tasa real).

import express from 'express';
import { getGoldContextCache, getLatestSnapshots } from '../config/database.js';
import { getCalendarCoverage } from '../data/macroCalendar.js';
import { summarizeSources } from '../services/dataHealth.js';
import { GROQ_MODEL, describeApiKey, probeGroqKey } from '../services/groqChat.js';
import { diagnoseAllFeeds } from '../services/newsService.js';

const router = express.Router();

// Un contexto de oro más viejo que esto sugiere que nadie lo está refrescando
const CONTEXT_STALE_MINUTES = 3 * 60;
// El job de snapshots corre cada hora: más de 3 h sin snapshot nuevo = el job no está corriendo
const SNAPSHOT_STALE_MINUTES = 3 * 60;

/** Puro y testeable: arma el reporte a partir de la configuración y del último contexto cacheado. */
export function buildHealthReport({ config, cachedContext, calendar, lastSnapshot = undefined, now = Date.now() }) {
  const warnings = [];
  if (!config.groqKey) warnings.push('GROQ_API_KEY no configurada: sin análisis de IA ni chat.');
  if (config.groqKeyInfo?.present && /inesperado/.test(config.groqKeyInfo.format)) warnings.push('GROQ_API_KEY no tiene el formato gsk_…: probablemente esté mal cargada (¿otra clave o texto extra?).');
  if (config.groqKeyInfo?.hadExtraWhitespaceOrQuotes) warnings.push('GROQ_API_KEY tenía espacios, saltos de línea o comillas; se limpian al usarla, pero conviene volver a cargar el secreto sin ellos.');
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
    groqKeyInfo: describeApiKey(process.env.GROQ_API_KEY),   // formato/largo/últimos 4: para verificar QUÉ clave tiene la función
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

// GET /api/health/ai — prueba la clave de Groq en vivo (lista de modelos, sin gastar tokens) y explica el resultado.
// Router aparte: el principal cuelga de /api/health/deep.
export const aiHealthRouter = express.Router();
aiHealthRouter.get('/', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await probeGroqKey());
});

// GET /api/health/news — prueba cada feed de noticias DESDE la función (estado HTTP, redirecciones, items) para saber por qué
// faltan titulares. Resultado cacheado 60 s: es un diagnóstico, no debe poder usarse para castigar a los feeds.
export const newsHealthRouter = express.Router();
let newsDiag = { at: 0, value: null };
newsHealthRouter.get('/', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!newsDiag.value || Date.now() - newsDiag.at > 60000) newsDiag = { at: Date.now(), value: await diagnoseAllFeeds() };
  const all = [...newsDiag.value.gold, ...newsDiag.value.btc];
  res.json({ checkedAt: new Date(newsDiag.at).toISOString(), okFeeds: all.filter(f => f.ok).length, totalFeeds: all.length, ...newsDiag.value });
});

export default router;
