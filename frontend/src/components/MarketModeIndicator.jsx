// Indicador de Market Mode (Risk ON/OFF/Neutral)
import { Badge } from './ui/Badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export function MarketModeIndicator({ mode, reasons = [] }) {
  const modeConfig = {
    risk_on: {
      label: 'RISK ON',
      color: 'green',
      icon: TrendingUp,
      description: 'Contexto favorable para operar'
    },
    neutral: {
      label: 'NEUTRAL',
      color: 'yellow',
      icon: Minus,
      description: 'Contexto mixto, precaución'
    },
    risk_off: {
      label: 'RISK OFF',
      color: 'red',
      icon: TrendingDown,
      description: 'Contexto desfavorable'
    }
  };

  const config = modeConfig[mode] || modeConfig.neutral;
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div className="flex items-center gap-3">
        <Icon className={`w-8 h-8 text-${config.color}-400`} />
        <Badge color={config.color} size="lg">
          {config.label}
        </Badge>
      </div>

      <p className="text-sm text-gray-400 text-center">
        {config.description}
      </p>

      {reasons.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {reasons.map((reason, index) => (
            <Badge key={index} color="gray" size="sm">
              {reason}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default MarketModeIndicator;
