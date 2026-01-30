// Panel de análisis técnico
import { Card } from './ui/Card';
import { TrendingUp, TrendingDown, BarChart3, Activity, Gauge } from 'lucide-react';

export function TechnicalAnalysis({ analysis }) {
  const { trendShort, trendLong, volumeStatus, rsi, atr } = analysis;

  const metrics = [
    {
      label: 'Tendencia Corto Plazo',
      value: trendShort === 'alcista' ? 'Alcista' : 'Bajista',
      icon: trendShort === 'alcista' ? TrendingUp : TrendingDown,
      color: trendShort === 'alcista' ? 'text-green-400' : 'text-red-400'
    },
    {
      label: 'Tendencia Largo Plazo',
      value: trendLong === 'alcista' ? 'Alcista' : 'Bajista',
      icon: trendLong === 'alcista' ? TrendingUp : TrendingDown,
      color: trendLong === 'alcista' ? 'text-green-400' : 'text-red-400'
    },
    {
      label: 'Volumen',
      value: getVolumeLabel(volumeStatus),
      icon: BarChart3,
      color: getVolumeColor(volumeStatus)
    },
    {
      label: 'RSI (14)',
      value: rsi?.toFixed(1) || 'N/A',
      icon: Activity,
      color: getRsiColor(rsi),
      extra: getRsiLabel(rsi)
    },
    {
      label: 'ATR (Volatilidad)',
      value: atr ? `$${atr.toLocaleString()}` : 'N/A',
      icon: Gauge,
      color: 'text-gray-300'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {metrics.map((metric, index) => (
        <Card key={index} className="p-3">
          <div className="flex items-start gap-2">
            <metric.icon className={`w-5 h-5 mt-0.5 ${metric.color}`} />
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">{metric.label}</span>
              <span className={`font-semibold ${metric.color}`}>
                {metric.value}
              </span>
              {metric.extra && (
                <span className="text-xs text-gray-500">{metric.extra}</span>
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
  if (rsi < 30) return 'text-green-400';
  return 'text-gray-300';
}

function getRsiLabel(rsi) {
  if (!rsi) return '';
  if (rsi > 70) return 'Sobrecompra';
  if (rsi < 30) return 'Sobreventa';
  return '';
}

export default TechnicalAnalysis;
