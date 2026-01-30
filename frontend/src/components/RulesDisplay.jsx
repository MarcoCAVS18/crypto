// Reglas fijas siempre visibles
import { Card } from './ui/Card';
import { XCircle, CheckCircle, AlertTriangle } from 'lucide-react';

export function RulesDisplay({ collapsed = false }) {
  const rules = [
    { type: 'error', icon: XCircle, text: 'Sin cash = no comprar' },
    { type: 'error', icon: XCircle, text: 'Sin soporte = no entrar' },
    { type: 'error', icon: XCircle, text: 'Risk OFF = no tradear BTC' },
    { type: 'warning', icon: AlertTriangle, text: 'Duda = esperar' },
    { type: 'success', icon: CheckCircle, text: 'Seguir el plan siempre' }
  ];

  const iconColors = {
    error: 'text-red-400',
    warning: 'text-yellow-400',
    success: 'text-green-400'
  };

  if (collapsed) {
    return (
      <div className="text-xs text-gray-500 text-center">
        Ver reglas
      </div>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">
        Reglas Fundamentales
      </h3>

      <ul className="space-y-2">
        {rules.map((rule, index) => (
          <li key={index} className="flex items-center gap-2">
            <rule.icon className={`w-4 h-4 ${iconColors[rule.type]}`} />
            <span className="text-sm text-gray-400">{rule.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default RulesDisplay;
