// Política de tamaño del DCA de PAXG, respaldada por el backtest (docs/BACKTEST.md, fase 3).
//
// Evidencia (GC=F 2001–2026, hold-out 2024-09→2026-09, gasto igualado, placebo por desplazamiento):
//  - Comprar MÁS cuando el score está ALTO encareció el costo promedio (+0.5 %; ganó en 10 % de las ventanas).
//    La lógica anterior hacía justo eso: fracción de capital 0.65/0.80/1.0 según el score, más recortes por
//    COT/tasa real/GVZ/tendencia (que ya son componentes del score: se contaban dos veces).
//  - Comprar MÁS cuando el score está BAJO lo abarató un 0.34 % (hold-out 0.24 %; p 0.003 en ambos). Efecto CHICO:
//    menor que una comisión. Por eso el tilt está acotado (×0.5–×1.5) y el resto no cambia.
//  - La volatilidad realizada como señal de tamaño no mostró efecto (±0.01 %): no se usa.
//  - La caída desde el máximo de 1 año (dd252) no se confirmó en el hold-out (p 0.35): no se usa.
//
// El mapeo es EXACTAMENTE el evaluado (`modulation` de backtest/dcaSim.js): una sola fuente de verdad.

import { modulation } from '../backtest/dcaSim.js';

export const DCA_POLICY = Object.freeze({
  version: 'p3-1',
  baseFraction: 0.75,      // fracción del efectivo disponible que se despliega con score neutro
  minFraction: 0.35,
  maxFraction: 1.0,        // nunca más del 100 % del efectivo asignado
  tilt: Object.freeze({ k: 0.5, min: 0.5, max: 1.5, dir: -1 })   // dir −1: más peso cuando el score es bajo
});

const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * @param {number} score - score de mercado (−1…1); no finito ⇒ neutro
 * @returns {{ version:string, multiplier:number, capFraction:number, score:number|null }}
 */
export function dcaCapFraction(score, policy = DCA_POLICY) {
  const multiplier = modulation(score, policy.tilt);
  const capFraction = Math.min(policy.maxFraction, Math.max(policy.minFraction, policy.baseFraction * multiplier));
  return { version: policy.version, multiplier: round(multiplier), capFraction: round(capFraction), score: Number.isFinite(score) ? round(score) : null };
}

/** Frase para la recomendación (español rioplatense). */
export function tiltNote({ multiplier }) {
  if (multiplier > 1.02) return ` Tamaño ajustado ×${multiplier.toFixed(2)}: con el contexto flojo se le da algo más de peso a comprar la debilidad (en el backtest 2001–2026 abarató el costo promedio ~0,3 %; efecto chico).`;
  if (multiplier < 0.98) return ` Tamaño ajustado ×${multiplier.toFixed(2)}: con el contexto fuerte se compra algo menos (el backtest no respalda comprar más cuando el score está alto).`;
  return '';
}
