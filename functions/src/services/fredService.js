// Cliente de la API de FRED (St. Louis Fed): series macro diarias con historia y frescura.
//
// Requiere FRED_API_KEY (secreto de Firebase). Sin clave el módulo NO falla: devuelve las series
// como "failed" para que el modo degradado lo muestre y los fallbacks sin clave sigan funcionando.
//
// Por serie se calculan features normalizadas (cambio a 1/5/20 observaciones, z-score y percentil a
// 1 año): en P2 reemplazan a los umbrales de nivel absolutos del score de oro.

import { classifyRealYield } from './macroService.js';

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

/**
 * Series usadas. `maxAgeDays`: a partir de cuántos días sin dato nuevo se considera vencida
 * (fines de semana/feriados dejan 3-4 días; el dólar amplio se publica semanalmente).
 */
export const FRED_SERIES = {
  realYield10:  { id: 'DFII10',   label: 'Tasa real 10Y (TIPS)',        maxAgeDays: 4 },
  yield10:      { id: 'DGS10',    label: 'Bono EE.UU. 10 años',         maxAgeDays: 4 },
  yield2:       { id: 'DGS2',     label: 'Bono EE.UU. 2 años',          maxAgeDays: 4 },
  breakeven10:  { id: 'T10YIE',   label: 'Inflación implícita 10Y',     maxAgeDays: 4 },
  dollarBroad:  { id: 'DTWEXBGS', label: 'Dólar amplio (nominal)',      maxAgeDays: 12 },
  vix:          { id: 'VIXCLS',   label: 'VIX',                         maxAgeDays: 4 },
  gvz:          { id: 'GVZCLS',   label: 'GVZ (volatilidad del oro)',   maxAgeDays: 4 },
};

