// Calcula zonas dinámicas de compra/neutral/venta

// Calcula las zonas basadas en precio, indicadores técnicos y swing points
export function calculateZones(price, candles, indicators) {
  const { atr, ema, swingPoints } = indicators;

  // Calcular porcentaje de ATR respecto al precio
  const atrPercent = atr / price;

  // Buscar último swing low confirmado
  const recentSwingLows = swingPoints.swingLows.slice(-3);
  const lastSwingLow = recentSwingLows.length > 0
    ? recentSwingLows[recentSwingLows.length - 1]
    : null;

  // Buscar último swing high confirmado
  const recentSwingHighs = swingPoints.swingHighs.slice(-3);
  const lastSwingHigh = recentSwingHighs.length > 0
    ? recentSwingHighs[recentSwingHighs.length - 1]
    : null;

  // Calcular zona de compra
  let buyZone = calculateBuyZone(price, atrPercent, lastSwingLow, ema);

  // Calcular zona de venta
  let sellZone = calculateSellZone(price, atrPercent, lastSwingHigh, indicators.rsi);

  // Zona neutral es lo que queda entre compra y venta
  const neutralZone = {
    min: buyZone.max,
    max: sellZone.min
  };

  return {
    buy: buyZone,
    neutral: neutralZone,
    sell: sellZone,
    currentZone: determineCurrentZone(price, buyZone, neutralZone, sellZone)
  };
}

// Calcula la zona de compra
function calculateBuyZone(price, atrPercent, lastSwingLow, ema) {
  // Rango base usando ATR
  const baseMin = price * (1 - (atrPercent * 1.5));
  const baseMax = price * (1 - (atrPercent * 0.5));

  let min = baseMin;
  let max = baseMax;
  let reasons = [];

  // Ajustar con swing low si existe
  if (lastSwingLow) {
    const swingLowPrice = lastSwingLow.price;
    // Si el swing low está dentro del rango esperado, usarlo como referencia
    if (swingLowPrice >= baseMin && swingLowPrice <= price) {
      min = Math.min(min, swingLowPrice * 0.98);
      max = Math.max(max, swingLowPrice * 1.02);
      reasons.push('Swing low reciente');
    }
  }

  // Verificar confluencia con EMA
  if (ema.ema100 && ema.ema100 >= min && ema.ema100 <= max) {
    reasons.push('Confluencia con EMA100');
  }
  if (ema.ema200 && ema.ema200 >= min && ema.ema200 <= max) {
    reasons.push('Confluencia con EMA200');
  }

  // Si no hay razones específicas, usar ATR
  if (reasons.length === 0) {
    reasons.push('Zona basada en ATR');
  }

  return {
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    reason: reasons.join(' + ')
  };
}

// Calcula la zona de venta
function calculateSellZone(price, atrPercent, lastSwingHigh, rsi) {
  // Rango base usando ATR
  const baseMin = price * (1 + (atrPercent * 0.5));
  const baseMax = price * (1 + (atrPercent * 1.5));

  let min = baseMin;
  let max = baseMax;
  let reasons = [];

  // Ajustar con swing high si existe
  if (lastSwingHigh) {
    const swingHighPrice = lastSwingHigh.price;
    // Si el swing high está cerca del rango esperado
    if (swingHighPrice >= price && swingHighPrice <= baseMax * 1.1) {
      min = Math.min(min, swingHighPrice * 0.98);
      max = Math.max(max, swingHighPrice * 1.02);
      reasons.push('Swing high previo');
    }
  }

  // Verificar RSI sobreventa
  if (rsi > 70) {
    reasons.push('RSI en sobrecompra');
  }

  // Si no hay razones específicas, usar ATR
  if (reasons.length === 0) {
    reasons.push('Zona basada en ATR');
  }

  return {
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    reason: reasons.join(' + ')
  };
}

// Determina en qué zona está el precio actual
function determineCurrentZone(price, buyZone, neutralZone, sellZone) {
  if (price <= buyZone.max) {
    return 'buy';
  } else if (price >= sellZone.min) {
    return 'sell';
  } else {
    return 'neutral';
  }
}

// Calcula la distancia porcentual a cada zona
export function calculateDistanceToZones(price, zones) {
  return {
    toBuyZone: ((zones.buy.max - price) / price) * 100,
    toSellZone: ((zones.sell.min - price) / price) * 100
  };
}
