// Determina el contexto general del mercado (Risk ON/OFF/Neutral)

// Determina el modo del mercado basado en indicadores
export function determineMarketMode(price, indicators, volumeAnalysis, multiTimeframeData = null) {
  const reasons = [];
  let score = 0; // Positivo = Risk ON, Negativo = Risk OFF

  // Verificar precio vs EMA200
  if (indicators.ema.ema200) {
    if (price > indicators.ema.ema200) {
      score += 2;
      reasons.push('Precio sobre EMA200');
    } else {
      score -= 2;
      reasons.push('Precio bajo EMA200');
    }
  }

  // Verificar tendencia con EMA50
  if (indicators.ema.ema50) {
    if (price > indicators.ema.ema50) {
      score += 1;
      reasons.push('Precio sobre EMA50');
    } else {
      score -= 1;
    }
  }

  // Verificar ATR (volatilidad)
  // ATR alto puede ser peligroso
  const atrPercent = (indicators.atr / price) * 100;
  if (atrPercent > 5) {
    score -= 2;
    reasons.push('Volatilidad muy alta');
  } else if (atrPercent > 3) {
    score -= 1;
    reasons.push('Volatilidad elevada');
  } else if (atrPercent < 1.5) {
    score += 1;
    reasons.push('Volatilidad controlada');
  }

  // Verificar volumen
  if (volumeAnalysis.status === 'muy_alto') {
    // Volumen muy alto puede ser señal de cambio
    reasons.push('Volumen extremo');
  } else if (volumeAnalysis.status === 'creciendo') {
    score += 1;
    reasons.push('Volumen creciente');
  } else if (volumeAnalysis.status === 'muy_bajo') {
    score -= 1;
    reasons.push('Volumen muy bajo');
  }

  // Verificar RSI
  if (indicators.rsi > 70) {
    score -= 1;
    reasons.push('RSI en sobrecompra');
  } else if (indicators.rsi < 30) {
    score -= 1;
    reasons.push('RSI en sobreventa');
  } else if (indicators.rsi >= 40 && indicators.rsi <= 60) {
    score += 1;
    reasons.push('RSI equilibrado');
  }

  // Determinar modo basado en score
  let mode, color;
  if (score >= 3) {
    mode = 'risk_on';
    color = 'green';
  } else if (score <= -2) {
    mode = 'risk_off';
    color = 'red';
  } else {
    mode = 'neutral';
    color = 'yellow';
  }

  return {
    mode: mode,
    color: color,
    score: score,
    reasons: reasons
  };
}

// Obtiene el texto descriptivo del modo
export function getModeDescription(mode) {
  const descriptions = {
    risk_on: 'Contexto favorable para operaciones. Tendencia alcista con volatilidad controlada.',
    neutral: 'Contexto mixto. Se recomienda precaución y esperar confirmación.',
    risk_off: 'Contexto desfavorable. Alta volatilidad o tendencia bajista. Evitar nuevas posiciones.'
  };

  return descriptions[mode] || 'Estado desconocido';
}
