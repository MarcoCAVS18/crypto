// Colores de DATOS (velas, donut, evolución). Validados con la guía de visualización: ver DonutChart.jsx.
// El color sigue a la ENTIDAD (cada activo siempre el mismo), no a su posición.
export const ENTITY_COLORS = { PAXG: '#3b9fd1', BTC: '#2da84a', ETH: '#e0468a' };
export const FALLBACK_COLORS = ['#3b9fd1', '#2da84a', '#e0468a'];
export const entityColor = (symbol, i = 0) => ENTITY_COLORS[symbol] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];

export const CANDLE_UP = '#2da84a';
export const CANDLE_DOWN = '#e0468a';
export const CHART_GRID = 'rgba(255,255,255,0.05)';     // hairline recesivo (1 px, continuo)
export const CHART_TEXT = '#66736b';
