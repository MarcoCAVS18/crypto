// Campos numéricos de la app: aceptan coma o punto decimal (en teclados en español el teclado numérico solo trae la coma;
// antes se descartaba y no se podían escribir decimales). Devuelve texto con punto decimal, apto para parseFloat.
//   "0,5" → "0.5" · "1.234,56" → "1234.56" · "1,234.56" → "1234.56" · "12abc" → "12" · "1.2.3" → "1.23"
export function sanitizeDecimal(raw) {
  let s = String(raw ?? '').replace(/[^0-9.,]/g, '');
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  const decimalAt = Math.max(lastDot, lastComma);
  if (decimalAt === -1) return s;
  // El último separador es el decimal; los anteriores son de miles (o repetidos) y se descartan.
  const intPart = s.slice(0, decimalAt).replace(/[.,]/g, '');
  const frac = s.slice(decimalAt + 1).replace(/[.,]/g, '');
  return `${intPart}.${frac}`;
}
