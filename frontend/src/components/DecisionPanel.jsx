// Panel de decisión sugerida con operaciones específicas
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { ArrowUpCircle, Clock, ArrowDownCircle, Lightbulb, ShoppingCart, TrendingDown } from 'lucide-react';

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

  const { action, strength, reason, recommendation, operations = [] } = decision;

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

  const buyOps = operations.filter(o => o.type === 'BUY');
  const sellOps = operations.filter(o => o.type === 'SELL');

  return (
    <div className="space-y-3">
      {/* Tarjeta principal de decisión */}
      <Card variant="highlighted" className={`${config.bgColor} border`}>
        <div className="flex flex-col items-center gap-4">
          {/* Acción principal */}
          <div className="flex items-center gap-3">
            <Icon className={`w-10 h-10 text-${config.color}-400`} />
            <div className="flex flex-col">
              <Badge color={config.color} size="lg">{config.label}</Badge>
              <span className="text-xs text-gray-400 mt-1">
                {strengthLabels[strength] || strength}
              </span>
            </div>
          </div>

          {/* Razón */}
          <div className="text-center">
            <p className="text-sm text-gray-300">{reason}</p>
          </div>

          {/* Recomendación */}
          <div className="w-full p-3 bg-gray-800/50 rounded-lg">
            <div className="flex items-start gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-xs text-gray-400 block mb-1">Recomendación</span>
                <p className="text-sm text-gray-200">{recommendation}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Operaciones de COMPRA */}
      {buyOps.length > 0 && (
        <Card className="border border-green-500/20">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="w-4 h-4 text-green-400" />
            <h3 className="text-sm font-semibold text-green-400">Órdenes de Compra Sugeridas</h3>
          </div>
          <div className="space-y-2">
            {buyOps.map((op) => (
              <OperationRow key={op.level} op={op} color="green" />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            * Los montos se calculan sobre el capital disponible ingresado. Ajusta según tu tolerancia al riesgo.
          </p>
        </Card>
      )}

      {/* Operaciones de VENTA */}
      {sellOps.length > 0 && (
        <Card className="border border-red-500/20">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-semibold text-red-400">Órdenes de Venta Sugeridas</h3>
          </div>
          <div className="space-y-2">
            {sellOps.map((op) => (
              <OperationRow key={op.level} op={op} color="red" />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function OperationRow({ op, color }) {
  const colorMap = {
    green: { border: 'border-green-500/30', text: 'text-green-400', bg: 'bg-green-500/10' },
    red: { border: 'border-red-500/30', text: 'text-red-400', bg: 'bg-red-500/10' }
  };
  const c = colorMap[color];

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border ${c.border} ${c.bg}`}>
      {/* Nivel y label */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`text-xs font-bold w-5 h-5 rounded-full border ${c.border} ${c.text} flex items-center justify-center shrink-0`}>
          {op.level}
        </span>
        <span className="text-sm text-gray-300 truncate">{op.label}</span>
      </div>

      {/* Precio + montos */}
      <div className="flex items-center gap-4 shrink-0 ml-7 sm:ml-0">
        <div className="text-right">
          <p className="text-xs text-gray-500">Precio</p>
          <p className="text-sm font-mono text-white">{formatPrice(op.price)}</p>
        </div>

        {op.usdAmount != null && (
          <div className="text-right">
            <p className="text-xs text-gray-500">Monto USD</p>
            <p className={`text-sm font-mono font-semibold ${c.text}`}>
              ${op.usdAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
          </div>
        )}

        {op.units != null && (
          <div className="text-right">
            <p className="text-xs text-gray-500">Unidades</p>
            <p className="text-sm font-mono text-gray-200">
              {formatUnits(op.units)}
            </p>
          </div>
        )}

        <div className="text-right">
          <p className="text-xs text-gray-500">% capital</p>
          <p className={`text-sm font-semibold ${c.text}`}>{op.percentage}%</p>
        </div>
      </div>

      {/* Nota (para SELL sin posición registrada) */}
      {op.note && (
        <p className="text-xs text-gray-500 ml-7 sm:ml-0 sm:mt-0 mt-1 italic col-span-full">{op.note}</p>
      )}
    </div>
  );
}

function formatPrice(price) {
  if (!price) return 'N/A';
  if (price >= 1000) return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatUnits(units) {
  if (units >= 1) return units.toFixed(4);
  if (units >= 0.001) return units.toFixed(6);
  return units.toFixed(8);
}

export default DecisionPanel;
