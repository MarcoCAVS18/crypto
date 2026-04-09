// Motor de decisión: cruza market mode, zonas, indicadores y perfil del usuario

/**
 * @param {object} marketMode      - { mode: 'risk_on'|'neutral'|'risk_off', score, reasons }
 * @param {object} zones           - { buy, neutral, sell, currentZone }
 * @param {number} currentPrice
 * @param {object} userState       - { cashPercent, mode, totalCapital }
 * @param {object} indicators      - { rsi, atr, ema, trendShort, trendLong }
 * @param {string} symbol          - e.g. 'BTC', 'PAXG'
 * @param {object|null} portfolioContext - { units, avgBuyPrice, netInvested, hasPosition, ... }
 */
export function makeDecision(marketMode, zones, currentPrice, userState, indicators = {}, symbol = '', portfolioContext = null) {
  const { cashPercent, mode: userMode, totalCapital = 0 } = userState;
  const { rsi = 50, atr = null } = indicators;
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
    // --- MODO INVERSIÓN: conservador, largo plazo, usa P&L real del portfolio ---
    const result = decideInversionMode(marketMode, zones, currentPrice, cashPercent, rsi, totalCapital, portfolioContext, indicators);
    ({ action, strength, reason, recommendation, operations } = result);
  }

  return { action, strength, reason, recommendation, operations };
}

// ── Lógica modo INVERSIÓN ──────────────────────────────────────────────────────
//
// La decisión combina dos dimensiones:
//   1. Condiciones de mercado (zona, market mode, RSI)
//   2. Estado real del portfolio (precio promedio de compra, P&L actual)
//
// Umbrales de P&L para recomendar venta parcial:
//   < 0%       → precio por debajo del promedio → acumular (DCA)
//   0 – 15%    → ganancia pequeña → mantener posición, sin acción
//   15 – 25%   → ganancia moderada → WAIT, monitorear zona de distribución
//   ≥ 25%      → ganancia significativa + zona de venta → toma parcial de ganancias
//   ≥ 40%      → ganancia fuerte + zona de venta → toma parcial más agresiva

