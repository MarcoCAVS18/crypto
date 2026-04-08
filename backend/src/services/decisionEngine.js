// Motor de decisión: cruza market mode, zonas, indicadores y perfil del usuario

/**
 * @param {object} marketMode  - { mode: 'risk_on'|'neutral'|'risk_off', score, reasons }
 * @param {object} zones       - { buy, neutral, sell, currentZone }
 * @param {number} currentPrice
 * @param {object} userState   - { cashPercent, mode, totalCapital }
 * @param {object} indicators  - { rsi, atr, ema, trendShort, trendLong }
 */
export function makeDecision(marketMode, zones, currentPrice, userState, indicators = {}) {
  const { cashPercent, mode: userMode, totalCapital = 0 } = userState;
  const { rsi = 50 } = indicators;
  const currentZone = zones.currentZone;

  // Sin cash suficiente = esperar siempre
  if (cashPercent < 10) {
    return {
      action: 'WAIT',
      strength: 'fuerte',
      reason: 'Sin cash suficiente para operar',
      recommendation: 'Espera a tener al menos 10% de cash disponible antes de considerar nuevas posiciones',
      operations: []
    };
  }

  // Risk OFF = esperar siempre
  if (marketMode.mode === 'risk_off') {
    return {
      action: 'WAIT',
      strength: 'fuerte',
      reason: `Mercado en Risk OFF: ${marketMode.reasons.join(', ')}`,
      recommendation: 'No operar hasta que el contexto mejore. Proteger capital existente.',
      operations: []
    };
  }

  // Modo observación = siempre WAIT
  if (userMode === 'observacion') {
    return {
      action: 'WAIT',
      strength: 'fuerte',
      reason: 'Modo observación activo',
      recommendation: 'Solo monitorear. No ejecutar operaciones.',
      operations: []
    };
  }

  let action, strength, reason, recommendation, operations = [];

  if (userMode === 'trading') {
    // --- MODO TRADING: más agresivo, usa RSI como confirmación adicional ---
    const result = decideTradingMode(marketMode, zones, currentPrice, cashPercent, rsi, totalCapital);
    ({ action, strength, reason, recommendation, operations } = result);
  } else {
    // --- MODO INVERSIÓN: conservador, largo plazo, foco en zonas y EMA ---
    const result = decideInversionMode(marketMode, zones, currentPrice, cashPercent, rsi, totalCapital);
    ({ action, strength, reason, recommendation, operations } = result);
  }

  return { action, strength, reason, recommendation, operations };
}

// ── Lógica modo INVERSIÓN ──────────────────────────────────────────────────────
function decideInversionMode(marketMode, zones, currentPrice, cashPercent, rsi, totalCapital) {
  const currentZone = zones.currentZone;

  if (marketMode.mode === 'risk_on') {
    if (currentZone === 'buy' && cashPercent >= 30) {
      const operations = generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, 'inversion');
      return {
        action: 'BUY',
        strength: 'fuerte',
        reason: `Risk ON + zona de compra + ${cashPercent}% cash disponible`,
        recommendation: 'Acumulación progresiva. Dividir entrada en 2-3 niveles para promediar precio.',
        operations
      };
    }
    if (currentZone === 'sell') {
      const operations = generateSellOperations(currentPrice, zones, totalCapital, 'inversion');
      return {
        action: 'SELL',
        strength: 'moderado',
        reason: 'Precio en zona de distribución con contexto alcista',
        recommendation: 'Toma de ganancias parcial (30-50% de la posición). Mantener núcleo de largo plazo.',
        operations
      };
    }
    return {
      action: 'WAIT',
      strength: 'débil',
      reason: 'Precio en zona neutral — sin setup claro',
      recommendation: `Esperar pullback a zona de compra: ${formatPrice(zones.buy.min)} – ${formatPrice(zones.buy.max)}`,
      operations: []
    };
  }

  if (marketMode.mode === 'neutral') {
    if (currentZone === 'buy' && cashPercent >= 50) {
      const operations = generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, 'inversion', 0.5);
      return {
        action: 'BUY',
        strength: 'moderado',
        reason: `Soporte con cash suficiente (${cashPercent}%), contexto mixto`,
        recommendation: 'Compra reducida — máximo 50% del capital previsto. Contexto aún incierto.',
        operations
      };
    }
    if (currentZone === 'sell') {
      return {
        action: 'WAIT',
        strength: 'moderado',
        reason: 'Zona de distribución sin contexto alcista claro',
        recommendation: 'Considerar reducir exposición si hay ganancias. No agregar posición.',
        operations: []
      };
    }
    return {
      action: 'WAIT',
      strength: 'moderado',
      reason: 'Contexto neutral + zona neutral',
      recommendation: 'Esperar confirmación de dirección. No hay setup de alta probabilidad.',
      operations: []
    };
  }

  return { action: 'WAIT', strength: 'débil', reason: 'Sin condiciones claras', recommendation: 'Monitorear.', operations: [] };
}

