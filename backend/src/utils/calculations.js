// Funciones matemáticas auxiliares

// Calcula el promedio de un array de números
export function average(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Calcula la desviación estándar
export function standardDeviation(arr) {
  if (!arr || arr.length === 0) return 0;
  const avg = average(arr);
  const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

// Calcula el cambio porcentual entre dos valores
export function percentChange(oldValue, newValue) {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

// Redondea a n decimales
export function roundTo(num, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

// Formatea un número como precio
export function formatPrice(price, decimals = 2) {
  if (price >= 1000) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// Clamp un valor entre min y max
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Normaliza un valor a un rango 0-1
export function normalize(value, min, max) {
  if (max === min) return 0;
  return (value - min) / (max - min);
}
