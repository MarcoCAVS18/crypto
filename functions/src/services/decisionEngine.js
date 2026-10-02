// Motor de decisión: cruza market mode, zonas, indicadores y perfil del usuario

import { dcaCapFraction, tiltNote, DCA_POLICY } from './dcaPolicy.js';
import { applyCosts, costNote } from './costModel.js';
import { weightState, trimPctToBand } from './portfolioPolicy.js';
import { evaluateExit } from './exitPolicy.js';

/**
 * @param {object} marketMode      - { mode: 'risk_on'|'neutral'|'risk_off', score, reasons }
 * @param {object} zones           - { buy, neutral, sell, currentZone }
 * @param {number} currentPrice
 * @param {object} userState       - { cashPercent, mode, totalCapital }
 * @param {object} indicators      - { rsi, atr, ema, trendShort, trendLong }
 * @param {string} symbol          - e.g. 'BTC', 'PAXG'
 * @param {object|null} portfolioContext - { units, avgBuyPrice, costBasis, hasPosition, ... }
 * @param {object} meta            - { candlesSource: 'real'|'stale'|'synthetic' }
 */
export function makeDecision(marketMode, zones, currentPrice, userState, indicators = {}, symbol = '', portfolioContext = null, meta = {}) {
  const { cashPercent, mode: userMode, totalCapital = 0 } = userState;
  const { rsi = 50 } = indicators;

  // Nunca operar con datos sintéticos: son aleatorios, no mercado.
  if (meta?.candlesSource === 'synthetic') {
    return {
      action: 'WAIT',
      strength: 'fuerte',
      reason: 'Datos de mercado no confiables (velas sintéticas)',
      recommendation: 'No se pudieron obtener las velas reales del exchange. Refrescá en unos minutos; no operes con esta señal.',
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

  // Risk OFF en modo trading = esperar. En inversión lo resuelve decideInversionMode,
  // que puede recomendar un recorte si hay ganancia y zona de distribución.
  if (marketMode.mode === 'risk_off' && userMode === 'trading') {
    return riskOffWait(marketMode);
  }

  const result = userMode === 'trading'
    // --- MODO TRADING: más agresivo, usa RSI como confirmación adicional ---
    ? decideTradingMode(marketMode, zones, currentPrice, cashPercent, rsi, totalCapital, portfolioContext, symbol)
    // --- MODO INVERSIÓN: conservador, largo plazo, usa P&L real del portfolio ---
    : decideInversionMode(marketMode, zones, currentPrice, cashPercent, rsi, totalCapital, portfolioContext, indicators, symbol, { target: userState.target ?? null, pullback: meta?.pullback ?? null });

  // Sin cash suficiente no se COMPRA (y el motivo relevante es ese). Las ventas siempre se
  // permiten (liberan cash): antes este gate bloqueaba también las salidas.
  if (result.action !== 'SELL' && cashPercent < 10) {
    return {
      action: 'WAIT',
      strength: 'fuerte',
      reason: 'Sin cash suficiente para operar',
      recommendation: 'Espera a tener al menos 10% de cash disponible antes de considerar nuevas posiciones',
      operations: []
    };
  }

  const { action, strength, reason, recommendation, operations, policy } = result;

  // Costos: se anota el costo estimado de cada orden y se descartan tramos que no llegan al mínimo.
  if ((action === 'BUY' || action === 'SELL') && operations?.length) {
    const costed = applyCosts(operations, userState.costs);
    if (costed.operations.length === 0) {
      return {
        action: 'WAIT', strength: 'débil',
        reason: 'Monto demasiado chico para cubrir costos',
        recommendation: `Todos los tramos quedarían por debajo del mínimo de $${userState.costs?.minOrderUsd ?? 10}: la comisión se comería el beneficio. Esperá a juntar más efectivo.`,
        operations: []
      };
    }
    return { action, strength, reason, recommendation: recommendation + costNote(costed, userState.costs), operations: costed.operations, ...(policy ? { policy } : {}) };
  }
  return { action, strength, reason, recommendation, operations, ...(policy ? { policy } : {}) };
}

function riskOffWait(marketMode) {
  return {
    action: 'WAIT',
    strength: 'fuerte',
    reason: `Mercado en Risk OFF: ${(marketMode.reasons ?? []).join(', ')}`,
    recommendation: 'No operar hasta que el contexto mejore. Proteger capital existente.',
    operations: []
  };
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

function decideInversionMode(marketMode, zones, currentPrice, cashPercent, rsi, totalCapital, portfolioCtx = null, indicators = {}, symbol = '', ext = {}) {
  const currentZone = zones.currentZone;
  const isPaxg = symbol === 'PAXG';

  // ── Contexto macro PAXG (COT + real yield + goldScore) ─────────────────────
  // Estos datos modulan umbrales y recomendaciones solo para PAXG.
  const goldCtx        = isPaxg ? (marketMode.goldContext ?? null) : null;
  const goldScore      = isPaxg ? (marketMode.score ?? 0)         : 0;
  const cot            = goldCtx?.macro?.cot          ?? goldCtx?.cot          ?? null;
  const realYield      = goldCtx?.macro?.realYield    ?? goldCtx?.realYield    ?? null;
  const gvz            = goldCtx?.macro?.gvz          ?? goldCtx?.gvz          ?? null;
  const goldSilverRatio = goldCtx?.goldSilverRatio    ?? null;
  const dailyBias      = goldCtx?.macro?.dailyBias    ?? goldCtx?.dailyBias    ?? null;

  // ── Contexto del portfolio ──────────────────────────────────────────────────
  const executedBuys = portfolioCtx?.executedBuys ?? [];
  const hasPosition = portfolioCtx?.hasPosition ?? false;
  const avgBuyPrice = portfolioCtx?.avgBuyPrice ?? 0;
  // Costo de lo que aún tenés (no el flujo neto: tras ventas netInvested deja de ser un costo)
  const netInvested = portfolioCtx?.costBasis ?? portfolioCtx?.netInvested ?? 0;
  const pnlPercent = hasPosition && avgBuyPrice > 0
    ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100
    : null;

  // Peso de la posición sobre el capital total.
  // Con 100 % de efectivo, el "capital total" cargado es SOLO el efectivo que se quiere invertir (p. ej. $200 de un portfolio de
  // $13k): medir el peso contra eso daba 100 % y bloqueaba toda compra. Entonces se mide, a valor de mercado, contra ese
  // efectivo + el valor de TODAS las posiciones (lo informa el cliente en `portfolioValueUsd`).
  const cashOnly = cashPercent >= 100;
  const allPositionsValue = Number(portfolioCtx?.portfolioValueUsd);
  const positionValue = cashOnly && portfolioCtx?.units > 0 && currentPrice > 0 ? portfolioCtx.units * currentPrice : netInvested;
  const capitalBase = cashOnly && allPositionsValue > 0 ? totalCapital + allPositionsValue : totalCapital;
  const allocationPercent = hasPosition && capitalBase > 0 && positionValue > 0
    ? Math.min((positionValue / capitalBase) * 100, 100)
    : null;
  // Sin tope de concentración: el usuario decide cuánto de su capital va a cada activo (puede ser 100 % PAXG). El peso solo
  // se informa; el único límite es el "peso objetivo" opcional que el propio usuario puede configurar (portfolioPolicy.js).
  const isLightlyExposed     = allocationPercent !== null && allocationPercent < 20;

  // R/R ratio usando ATR como medida de riesgo
  const atr = indicators?.atr ?? null;
  const atrPct = atr && currentPrice ? (atr / currentPrice) * 100 : null;
  const rrTarget = zones?.sell?.min ?? null;
  const rrStop   = zones?.buy?.min ?? null;
  let rrRatio = null;
  let rrLine  = '';
  // Solo con niveles de estructura real (swings). Cuando las zonas salen solo del ATR el
  // cociente es un artefacto de los multiplicadores 0.5/1.5 (siempre ≈0.33), no información.
  const structuralLevels = /Swing low|EMA/.test(zones?.buy?.reason ?? '') && /Swing high/.test(zones?.sell?.reason ?? '');
  if (structuralLevels && rrTarget && rrStop && currentPrice && rrTarget > currentPrice && rrStop < currentPrice) {
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

  // ── Flags derivados del P&L ────────────────────────────────────────────────
  // PAXG: umbrales más altos — el oro es reserva de valor, no para vender pronto.
  //   Sell mínimo: 30% (vs 25% para BTC/ETH)
  //   Sell fuerte:  45% (vs 40%)
  const sellMinPct    = isPaxg ? 30 : 25;
  const sellStrongPct = isPaxg ? 45 : 40;

  const isBelowAvg       = pnlPercent !== null && pnlPercent < 0;
  const isNearAvg        = pnlPercent !== null && pnlPercent >= 0            && pnlPercent < 15;
  const isModerateProfit = pnlPercent !== null && pnlPercent >= 15           && pnlPercent < sellMinPct;
  const isGoodProfit     = pnlPercent !== null && pnlPercent >= sellMinPct   && pnlPercent < sellStrongPct;
  const isStrongProfit   = pnlPercent !== null && pnlPercent >= sellStrongPct;
  const sellMakesSense   = isGoodProfit || isStrongProfit;

  // ── PAXG: tamaño del DCA (política respaldada por backtest, ver dcaPolicy.js) ──
  // Antes la fracción SEGUÍA al score (más capital con score alto) y se recortaba por COT/tasa real/GVZ/tendencia:
  // el backtest mostró que eso encarece el costo promedio, y esas señales ya forman parte del score (doble conteo).
  // Ahora: base fija con un tilt acotado a comprar más en la debilidad.
  const dcaPolicy = isPaxg ? dcaCapFraction(goldScore) : null;
  // Peso objetivo (opcional, solo PAXG): por debajo de la banda se acelera el DCA (×1.25, tope 100 %); por encima se frena (abajo)
  const weight = isPaxg ? weightState(allocationPercent ?? (totalCapital > 0 ? 0 : NaN), ext.target) : null;
  const bandBoost = weight?.state === 'below' ? 1.25 : 1;
  const paxgCapFraction = dcaPolicy ? Math.min(DCA_POLICY.maxFraction, dcaPolicy.capFraction * bandBoost) : 1.0;
  const bandNote = weight?.state === 'below'
    ? ` Peso del oro ${weight.allocationPercent.toFixed(0)} % por debajo de tu banda objetivo (${weight.target.lower.toFixed(0)}–${weight.target.upper.toFixed(0)} %): DCA acelerado ×1.25.` : '';
  const policyNote = (dcaPolicy ? tiltNote(dcaPolicy) : '') + bandNote;

  // ── PAXG: línea de contexto macro para recomendaciones ─────────────────────
  let macroLine = '';
  if (isPaxg && goldCtx) {
    const parts = [];
    if (cot?.sentiment === 'crowded_long')       parts.push('⚠️ COT muy largo → riesgo de corrección');
    else if (cot?.sentiment === 'contrarian_bull') parts.push('✓ COT extremo corto → señal contraria alcista');
    if (realYield?.sentiment === 'very_bullish')  parts.push(`✓ Tasa real ${realYield.value.toFixed(2)}% → entorno ideal`);
    else if (realYield?.sentiment === 'bearish')  parts.push(`⚠️ Tasa real ${realYield.value.toFixed(2)}% → presión bajista`);
    if (gvz?.value > 25)                          parts.push(`⚠️ GVZ ${gvz.value.toFixed(1)} → alta volatilidad`);
    if (dailyBias?.alignment === 'bear')          parts.push('⚠️ Tendencia diaria bajista → posición reducida');
    else if (dailyBias?.alignment === 'bull')     parts.push('✓ Tendencia diaria alcista');
    if (goldSilverRatio != null && goldSilverRatio > 90) parts.push(`⚠️ Ratio Oro/Plata ${goldSilverRatio} → cautela`);
    if (parts.length) macroLine = ` · ${parts.join(' · ')}`;
  }

  // Etiqueta de contexto para incluir en mensajes
  const pnlTag = pnlPercent !== null
    ? ` · promedio de compra ${formatPrice(avgBuyPrice)}, P&L actual ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`
    : ' · Registra tu portfolio para que la decisión use tu precio promedio real.';

  const noPortfolioMsg = !hasPosition
    ? ' Registra tus operaciones en el Portfolio para que la decisión use tu promedio de compra real.'
    : '';


  // ── Peso objetivo: por encima de la banda no se compra más y se rebalancea (solo con ganancia) ─────────
  if (weight?.state === 'above') {
    const trimPct = trimPctToBand(weight.allocationPercent, weight.target);
    if (pnlPercent !== null && pnlPercent >= 0 && trimPct > 0) {
      return {
        action: 'SELL', strength: 'moderado',
        reason: `Rebalanceo: el oro pesa ${weight.allocationPercent.toFixed(0)} % de tu capital, sobre la banda objetivo (${weight.target.lower.toFixed(0)}–${weight.target.upper.toFixed(0)} %)${pnlTag}`,
        recommendation: `Recorte parcial de ${trimPct} % de la posición para volver hacia el ${weight.target.targetPercent.toFixed(0)} % objetivo. No es una señal de mercado: es disciplina de portafolio.${macroLine}`,
        operations: generateSellOperations(currentPrice, zones, totalCapital, 'inversion', { pct: trimPct, keepCore: true })
      };
    }
    return {
      action: 'WAIT', strength: 'moderado',
      reason: `El oro pesa ${weight.allocationPercent.toFixed(0)} % de tu capital, sobre la banda objetivo (${weight.target.lower.toFixed(0)}–${weight.target.upper.toFixed(0)} %)${pnlTag}`,
      recommendation: 'No sumar más oro hasta volver a la banda. Con la posición en pérdida no se recorta solo por rebalancear.',
      operations: []
    };
  }

  // ── Salidas por régimen (PAXG): rotura de tendencia + macro adverso, o sobre-extensión ─────────────
  const exit = isPaxg ? evaluateExit({ pnlPercent, score: goldScore, dailyBias }) : null;
  if (exit && !(currentZone === 'sell' && sellMakesSense)) {
    return {
      action: 'SELL', strength: exit.strength,
      reason: `${exit.reason}${allocationLine}`,
      recommendation: `Recorte parcial de ${exit.pct} % de la posición; se conserva el núcleo (el oro es reserva de valor).${macroLine}${rrLine}`,
      operations: generateSellOperations(currentPrice, zones, totalCapital, 'inversion', { pct: exit.pct, keepCore: true })
    };
  }

  // ── Risk OFF (inversión): no se compra; se recorta solo si hay ganancia y zona de venta ──
  if (marketMode.mode === 'risk_off') {
    if (currentZone === 'sell' && sellMakesSense) {
      const pctSell = isStrongProfit ? 50 : 30;
      const paxgSellNote = isPaxg
        ? ` El oro es reserva de valor — mantener al menos el ${100 - pctSell}% de la posición como núcleo.`
        : '';
      return {
        action: 'SELL',
        strength: isStrongProfit ? 'fuerte' : 'moderado',
        reason: `Macro adverso (Risk OFF) + zona de distribución con ganancia significativa${pnlTag}${allocationLine}`,
        recommendation: `Recorte parcial recomendado: ${pctSell}% de la posición. Con el entorno en contra conviene asegurar ganancias.${paxgSellNote} No salir completamente.${macroLine}${rrLine}`,
        operations: generateSellOperations(currentPrice, zones, totalCapital, 'inversion', { pct: pctSell, keepCore: isPaxg })
      };
    }
    // PAXG (acumulación): el backtest mostró que NO comprar cuando el score es bajo encareció el costo promedio
    // (y que comprar más en esos momentos lo abarató). Se sigue acumulando en zona de compra o bajo el promedio,
    // sin tope por concentración (decisión del usuario); el tamaño lo fija la política de DCA (más peso a la debilidad, acotado).
    if (isPaxg && (currentZone === 'buy' || isBelowAvg)) {
      // Quiere acumular: si algo lo frena, se dice QUÉ (antes todo caía en un genérico "Mercado en Risk OFF" y no se
      // entendía por qué no compraba aunque el precio estuviera bien por debajo del promedio).
      const blocked = (why, tip) => ({
        action: 'WAIT', strength: 'moderado',
        reason: `${why}${pnlTag}`,
        recommendation: `${tip}${macroLine}`,
        operations: []
      });
      if (cashPercent < 30) {
        return blocked(
          `Efectivo ${cashPercent} %: con el contexto en Risk OFF se pide al menos 30 % para seguir acumulando`,
          'Si ese porcentaje no refleja tu efectivo real, ajustalo en "Tu posición".'
        );
      }
      const ops = generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, 'inversion', paxgCapFraction, executedBuys, symbol, ext.pullback);
      if (ops.length > 0) {
        return {
          action: 'BUY',
          strength: 'moderado',
          reason: `PAXG en Risk OFF: se sigue acumulando la debilidad (DCA) — no comprar en estos momentos encareció el costo promedio en el backtest${pnlTag}${allocationLine}`,
          recommendation: `Acumulación en tramos con tamaño acotado. El score bajo no es motivo para frenar el DCA del oro; sí para no apurarse: usá los tramos escalonados.${policyNote}${macroLine}${rrLine}`,
          operations: ops,
          policy: dcaPolicy
        };
      }
      return blocked(
        'Ya registraste compras en los últimos 4 días a los niveles de los tramos de este ciclo (±1.5 %)',
        'Esperá a que el precio baje a otro nivel o a que pasen unos días: promediar varias veces al mismo precio no mejora el costo base.'
      );
    }
    if (isPaxg) {
      return {
        ...riskOffWait(marketMode),
        reason: `Mercado en Risk OFF: ${(marketMode.reasons ?? []).join(', ')} · el precio está por encima de tu promedio y fuera de la zona de compra`
      };
    }
    return riskOffWait(marketMode);
  }

  // ── PAXG en neutral: permitir DCA si el macro es muy favorable ────────────
  // El oro actúa como reserva de valor; un contexto macro alcista justifica
  // acumular aunque el market mode técnico sea neutro.
  if (isPaxg && marketMode.mode === 'neutral') {
    const macroFavorable =
      (cot?.sentiment === 'contrarian_bull' ||
       realYield?.sentiment === 'very_bullish' ||
       realYield?.sentiment === 'bullish') &&
      dailyBias?.alignment !== 'bear';  // no entrar si el diario es claramente bajista

    if (macroFavorable && (isBelowAvg || currentZone === 'buy') && cashPercent >= 30) {
      const capFrac = paxgCapFraction * 0.60; // entrada conservadora en contexto mixto
      const ops = generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, 'inversion', capFrac, executedBuys, symbol, ext.pullback);
      return {
        action: 'BUY',
        strength: 'moderado',
        reason: `PAXG: macro favorable en contexto técnico neutro${pnlTag}${macroLine}`,
        recommendation: `Entrada reducida (60% del plan) aprovechando soporte macro. El entorno fundamental del oro justifica acumular pese al contexto técnico mixto.${macroLine}${rrLine}`,
        operations: ops
      };
    }
  }

  // ── Risk ON ────────────────────────────────────────────────────────────────
  if (marketMode.mode === 'risk_on') {

    // BUY: zona de compra, O precio debajo del promedio (DCA) → siempre acumular
    const dcaOpportunity = isBelowAvg && cashPercent >= 20;
    const buyZoneOk      = currentZone === 'buy' && cashPercent >= 30;

    if (buyZoneOk || dcaOpportunity) {
      const ops = generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, 'inversion', paxgCapFraction, executedBuys, symbol, ext.pullback);
      const isDca = dcaOpportunity && !buyZoneOk;
      const concentrationNote = isLightlyExposed
        ? ' Posición leve — buena oportunidad para construir posición.'
        : '';

      // Todos los tramos del ciclo actual ya fueron ejecutados a precios similares.
      // Si ya compraste HOY a este nivel, no repetir la misma sugerencia —
      // reconocer la compra y sugerir esperar corrección.
      // Si no hay compra de hoy, ofrecer acumulación adicional pequeña (20%).
      if (ops.length === 0) {
        const todayUTC = new Date().toISOString().slice(0, 10);
        const boughtTodayHere = executedBuys.some(b => {
          if (!b.date || !b.price) return false;
          const buyDate = new Date(b.date).toISOString().slice(0, 10);
          return buyDate === todayUTC && Math.abs(b.price - currentPrice) / currentPrice < 0.015;
        });

        if (boughtTodayHere) {
          return {
            action: 'WAIT',
            strength: 'débil',
            reason: `Ya compraste hoy a este nivel de precio${pnlTag}${allocationLine}`,
            recommendation: `Ejecutaste una compra hoy a un precio similar al actual. El contexto sigue favorable — pero promediar varias veces el mismo día al mismo precio no mejora el costo base. Esperá una corrección antes de acumular de nuevo.${concentrationNote}${macroLine}${rrLine}`,
            operations: []
          };
        }

        const capitalDisponible = totalCapital > 0 ? totalCapital * (cashPercent / 100) : 0;
        const addlAmount = capitalDisponible * 0.20;
        const addlOp = addlAmount > 0 ? [{
          level: 1,
          type: 'BUY',
          label: 'Acumulación adicional — ciclo DCA completo',
          price: currentPrice,
          usdAmount: Math.round(addlAmount),
          units: addlAmount / currentPrice,
          percentage: 20
        }] : [];
        return {
          action: 'BUY',
          strength: 'débil',
          reason: `Ciclo DCA completo — acumulación adicional disponible${pnlTag}${allocationLine}`,
          recommendation: `El plan de tramos de este ciclo ya fue ejecutado. Podés seguir acumulando en pequeñas porciones (20% del capital disponible) si el contexto se mantiene favorable.${concentrationNote}${macroLine}${rrLine}`,
          operations: addlOp
        };
      }

      return {
        action: 'BUY',
        strength: 'fuerte',
        reason: isDca
          ? `Precio por debajo del promedio de compra${pnlTag}${allocationLine}`
          : `Risk ON + zona de compra + ${cashPercent}% cash disponible${pnlTag}${allocationLine}`,
        recommendation: isDca
          ? `Oportunidad de DCA: el precio está ${Math.abs(pnlPercent).toFixed(1)}% por debajo de tu promedio (${formatPrice(avgBuyPrice)}). Acumular en tramos reduce el precio promedio.${concentrationNote}${policyNote}${macroLine}${rrLine}`
          : `Acumulación progresiva. Dividir entrada en 2-3 tramos para promediar precio.${concentrationNote}${policyNote}${macroLine}${rrLine}`,
        operations: ops,
        policy: dcaPolicy
      };
    }

    // SELL zone: solo si la ganancia realmente lo justifica
    if (currentZone === 'sell') {
      if (sellMakesSense) {
        const pctSell = isStrongProfit ? 50 : 30;
        const ops = generateSellOperations(currentPrice, zones, totalCapital, 'inversion', { pct: pctSell, keepCore: isPaxg });
        const paxgSellNote = isPaxg
          ? ` El oro es reserva de valor — mantener al menos el ${100 - pctSell}% de la posición como núcleo.`
          : '';
        return {
          action: 'SELL',
          strength: isStrongProfit ? 'fuerte' : 'moderado',
          reason: `Zona de distribución con ganancia significativa${pnlTag}${allocationLine}`,
          recommendation: `Toma de ganancias parcial recomendada: ${pctSell}% de la posición.${paxgSellNote} No salir completamente.${macroLine}${rrLine}`,
          operations: ops
        };
      }

      // Zona de venta pero la ganancia no justifica vender todavía
      const gapToSell = pnlPercent !== null ? Math.max(0, sellMinPct - pnlPercent).toFixed(1) : null;
      return {
        action: 'WAIT',
        strength: 'moderado',
        reason: pnlPercent !== null
          ? `Zona de distribución — ganancia aún insuficiente para vender${pnlTag}${allocationLine}`
          : `Zona de distribución — sin datos de portfolio para evaluar${noPortfolioMsg}`,
        recommendation: gapToSell
          ? `Mantener posición. El precio debería subir un ${gapToSell}% adicional desde tu promedio para considerar toma de ganancias.${rrLine}`
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
      const ops = generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, 'inversion', isPaxg ? paxgCapFraction : 0.5, executedBuys, symbol, ext.pullback);
      return {
        action: 'BUY',
        strength: 'moderado',
        reason: strongDca
          ? `Precio ${Math.abs(pnlPercent).toFixed(1)}% por debajo del promedio${pnlTag} — contexto mixto pero DCA válido`
          : `Zona de soporte con cash suficiente (${cashPercent}%)${pnlTag}`,
        recommendation: `Entrada reducida — máximo ${Math.round((isPaxg ? paxgCapFraction : 0.5) * 100)}% del capital previsto. Contexto incierto, dividir en tramos.${policyNote}${macroLine}`,
        operations: ops,
        policy: dcaPolicy
      };
    }

    if (currentZone === 'sell' && sellMakesSense) {
      const ops = generateSellOperations(currentPrice, zones, totalCapital, 'inversion', { pct: 30, keepCore: isPaxg });
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
function decideTradingMode(marketMode, zones, currentPrice, cashPercent, rsi, totalCapital, portfolioCtx = null, symbol = '') {
  const currentZone = zones.currentZone;
  const rsiOversold = rsi < 35;
  const rsiOverbought = rsi > 65;
  const executedBuys = portfolioCtx?.executedBuys ?? [];

  if (marketMode.mode === 'risk_on') {
    // Compra fuerte: zona compra O RSI muy sobrevendido con cash suficiente
    if ((currentZone === 'buy' || rsiOversold) && cashPercent >= 20) {
      const ops = generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, 'trading', 1.0, executedBuys, symbol);
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
      const ops = generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, 'trading', 0.4, executedBuys, symbol);
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
 * Genera una lista de órdenes de compra escalonadas, filtrando niveles ya
 * ejecutados según compras registradas en el portfolio (tolerancia ±1.5%).
 *
 * @param {number} capitalFraction - fracción del capital disponible a usar (0-1)
 * @param {Array}  executedBuys    - [{ price, amount_usd }] del portfolio
 */
function generateBuyOperations(currentPrice, zones, cashPercent, totalCapital, mode, capitalFraction = 1.0, executedBuys = [], symbol = '', pullback = null) {
  const capitalDisponible = totalCapital > 0 ? totalCapital * (cashPercent / 100) : 0;
  const capitalAUsar = capitalDisponible * capitalFraction;
  const hasCapital = capitalAUsar > 0;

  // PAXG se mueve menos que BTC/ETH: nivel 2 a -1.5% (no -2%)
  const isPaxg = symbol === 'PAXG';
  const level1Price = currentPrice;
  // Si hay niveles de retroceso HISTÓRICOS del propio activo (pullbacks.js) se usan en vez de los porcentajes fijos
  const level2Price = pullback ? currentPrice * (1 - pullback.l2Pct / 100) : currentPrice * (isPaxg ? 0.985 : 0.98);
  // El último tramo nunca puede quedar por encima del segundo: en zonas derivadas del ATR
  // buy.min queda a ~−0.3 % y el "mínimo de zona" resultaba más alto que el tramo −1.5 %.
  const level3Price = pullback
    ? Math.min(zones.buy.min, currentPrice * (1 - pullback.l3Pct / 100))
    : Math.min(zones.buy.min, level2Price * (isPaxg ? 0.99 : 0.985));

  // Devuelve true si ya existe una compra registrada a ±1.5% del precio del tramo
  const alreadyDone = (tramoPx) =>
    executedBuys.some(b => b.price > 0 && Math.abs(b.price - tramoPx) / tramoPx < 0.015);

  const TRAMO_LABELS = ['Primer', 'Segundo', 'Tercer'];

  if (mode === 'trading') {
    const candidates = [
      buildBuyOp(0, 'Entrada táctica ahora', level1Price, capitalAUsar * 0.5, hasCapital, 50),
      buildBuyOp(0, `Si corrige a ${formatPrice(level2Price)}`, level2Price, capitalAUsar * 0.5, hasCapital, 50)
    ];
    const pending = candidates.filter(op => !alreadyDone(op.price));
    return pending.map((op, i) => ({ ...op, level: i + 1 }));
  }

  // Inversión: 3 o 2 niveles según cash disponible
  const candidates = cashPercent >= 60
    ? [
        buildBuyOp(0, 'tramo — ahora', level1Price, capitalAUsar * 0.30, hasCapital, 30),
        buildBuyOp(0, `tramo — si baja a ${formatPrice(level2Price)}`, level2Price, capitalAUsar * 0.30, hasCapital, 30),
        buildBuyOp(0, `tramo — nivel profundo (${formatPrice(level3Price)})`, level3Price, capitalAUsar * 0.40, hasCapital, 40)
      ]
    : [
        buildBuyOp(0, 'tramo — ahora', level1Price, capitalAUsar * 0.40, hasCapital, 40),
        buildBuyOp(0, `tramo — si baja a ${formatPrice(level2Price)}`, level2Price, capitalAUsar * 0.60, hasCapital, 60)
      ];

  const pending = candidates.filter(op => !alreadyDone(op.price));
  // Renumerar y asignar etiqueta con ordinal correcto
  return pending.map((op, i) => ({
    ...op,
    level: i + 1,
    label: `${TRAMO_LABELS[i] ?? `Tramo ${i + 1}`} ${op.label}`
  }));
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

/**
 * @param {object} opts
 * @param {number} [opts.pct]       - % de la posición a vender ahora (default: 35 inversión / 70 trading)
 * @param {boolean} [opts.keepCore] - true: no ofrecer segunda venta (PAXG protege su núcleo)
 */
function generateSellOperations(currentPrice, zones, totalCapital, mode, opts = {}) {
  // Las operaciones de venta dependen de la posición real del usuario (portfolio)
  // Sin datos de posición, mostramos porcentajes de la posición actual
  const pct = opts.pct ?? (mode === 'trading' ? 70 : 35);
  const ops = [
    {
      level: 1,
      type: 'SELL',
      label: `Venta parcial ahora (${pct}% de posición)`,
      price: currentPrice,
      percentage: pct,
      usdAmount: null,
      units: null,
      note: 'Registra tu posición en el Portfolio para ver el monto exacto'
    }
  ];

  // Segunda toma: antes ofrecía vender "100 − pct" (¡el resto entero!) contradiciendo el
  // "no salir completamente". Ahora es la mitad de la primera, y ninguna en el núcleo protegido.
  if (!opts.keepCore) {
    const second = mode === 'trading' ? 100 - pct : Math.round(pct / 2);
    if (second > 0) {
      ops.push({
        level: 2,
        type: 'SELL',
        label: `Venta adicional si sube a ${formatPrice(zones.sell.max)} (${second}% de posición)`,
        price: zones.sell.max,
        percentage: second,
        usdAmount: null,
        units: null,
        note: 'Segundo objetivo'
      });
    }
  }
  return ops;
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
