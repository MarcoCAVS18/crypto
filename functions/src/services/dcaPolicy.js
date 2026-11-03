// Política de tamaño del DCA, respaldada por el backtest (docs/BACKTEST.md, fase 3) + ritmo de compra (p3-2).
//
// QUÉ RESPALDA EL BACKTEST (GC=F 2001–2026, hold-out 2024-09→2026-09, gasto igualado, placebo por desplazamiento):
//  - Comprar MÁS cuando el score está ALTO encareció el costo promedio (+0.5 %; ganó en 10 % de las ventanas).
//    La lógica anterior hacía justo eso: fracción de capital 0.65/0.80/1.0 según el score, más recortes por
//    COT/tasa real/GVZ/tendencia (que ya son componentes del score: se contaban dos veces).
//  - Comprar MÁS cuando el score está BAJO lo abarató un 0.34 % (hold-out 0.24 %; p 0.003 en ambos). Efecto CHICO:
//    similar a 3 comisiones de Binance (0.1 %): existe, pero es fina y con pocas muestras independientes. Por eso el tilt
//    está acotado (×0.5–×1.5) y el resto no cambia.
//  - La volatilidad realizada como señal de tamaño no mostró efecto (±0.01 %): no se usa.
//  - La caída desde el máximo de 1 año (dd252) no se confirmó en el hold-out (p 0.35): no se usa.
//
// OJO CON LO QUE ESO SIGNIFICA: el simulador usa GASTO IGUALADO (dcaSim.js reescala los multiplicadores para que cada
// ventana gaste lo mismo que el DCA fijo) y compras SEMANALES. Es decir, el tilt REPARTE un gasto fijo entre compras
// (más en las semanas débiles, menos en las fuertes). No dice cuánto del efectivo total conviene usar de una vez.
//
// p3-1 hacía justo esa confusión: la base era "75 % de TODO el efectivo" y el tilt la llevaba hasta el 100 %. Con el score
// en −0.59 (Risk OFF) pedía el 97 % de los USDT del usuario en una sola señal, sin reserva para seguir promediando si
// el precio sigue cayendo.
//
// p3-2 (ritmo): los USDT se reparten en N compras (4 por defecto, ajustable). Cada señal usa 1/N de lo que queda, y el tilt
// acotado (idéntico al evaluado) modula ESA cuota. Es la estructura del simulador (cuota base × multiplicador).
// El valor de N NO sale de ningún backtest: es una decisión de manejo de riesgo (no gastar todo de golpe), declarada como tal.
//
// El mapeo del tilt es EXACTAMENTE el evaluado (`modulation` de backtest/dcaSim.js): una sola fuente de verdad.

import { modulation } from '../backtest/dcaSim.js';

const DEFAULT_INSTALLMENTS = 4;

export const DCA_POLICY = Object.freeze({
  version: 'p3-2',
  installments: Object.freeze({ default: DEFAULT_INSTALLMENTS, min: 1, max: 12 }),
  baseFraction: 1 / DEFAULT_INSTALLMENTS,   // cuota base con el valor por defecto (la usa también el challenger `fixed_dca`)
  minFraction: 0.04,                        // nunca una cuota microscópica (con 12 compras y ×0.5 ≈ 4.2 %)
  maxFraction: 1.0,                         // nunca más del 100 % del efectivo (solo se alcanza con 1 compra)
  tilt: Object.freeze({ k: 0.5, min: 0.5, max: 1.5, dir: -1 })   // dir −1: más peso cuando el score es bajo
});

const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

/** Cantidad de compras en las que se reparten los USDT: entero entre 1 y 12; ausente o inválido ⇒ 4. */
export function normalizeInstallments(x, limits = DCA_POLICY.installments) {
  if (x === null || x === undefined || x === '') return limits.default;
  const n = Number(x);
  if (!Number.isFinite(n)) return limits.default;
  return Math.min(limits.max, Math.max(limits.min, Math.round(n)));
}