function decideInversionMode(marketMode, zones, currentPrice, cashPercent, rsi, totalCapital, portfolioCtx = null, indicators = {}) {
  const currentZone = zones.currentZone;

  // ── Contexto del portfolio ──────────────────────────────────────────────────
  const hasPosition = portfolioCtx?.hasPosition ?? false;
  const avgBuyPrice = portfolioCtx?.avgBuyPrice ?? 0;
  const netInvested = portfolioCtx?.netInvested ?? 0;
  const pnlPercent = hasPosition && avgBuyPrice > 0
    ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100
    : null;

  // Peso de la posición sobre el capital total
  const allocationPercent = hasPosition && totalCapital > 0 && netInvested > 0
    ? Math.min((netInvested / totalCapital) * 100, 100)
    : null;
  const isHighlyConcentrated = allocationPercent !== null && allocationPercent > 70;
  const isLightlyExposed     = allocationPercent !== null && allocationPercent < 20;

  // R/R ratio usando ATR como medida de riesgo
  const atr = indicators?.atr ?? null;
  const atrPct = atr && currentPrice ? (atr / currentPrice) * 100 : null;
  const rrTarget = zones?.sell?.min ?? null;
  const rrStop   = zones?.buy?.min ?? null;
  let rrRatio = null;
  let rrLine  = '';
  if (rrTarget && rrStop && currentPrice && rrTarget > currentPrice && rrStop < currentPrice) {
    const upside   = ((rrTarget - currentPrice) / currentPrice) * 100;
    const downside = ((currentPrice - rrStop)   / currentPrice) * 100;
    rrRatio = downside > 0 ? upside / downside : null;
    if (rrRatio !== null) {
      rrLine = ` · R/R estimado ${rrRatio.toFixed(1)}:1 (objetivo ${formatPrice(rrTarget)}, soporte ${formatPrice(rrStop)})`;
    }
  } else if (atrPct) {
    rrLine = ` · Volatilidad ATR: ±${atrPct.toFixed(1)}% por vela`;
  }

  const allocationLine = allocationPercent !== null
    ? ` · ${allocationPercent.toFixed(0)}% de tu capital en esta posición`
    : '';

  // Flags derivados del P&L
  const isBelowAvg       = pnlPercent !== null && pnlPercent < 0;
  const isNearAvg        = pnlPercent !== null && pnlPercent >= 0  && pnlPercent < 15;
  const isModerateProfit = pnlPercent !== null && pnlPercent >= 15 && pnlPercent < 25;
  const isGoodProfit     = pnlPercent !== null && pnlPercent >= 25 && pnlPercent < 40;
  const isStrongProfit   = pnlPercent !== null && pnlPercent >= 40;
  const sellMakesSense   = isGoodProfit || isStrongProfit; // ≥ 25%

  // Etiqueta de contexto para incluir en mensajes
  const pnlTag = pnlPercent !== null
    ? ` · promedio de compra ${formatPrice(avgBuyPrice)}, P&L actual ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`
    : ' · Registra tu portfolio para que la decisión use tu precio promedio real.';

  const noPortfolioMsg = !hasPosition
    ? ' Registra tus operaciones en el Portfolio para que la decisión use tu promedio de compra real.'
    : '';

  // ── Risk OFF: nunca operar ──────────────────────────────────────────────────
  // (ya filtrado en makeDecision, pero como fallback)

  // ── Risk ON ────────────────────────────────────────────────────────────────
  if (marketMode.mode === 'risk_on') {

    // BUY: zona de compra, O precio debajo del promedio (DCA) → siempre acumular
    const dcaOpportunity = isBelowAvg && cashPercent >= 20;
    const buyZoneOk      = currentZone === 'buy' && cashPercent >= 30;

    if (buyZoneOk || dcaOpportunity) {
      const ops = generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, 'inversion');
      const isDca = dcaOpportunity && !buyZoneOk;
      const concentrationNote = isHighlyConcentrated
        ? ' ⚠️ Posición ya concentrada (>70% del capital) — entrar con tramos pequeños.'
        : isLightlyExposed
        ? ' Posición leve — buena oportunidad para construir posición.'
        : '';
      return {
        action: 'BUY',
        strength: 'fuerte',
        reason: isDca
          ? `Precio por debajo del promedio de compra${pnlTag}${allocationLine}`
          : `Risk ON + zona de compra + ${cashPercent}% cash disponible${pnlTag}${allocationLine}`,
        recommendation: isDca
          ? `Oportunidad de DCA: el precio está ${Math.abs(pnlPercent).toFixed(1)}% por debajo de tu promedio (${formatPrice(avgBuyPrice)}). Acumular en tramos reduce el precio promedio.${concentrationNote}${rrLine}`
          : `Acumulación progresiva. Dividir entrada en 2-3 tramos para promediar precio.${concentrationNote}${rrLine}`,
        operations: ops
      };
    }

    // SELL zone: solo si la ganancia realmente lo justifica
    if (currentZone === 'sell') {
      if (sellMakesSense) {
        const pctSell = isStrongProfit ? 50 : 30;
        const ops = generateSellOperations(currentPrice, zones, totalCapital, 'inversion');
        return {
          action: 'SELL',
          strength: isStrongProfit ? 'fuerte' : 'moderado',
          reason: `Zona de distribución con ganancia significativa${pnlTag}${allocationLine}`,
          recommendation: `Toma de ganancias parcial recomendada: ${pctSell}% de la posición. Mantener el resto como núcleo de largo plazo. No salir completamente.${rrLine}`,
          operations: ops
        };
      }

      // Zona de venta pero la ganancia no justifica vender todavía
      const gapTo25 = pnlPercent !== null ? (25 - pnlPercent).toFixed(1) : null;
      return {
        action: 'WAIT',
        strength: 'moderado',
        reason: pnlPercent !== null
          ? `Zona de distribución — ganancia aún insuficiente para vender${pnlTag}${allocationLine}`
          : `Zona de distribución — sin datos de portfolio para evaluar${noPortfolioMsg}`,
        recommendation: gapTo25
          ? `Mantener posición. El precio debería subir un ${gapTo25}% adicional desde tu promedio para considerar toma de ganancias.${rrLine}`
          : 'Mantener posición. Registra tus operaciones para ver cuándo tiene sentido vender.',
        operations: []
      };
    }

    // Zona neutral con ganancia moderada: solo esperar
    return {
      action: 'WAIT',
      strength: 'débil',
      reason: `Precio en zona neutral${pnlTag}${allocationLine}`,
      recommendation: `Mantener posición y aguardar. Acumular si baja a ${formatPrice(zones.buy.min)} – ${formatPrice(zones.buy.max)}.${noPortfolioMsg}${rrLine}`,
      operations: []
    };
  }

  // ── Neutral ────────────────────────────────────────────────────────────────
  if (marketMode.mode === 'neutral') {

    // DCA incluso en contexto neutral si el precio está muy por debajo del promedio
    const strongDca = isBelowAvg && pnlPercent < -8 && cashPercent >= 30;
    const normalBuy = currentZone === 'buy' && cashPercent >= 50;

    if (strongDca || normalBuy) {
      const ops = generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, 'inversion', 0.5);
      return {
        action: 'BUY',
        strength: 'moderado',
        reason: strongDca
          ? `Precio ${Math.abs(pnlPercent).toFixed(1)}% por debajo del promedio${pnlTag} — contexto mixto pero DCA válido`
          : `Zona de soporte con cash suficiente (${cashPercent}%)${pnlTag}`,
        recommendation: 'Entrada reducida — máximo 50% del capital previsto. Contexto incierto, dividir en tramos.',
        operations: ops
      };
    }

    if (currentZone === 'sell' && sellMakesSense) {
      const ops = generateSellOperations(currentPrice, zones, totalCapital, 'inversion');
      return {
        action: 'SELL',
        strength: 'moderado',
        reason: `Zona de distribución con ganancia significativa${pnlTag}`,
        recommendation: 'Toma parcial de ganancias (30% de la posición). Contexto mixto — no salir completamente.',
        operations: ops
      };
    }

    return {
      action: 'WAIT',
      strength: 'moderado',
      reason: `Contexto neutral${pnlTag}`,
      recommendation: `Mantener posición. Sin oportunidad clara de entrada.${noPortfolioMsg}`,
      operations: []
    };
  }

  return {
    action: 'WAIT',
    strength: 'débil',
    reason: 'Sin condiciones claras',
    recommendation: 'Monitorear.',
    operations: []
  };
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
