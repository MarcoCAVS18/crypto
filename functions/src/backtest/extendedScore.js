// P6 — Variantes del score actual con insumos adicionales PRE-DECLARADOS (ver docs/BACKTEST.md, "Fase 6").
// Signos de la economía, pesos fijos (±EXT_WEIGHT cada uno, igual que la IA), nada se ajusta con los datos.
// Dato faltante → aporta 0 (igual que en vivo: el score se calcula sin ese insumo).

import { ruleScoreOfRow } from './ruleScore.js';

export const EXT_WEIGHT = 0.10;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const fin = Number.isFinite;

/** Cada componente devuelve −1..1 (o null si falta el dato). */
export const EXT_COMPONENTS = {
  // + : más inflación esperada → oro
  breakeven:    (x) => (fin(x.be_chg20) ? clamp(x.be_chg20 / 0.25, -1, 1) : null),
  // − : dólar amplio fuerte → oro débil
  dollar:       (x) => (fin(x.usd_chg20) ? clamp(-x.usd_chg20 / 0.03, -1, 1) : null),
  // + : VIX alto → demanda de refugio
  vix:          (x) => (fin(x.vix_z) ? clamp(x.vix_z / 2, -1, 1) : null),
  // − : managed money muy largo → riesgo de corrección (mismo criterio contrarian que el COT actual)
  managedMoney: (x) => (fin(x.mm_pct) ? clamp(-(x.mm_pct - 50) / 50, -1, 1) + 0 : null)   // + 0: evita -0
};

export const EXT_VARIANTS = [
  { id: 'ext_be',  label: 'Score actual + inflación implícita (+)', parts: ['breakeven'] },
  { id: 'ext_usd', label: 'Score actual + dólar amplio (−)',         parts: ['dollar'] },
  { id: 'ext_vix', label: 'Score actual + VIX (+)',                  parts: ['vix'] },
  { id: 'ext_mm',  label: 'Score actual + managed money (−)',        parts: ['managedMoney'] },
  { id: 'ext_all', label: 'Score actual + las cuatro',               parts: ['breakeven', 'dollar', 'vix', 'managedMoney'] }
];

/** Función de score por fila para una variante (lista de partes). NaN si el score base no está disponible. */
export function extendedScoreOfRow(parts) {
  return (row) => {
    const base = ruleScoreOfRow(row);
    if (!fin(base)) return NaN;
    let add = 0;
    for (const p of parts) add += EXT_WEIGHT * (EXT_COMPONENTS[p](row.x) ?? 0);
    return clamp(base + add, -1, 1);
  };
}

/** ¿Hay datos de alguna de las partes en una fracción razonable de las filas? (para marcar "datos insuficientes") */
export function partsCoverage(rows, parts) {
  if (!rows.length) return 0;
  const covered = rows.filter(r => parts.some(p => EXT_COMPONENTS[p](r.x) !== null)).length;
  return covered / rows.length;
}