/**
 * Fracción del efectivo disponible que usa UNA señal de compra.
 * @param {number|null} score - score de mercado (−1…1); no finito ⇒ neutro
 * @param {object} [o]
 * @param {number}  [o.installments] - compras en las que se reparten los USDT
 * @param {boolean} [o.tilt=true]    - false ⇒ sin ajuste por score (activos sin evidencia: BTC/ETH)
 * @returns {{ version:string, installments:number, baseFraction:number, multiplier:number, capFraction:number, score:number|null, tilt:boolean }}
 */
export function dcaCapFraction(score, { installments, tilt = true, policy = DCA_POLICY } = {}) {
  const n = normalizeInstallments(installments, policy.installments);
  const base = 1 / n;
  const multiplier = tilt ? modulation(score, policy.tilt) : 1;
  const capFraction = Math.min(policy.maxFraction, Math.max(policy.minFraction, base * multiplier));
  return {
    version: policy.version, installments: n, baseFraction: round(base), multiplier: round(multiplier), capFraction: round(capFraction),
    score: tilt && Number.isFinite(score) ? round(score) : null, tilt
  };
}

/**
 * Presupuesto de UNA señal: la fracción de la política sobre el efectivo, con piso (una orden mínima, si alcanza el efectivo)
 * y techo (el efectivo). Sin el piso, las bolsas chicas quedaban en "monto demasiado chico" aunque se pudiera comprar.
 */
export function buyBudgetUsd(cashUsd, fraction, minOrderUsd = 10) {
  if (!(cashUsd > 0)) return 0;
  const raw = cashUsd * (Number.isFinite(fraction) ? fraction : 0);
  return Math.min(cashUsd, Math.max(raw, Math.min(cashUsd, minOrderUsd)));
}

/**
 * Cómo se parte el presupuesto en tramos (ahora / más abajo / nivel profundo): 3 si el tramo más chico llega al mínimo
 * de orden, si no 2, si no 1. Antes siempre eran 3 (o 2) y los que quedaban bajo el mínimo se descartaban DESPUÉS, a veces
 * dejando solo el tramo profundo y sacando el de "ahora".
 * @param {number} budgetUsd     presupuesto de la señal (0 ⇒ sin capital cargado: se muestra el plan en %)
 * @param {number} maxTranches   3 con efectivo holgado, 2 con poco (esquema anterior en %)
 */
export function tranchePlan(budgetUsd, maxTranches = 3, minOrderUsd = 10) {
  const THREE = [0.3, 0.3, 0.4], TWO = [0.4, 0.6];
  if (!(budgetUsd > 0)) return maxTranches >= 3 ? THREE : TWO;
  if (maxTranches >= 3 && budgetUsd * THREE[0] >= minOrderUsd) return THREE;
  if (budgetUsd * TWO[0] >= minOrderUsd) return TWO;
  return [1];
}

/** Frase para la recomendación (español rioplatense). */
export function tiltNote({ multiplier }) {
  if (multiplier > 1.02) return ` Tamaño ajustado ×${multiplier.toFixed(2)}: con el contexto flojo se le da algo más de peso a comprar la debilidad (en el backtest 2001–2026 abarató el costo promedio ~0,3 %; efecto chico).`;
  if (multiplier < 0.98) return ` Tamaño ajustado ×${multiplier.toFixed(2)}: con el contexto fuerte se compra algo menos (el backtest no respalda comprar más cuando el score está alto).`;
  return '';
}

/** Frase del ritmo: cuánto de los USDT usa esta compra y que el resto queda de reserva. Vacía si no hay efectivo cargado o es 1 sola compra. */
export function pacingNote({ cashUsd, fraction, installments, minOrderUsd = 10 }) {
  if (!(cashUsd > 0) || !(installments > 1)) return '';
  const budget = buyBudgetUsd(cashUsd, fraction, minOrderUsd);
  const pct = Math.round((budget / cashUsd) * 100);
  const fmt = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
  return ` · Ritmo: tus USDT se reparten en ~${installments} compras; esta usa el ${pct} % (${fmt(budget)} de ${fmt(cashUsd)}) y el resto (${fmt(cashUsd - budget)}) queda de reserva por si el precio sigue bajando.`;
}