// ── Lógica modo TRADING ────────────────────────────────────────────────────────
function decideTradingMode(marketMode, zones, currentPrice, cashPercent, rsi, totalCapital) {
  const currentZone = zones.currentZone;
  const rsiOversold = rsi < 35;
  const rsiOverbought = rsi > 65;

  if (marketMode.mode === 'risk_on') {
    // Compra fuerte: zona compra O RSI muy sobrevendido con cash suficiente
    if ((currentZone === 'buy' || rsiOversold) && cashPercent >= 20) {
      const ops = generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, 'trading');
      const rsiContext = rsiOversold ? ` + RSI sobrevendido (${rsi.toFixed(1)})` : '';
      return {
        action: 'BUY',
        strength: rsiOversold && currentZone === 'buy' ? 'fuerte' : 'moderado',
        reason: `Risk ON + zona ${currentZone}${rsiContext}`,
        recommendation: 'Entrada táctica. Stop loss ajustado. Toma de ganancia parcial al +3-5%.',
        operations: ops
      };
    }
    // Venta fuerte: zona venta O RSI muy sobrecomprado
    if (currentZone === 'sell' || rsiOverbought) {
      const ops = generateSellOperations(currentPrice, zones, totalCapital, 'trading');
      const rsiContext = rsiOverbought ? ` + RSI sobrecomprado (${rsi.toFixed(1)})` : '';
      return {
        action: 'SELL',
        strength: rsiOverbought && currentZone === 'sell' ? 'fuerte' : 'moderado',
        reason: `Precio en zona distribución${rsiContext}`,
        recommendation: 'Salida parcial o total de la posición. Recomprar en zona de compra.',
        operations: ops
      };
    }
    return {
      action: 'WAIT',
      strength: 'débil',
      reason: `Zona neutral, RSI en ${rsi.toFixed(1)} — sin extremo claro`,
      recommendation: `Aguardar: compra en ${formatPrice(zones.buy.max)} / venta en ${formatPrice(zones.sell.min)}`,
      operations: []
    };
  }

  if (marketMode.mode === 'neutral') {
    if (rsiOversold && cashPercent >= 30) {
      const ops = generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, 'trading', 0.4);
      return {
        action: 'BUY',
        strength: 'moderado',
        reason: `RSI en sobreventa extrema (${rsi.toFixed(1)}) — rebote táctico posible`,
        recommendation: 'Entrada pequeña especulativa. Stop loss estricto. No es inversión de largo plazo.',
        operations: ops
      };
    }
    if (rsiOverbought) {
      const ops = generateSellOperations(currentPrice, zones, totalCapital, 'trading');
      return {
        action: 'SELL',
        strength: 'moderado',
        reason: `RSI en sobrecompra (${rsi.toFixed(1)}) — corrección posible`,
        recommendation: 'Reducir posición o tomar ganancias. Reentrar más bajo.',
        operations: ops
      };
    }
    return {
      action: 'WAIT',
      strength: 'moderado',
      reason: `Contexto mixto + RSI neutral (${rsi.toFixed(1)})`,
      recommendation: 'Sin señal de trading clara. Esperar extremos de RSI o ruptura de zona.',
      operations: []
    };
  }

  return { action: 'WAIT', strength: 'débil', reason: 'Risk OFF — no operar', recommendation: 'Proteger capital.', operations: [] };
}

