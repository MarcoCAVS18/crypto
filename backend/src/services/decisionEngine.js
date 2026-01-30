// Motor de decisión final que cruza todos los datos

// Tabla de decisión basada en market mode, zona de precio y cash disponible
export function makeDecision(marketMode, zones, currentPrice, userState) {
  const { cashPercent, mode: userMode } = userState;
  const currentZone = zones.currentZone;

  let action, strength, reason, recommendation;

  // Sin cash suficiente = esperar siempre
  if (cashPercent < 10) {
    return {
      action: 'WAIT',
      strength: 'fuerte',
      reason: 'Sin cash suficiente para operar',
      recommendation: 'Espera a tener al menos 10% de cash disponible antes de considerar nuevas posiciones'
    };
  }

  // Risk OFF = esperar siempre
  if (marketMode.mode === 'risk_off') {
    return {
      action: 'WAIT',
      strength: 'fuerte',
      reason: `Mercado en Risk OFF: ${marketMode.reasons.join(', ')}`,
      recommendation: 'No operar hasta que el contexto mejore. Proteger capital existente.'
    };
  }

  // Lógica según market mode y zona
  if (marketMode.mode === 'risk_on') {
    if (currentZone === 'buy' && cashPercent >= 30) {
      action = 'BUY';
      strength = 'fuerte';
      reason = `Contexto Risk ON + precio en zona de compra + ${cashPercent}% cash disponible`;
      recommendation = generateBuyRecommendation(zones, currentPrice, cashPercent);
    } else if (currentZone === 'sell') {
      action = 'SELL';
      strength = 'moderado';
      reason = 'Precio en zona de venta con contexto favorable';
      recommendation = 'Considerar toma de ganancias parcial (25-50% de la posición)';
    } else {
      action = 'WAIT';
      strength = 'débil';
      reason = 'Precio en zona neutral';
      recommendation = `Esperar retroceso a zona de compra (${formatPrice(zones.buy.min)} - ${formatPrice(zones.buy.max)})`;
    }
  } else if (marketMode.mode === 'neutral') {
    if (currentZone === 'buy' && cashPercent >= 50) {
      action = 'BUY';
      strength = 'moderado';
      reason = `Precio en soporte con cash suficiente (${cashPercent}%), pero contexto mixto`;
      recommendation = 'Compra reducida (máximo 50% del cash previsto). Ser conservador.';
    } else if (currentZone === 'sell') {
      action = 'WAIT';
      strength = 'moderado';
      reason = 'Zona de venta pero sin contexto claro';
      recommendation = 'Considerar reducir exposición si hay ganancias importantes';
    } else {
      action = 'WAIT';
      strength = 'moderado';
      reason = 'Contexto neutral + zona neutral';
      recommendation = 'Esperar confirmación de dirección del mercado';
    }
  }

  // Ajustar según modo del usuario
  if (userMode === 'observacion') {
    action = 'WAIT';
    strength = 'fuerte';
    reason = 'Usuario en modo observación';
    recommendation = 'Solo monitorear. No ejecutar operaciones.';
  }

  return { action, strength, reason, recommendation };
}

// Genera recomendación específica de compra escalonada
function generateBuyRecommendation(zones, currentPrice, cashPercent) {
  const buyZoneMin = zones.buy.min;
  const buyZoneMax = zones.buy.max;

  // Calcular niveles de entrada escalonada
  const level1 = currentPrice;
  const level2 = currentPrice * 0.98; // -2%
  const level3 = buyZoneMin;

  const parts = [];

  if (cashPercent >= 60) {
    parts.push(`30% ahora a ${formatPrice(level1)}`);
    parts.push(`30% si baja a ${formatPrice(level2)}`);
    parts.push(`40% en mínimo de zona (${formatPrice(level3)})`);
  } else {
    parts.push(`40% ahora a ${formatPrice(level1)}`);
    parts.push(`60% si baja a ${formatPrice(level2)}`);
  }

  return `Compra escalonada: ${parts.join(', ')}`;
}

// Formatea precio con separadores de miles
function formatPrice(price) {
  if (price >= 1000) {
    return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Evalúa la fuerza de la señal de 0 a 100
export function evaluateSignalStrength(marketMode, zones, currentPrice, cashPercent) {
  let score = 50; // Base

  // Ajustar por market mode
  if (marketMode.mode === 'risk_on') score += 20;
  else if (marketMode.mode === 'risk_off') score -= 30;

  // Ajustar por zona
  if (zones.currentZone === 'buy') score += 15;
  else if (zones.currentZone === 'sell') score -= 10;

  // Ajustar por cash
  if (cashPercent >= 50) score += 10;
  else if (cashPercent < 20) score -= 15;

  return Math.max(0, Math.min(100, score));
}
