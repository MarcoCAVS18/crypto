// Input para el estado del usuario (cash disponible y modo)
import { useState } from 'react';
import { Button } from './ui/Button';
import { Wallet, Eye, TrendingUp, LineChart } from 'lucide-react';

export function UserStateInput({ onSubmit, initialCash = 50, initialMode = 'inversion' }) {
  const [cashPercent, setCashPercent] = useState(initialCash);
  const [mode, setMode] = useState(initialMode);

  const modes = [
    { id: 'inversion', label: 'Inversión', icon: TrendingUp, description: 'Largo plazo' },
    { id: 'trading', label: 'Trading', icon: LineChart, description: 'Corto plazo' },
    { id: 'observacion', label: 'Observación', icon: Eye, description: 'Solo mirar' }
  ];

  const handleSubmit = () => {
    onSubmit({ cashPercent, mode });
  };

  return (
    <div className="space-y-6">
      {/* Slider de Cash */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-400">Cash disponible</span>
          </div>
          <span className="text-xl font-bold text-white">{cashPercent}%</span>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={cashPercent}
          onChange={(e) => setCashPercent(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />

        <div className="flex justify-between text-xs text-gray-500">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Selector de Modo */}
      <div className="space-y-3">
        <span className="text-sm text-gray-400">Modo de operación</span>

        <div className="grid grid-cols-3 gap-1 sm:gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`
                flex flex-col items-center gap-0.5 sm:gap-1 p-2 sm:p-3 rounded-lg border transition-all
                ${mode === m.id
                  ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }
              `}
            >
              <m.icon className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm font-medium">{m.label}</span>
              <span className="text-[10px] sm:text-xs opacity-70 hidden sm:block">{m.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Botón de envío */}
      <Button onClick={handleSubmit} className="w-full">
        Obtener Decisión
      </Button>
    </div>
  );
}

export default UserStateInput;