const DAY_MS = 24 * 3600 * 1000;
const round = (x, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/**
 * Observaciones de la respuesta JSON de FRED → [{ date, value }] ascendente.
 * FRED marca los faltantes con "." (o vacío): se descartan.
 */
export function parseFredObservations(json) {
  const raw = json?.observations;
  if (!Array.isArray(raw)) throw new Error('Respuesta de FRED sin "observations"');
  const out = [];
  for (const o of raw) {
    const txt = typeof o?.value === 'string' ? o.value.trim() : o?.value;
    if (txt === '' || txt === '.' || txt == null) continue;          // faltante (Number('') daría 0)
    const value = Number(txt);
    if (typeof o?.date === 'string' && Number.isFinite(value)) out.push({ date: o.date, value });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Features de una serie ya parseada (ascendente).
 * Los cambios se miden en observaciones (≈ días hábiles): 1, 5 y 20.
 */
export function computeSeriesFeatures(obs, now = Date.now()) {
  const n = obs.length;
  if (n === 0) return null;

  const latest = obs[n - 1];
  const at = (k) => (n - 1 - k >= 0 ? obs[n - 1 - k].value : null);
  const diff = (k) => (at(k) === null ? null : round(latest.value - at(k)));

  const win = obs.slice(-252).map(o => o.value);
  const mean = win.reduce((a, b) => a + b, 0) / win.length;
  const std  = Math.sqrt(win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length);

  return {
    latest: { date: latest.date, value: round(latest.value) },
    change1d:  diff(1),
    change5d:  diff(5),
    change20d: diff(20),
    zscore1y:  win.length >= 60 && std > 0 ? round((latest.value - mean) / std, 3) : null,
    percentile1y: win.length >= 60 ? round((win.filter(v => v <= latest.value).length / win.length) * 100, 1) : null,
    ageDays: round((now - Date.parse(`${latest.date}T00:00:00Z`)) / DAY_MS, 1),
    n
  };
}

/**
 * Descarga una serie. El error NUNCA incluye la URL (llevaría la api_key).
 */
export async function fetchFredSeries(seriesId, { apiKey, startDate, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  if (!apiKey) throw new Error('FRED_API_KEY no configurada');

  const params = new URLSearchParams({
    series_id: seriesId, api_key: apiKey, file_type: 'json', sort_order: 'asc',
    ...(startDate ? { observation_start: startDate } : {})
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${FRED_BASE}?${params}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error_message ?? ''; } catch { /* cuerpo no JSON */ }
      throw new Error(`FRED ${seriesId} HTTP ${res.status}${detail ? `: ${String(detail).replace(apiKey, '***')}` : ''}`);
    }
    return parseFredObservations(await res.json());
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`FRED ${seriesId}: timeout`);
    throw new Error(String(err.message).replace(apiKey, '***'));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Todas las series con features y estado.
 * @returns {Promise<{ available: boolean, fetchedAt: string, series: Record<string, object> }>}
 *   series[key] = { id, label, status: 'ok'|'stale'|'failed', error?, ...features }
 */
export async function getFredMacro({ apiKey = process.env.FRED_API_KEY, now = Date.now(), fetchImpl } = {}) {
  const startDate = new Date(now - 400 * DAY_MS).toISOString().slice(0, 10);   // ~1.1 años de días hábiles
  const entries = Object.entries(FRED_SERIES);

  const results = await Promise.allSettled(
    entries.map(([, cfg]) => fetchFredSeries(cfg.id, { apiKey, startDate, fetchImpl }))
  );

  const series = {};
  // Cola de observaciones de la tasa real (~1 año) para el monitor de desacople; el consumidor la retira
  // antes de cachear/persistir el contexto (`history` no viaja a snapshots ni prompts).
  let history = null;
  entries.forEach(([key, cfg], i) => {
    const r = results[i];
    const base = { id: cfg.id, label: cfg.label };
    if (r.status === 'rejected') {
      series[key] = { ...base, status: 'failed', error: r.reason?.message ?? 'error desconocido' };
      return;
    }
    if (key === 'realYield10') history = { realYield10: r.value.slice(-300) };
    const f = computeSeriesFeatures(r.value, now);
    if (!f) { series[key] = { ...base, status: 'failed', error: 'sin observaciones' }; return; }
    series[key] = { ...base, status: f.ageDays <= cfg.maxAgeDays ? 'ok' : 'stale', ...f };
  });

  return {
    available: Object.values(series).some(s => s.status !== 'failed'),
    fetchedAt: new Date(now).toISOString(),
    series,
    history
  };
}

/**
 * Completa insumos que fallaron en su fuente principal (Yahoo) con la serie equivalente de FRED.
 * No pisa datos que ya están. Devuelve un objeto nuevo (no muta `macro`).
 *  - GVZ y bono 10Y: FRED tiene los mismos índices (cierre diario).
 *  - Tasa real: la completa si falló el CSV; si ya está, la enriquece con cambio 20d, z-score y percentil.
 */
export function applyFredFallbacks(macro, fred) {
  const out = { ...macro };
  const s = fred?.series ?? {};
  const usable = (x) => x && x.status !== 'failed' && x.latest;

  if (!out.gvz && usable(s.gvz)) {
    out.gvz = {
      value: s.gvz.latest.value,
      changePercent: s.gvz.change1d != null && s.gvz.latest.value ? round((s.gvz.change1d / (s.gvz.latest.value - s.gvz.change1d)) * 100, 3) : 0,
      source: 'fred', asOf: s.gvz.latest.date
    };
  }
  if (!out.tenYearYield && usable(s.yield10)) {
    out.tenYearYield = {
      value: s.yield10.latest.value,
      changePercent: s.yield10.change1d != null ? round((s.yield10.change1d / (s.yield10.latest.value - s.yield10.change1d)) * 100, 3) : 0,
      source: 'fred', asOf: s.yield10.latest.date
    };
  }
  // Tasa real: si el CSV público falló, la API la provee; si ya está, solo se enriquece
  if (!out.realYield && usable(s.realYield10)) {
    out.realYield = {
      value: s.realYield10.latest.value, date: s.realYield10.latest.date,
      sentiment: classifyRealYield(s.realYield10.latest.value), source: 'fred-api',
      change20d: s.realYield10.change20d, zscore1y: s.realYield10.zscore1y, percentile1y: s.realYield10.percentile1y
    };
  } else if (out.realYield && usable(s.realYield10)) {
    out.realYield = { ...out.realYield, change20d: s.realYield10.change20d, zscore1y: s.realYield10.zscore1y, percentile1y: s.realYield10.percentile1y };
  }
  return out;
}
