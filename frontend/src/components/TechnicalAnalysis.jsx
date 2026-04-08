// Panel de análisis técnico con indicadores reales
import { Card } from './ui/Card';
import { TrendingUp, TrendingDown, BarChart3, Activity, Gauge, LineChart } from 'lucide-react';

export function TechnicalAnalysis({ analysis }) {
  const { trendShort, trendLong, volumeStatus, volumeRatio, rsi, atr, atrPercent, ema20, ema50, ema200, vwap } = analysis;

  const metrics = [
    {
      label: 'Tendencia Corto (vs EMA20)',
      value: trendShort === 'alcista' ? 'Alcista' : 'Bajista',
      icon: trendShort === 'alcista' ? TrendingUp : TrendingDown,
      color: trendShort === 'alcista' ? 'text-green-400' : 'text-red-400',
      extra: ema20 ? `EMA20: ${formatPrice(ema20)}` : null
    },
    {
      label: 'Tendencia Largo (vs EMA200)',
      value: trendLong === 'alcista' ? 'Alcista' : 'Bajista',
      icon: trendLong === 'alcista' ? TrendingUp : TrendingDown,
      color: trendLong === 'alcista' ? 'text-green-400' : 'text-red-400',
      extra: ema200 ? `EMA200: ${formatPrice(ema200)}` : null
    },
    {
      label: 'RSI (14)',
      value: rsi?.toFixed(1) ?? 'N/A',
      icon: Activity,
      color: getRsiColor(rsi),
      extra: getRsiLabel(rsi)
    },
    {
      label: 'Volumen',
      value: getVolumeLabel(volumeStatus),
      icon: BarChart3,
      color: getVolumeColor(volumeStatus),
      extra: volumeRatio != null ? `Ratio: ×${volumeRatio}` : null
    },
    {
      label: 'ATR (Volatilidad)',
      value: atr ? formatPrice(atr) : 'N/A',
      icon: Gauge,
      color: getAtrColor(atrPercent),
      extra: atrPercent != null ? `${atrPercent}% del precio` : null
    },
    {
      label: 'EMA50',
      value: ema50 ? formatPrice(ema50) : 'N/A',
      icon: LineChart,
      color: 'text-gray-300',
      extra: vwap ? `VWAP: ${formatPrice(vwap)}` : null
    }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
      {metrics.map((metric, index) => (
        <Card key={index} className="p-3">
          <div className="flex items-start gap-2">
            <metric.icon className={`w-5 h-5 mt-0.5 shrink-0 ${metric.color}`} />
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-gray-500 leading-tight">{metric.label}</span>
              <span className={`font-semibold text-sm ${metric.color}`}>
                {metric.value}
              </span>
              {metric.extra && (
                <span className="text-xs text-gray-500 mt-0.5">{metric.extra}</span>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function getVolumeLabel(status) {
  const labels = {
    muy_alto: 'Muy Alto',
    creciendo: 'Creciendo',
    normal: 'Normal',
    decreciendo: 'Decreciendo',
    muy_bajo: 'Muy Bajo'
  };
  return labels[status] || 'N/A';
}

function getVolumeColor(status) {
  switch (status) {
    case 'muy_alto':
    case 'creciendo':
      return 'text-green-400';
    case 'muy_bajo':
    case 'decreciendo':
      return 'text-red-400';
    default:
      return 'text-gray-300';
  }
}

function getRsiColor(rsi) {
  if (!rsi) return 'text-gray-300';
  if (rsi > 70) return 'text-red-400';
  if (rsi > 60) return 'text-orange-400';
  if (rsi < 30) return 'text-green-400';
  if (rsi < 40) return 'text-blue-400';
  return 'text-gray-300';
}

function getRsiLabel(rsi) {
  if (!rsi) return '';
  if (rsi > 70) return 'Sobrecompra';
  if (rsi > 60) return 'Zona alta';
  if (rsi < 30) return 'Sobreventa';
  if (rsi < 40) return 'Zona baja';
  return 'Neutral';
}

function getAtrColor(atrPercent) {
  if (!atrPercent) return 'text-gray-300';
  if (atrPercent > 5) return 'text-red-400';
  if (atrPercent > 3) return 'text-orange-400';
  if (atrPercent < 1.5) return 'text-green-400';
  return 'text-gray-300';
}

function formatPrice(price) {
  if (!price) return 'N/A';
  if (price >= 10000) return '$' + Math.round(price).toLocaleString('en-US');
  if (price >= 1000) return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default TechnicalAnalysis;
