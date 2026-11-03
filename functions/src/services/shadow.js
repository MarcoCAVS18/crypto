// Modo sombra (challenger): junto a cada decisión del motor se registra qué habría hecho una política simple de
// referencia, para compararlas con resultados reales (metrics.compareShadow). No afecta lo que ve el usuario.
//
// challenger `fixed_dca`: compra la cuota base (1/N de los USDT) siempre que el modo sea "inversión" y haya efectivo (≥ 30 %),
// sin mirar score, zona ni calendario. Es la línea de base contra la que el motor tiene que ganar para justificar su complejidad.

import { normalizeInstallments } from './dcaPolicy.js';

export function shadowFixedDca(userState) {
  const buy = userState?.mode === 'inversion' && Number(userState?.cashPercent) >= 30;
  return { id: 'fixed_dca', action: buy ? 'BUY' : 'WAIT', capFraction: buy ? Math.round(1000 / normalizeInstallments(userState?.installments)) / 1000 : 0 };
}