// ── Generadores de operaciones específicas ─────────────────────────────────────

/**
 * Genera una lista de órdenes de compra escalonadas.
 * @param {number} capitalFraction - fracción del capital disponible a usar (0-1)
 */
function generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, mode, capitalFraction = 1.0) {
  const capitalDisponible = totalCapital > 0 ? totalCapital * (cashPercent / 100) : 0;
  const capitalAUsar = capitalDisponible * capitalFraction;
  const hasCapital = capitalAUsar > 0;

  const level1Price = currentPrice;
  const level2Price = currentPrice * 0.98;
  const level3Price = zones.buy.min;

  if (mode === 'trading') {
    // Trading: 2 niveles más concentrados
    const pct1 = 0.5, pct2 = 0.5;
    return [
      buildBuyOp(1, 'Entrada táctica ahora', level1Price, capitalAUsar * pct1, hasCapital, pct1 * 100),
      buildBuyOp(2, `Si corrige a ${formatPrice(level2Price)}`, level2Price, capitalAUsar * pct2, hasCapital, pct2 * 100)
    ];
  }

  // Inversión: 3 niveles escalonados
  if (cashPercent >= 60) {
    return [
      buildBuyOp(1, 'Primer tramo — ahora', level1Price, capitalAUsar * 0.30, hasCapital, 30),
      buildBuyOp(2, `Segundo tramo — si baja a ${formatPrice(level2Price)}`, level2Price, capitalAUsar * 0.30, hasCapital, 30),
      buildBuyOp(3, `Tercer tramo — mínimo de zona (${formatPrice(level3Price)})`, level3Price, capitalAUsar * 0.40, hasCapital, 40)
    ];
  }
  return [
    buildBuyOp(1, 'Primer tramo — ahora', level1Price, capitalAUsar * 0.40, hasCapital, 40),
    buildBuyOp(2, `Segundo tramo — si baja a ${formatPrice(level2Price)}`, level2Price, capitalAUsar * 0.60, hasCapital, 60)
  ];
}

function buildBuyOp(level, label, price, usdAmount, hasCapital, pct) {
  return {
    level,
    label,
    type: 'BUY',
    price,
    usdAmount: hasCapital ? usdAmount : null,
    units: hasCapital ? usdAmount / price : null,
    percentage: pct
  };
}

function generateSellOperations(currentPrice, zones, totalCapital, mode) {
  // Las operaciones de venta dependen de la posición real del usuario (portfolio)
  // Sin datos de posición, mostramos porcentajes de la posición actual
  const pct = mode === 'trading' ? 70 : 35;
  return [
    {
      level: 1,
      type: 'SELL',
      label: `Venta parcial ahora (${pct}% de posición)`,
      price: currentPrice,
      percentage: pct,
      usdAmount: null,
      units: null,
      note: 'Registra tu posición en el Portfolio para ver el monto exacto'
    },
    {
      level: 2,
      type: 'SELL',
      label: `Venta adicional si sube a ${formatPrice(zones.sell.max)}`,
      price: zones.sell.max,
      percentage: 100 - pct,
      usdAmount: null,
      units: null,
      note: 'Segundo objetivo'
    }
  ];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(price) {
  if (!price) return 'N/A';
  if (price >= 1000) return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function evaluateSignalStrength(marketMode, zones, currentPrice, cashPercent) {
  let score = 50;
  if (marketMode.mode === 'risk_on') score += 20;
  else if (marketMode.mode === 'risk_off') score -= 30;
  if (zones.currentZone === 'buy') score += 15;
  else if (zones.currentZone === 'sell') score -= 10;
  if (cashPercent >= 50) score += 10;
  else if (cashPercent < 20) score -= 15;
  return Math.max(0, Math.min(100, score));
}
