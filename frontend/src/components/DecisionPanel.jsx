// Panel de decisión sugerida
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { ArrowUpCircle, Clock, ArrowDownCircle, Lightbulb } from 'lucide-react';

export function DecisionPanel({ decision }) {
  if (!decision) {
    return (
      <Card className="text-center p-6">
        <p className="text-gray-400">
          Ingresa tu estado actual para obtener una decisión
        </p>
      </Card>
    );
  }

  const { action, strength, reason, recommendation } = decision;

  const actionConfig = {
    BUY: {
      label: 'COMPRAR',
      color: 'green',
      icon: ArrowUpCircle,
      bgColor: 'bg-green-500/10 border-green-500/30'
    },
    WAIT: {
      label: 'ESPERAR',
      color: 'yellow',
      icon: Clock,
      bgColor: 'bg-yellow-500/10 border-yellow-500/30'
    },
    SELL: {
      label: 'VENDER',
      color: 'red',
      icon: ArrowDownCircle,
      bgColor: 'bg-red-500/10 border-red-500/30'
    }
  };

  const config = actionConfig[action] || actionConfig.WAIT;
  const Icon = config.icon;

  const strengthLabels = {
    fuerte: 'Señal Fuerte',
    moderado: 'Señal Moderada',
    débil: 'Señal Débil'
  };

  return (
    <Card variant="highlighted" className={`${config.bgColor} border`}>
      <div className="flex flex-col items-center gap-4">
        {/* Acción principal */}
        <div className="flex items-center gap-3">
          <Icon className={`w-10 h-10 text-${config.color}-400`} />
          <div className="flex flex-col">
            <Badge color={config.color} size="lg">
              {config.label}
            </Badge>
            <span className="text-xs text-gray-400 mt-1">
              {strengthLabels[strength] || strength}
            </span>
          </div>
        </div>

        {/* Razón */}
        <div className="text-center">
          <p className="text-sm text-gray-300">
            {reason}
          </p>
        </div>

        {/* Recomendación */}
        <div className="w-full p-3 bg-gray-800/50 rounded-lg">
          <div className="flex items-start gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-gray-400 block mb-1">Recomendación</span>
              <p className="text-sm text-gray-200">
                {recommendation}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default DecisionPanel;
