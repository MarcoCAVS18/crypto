// Constantes globales de la aplicación

// Intervalo de actualización automática (5 minutos)
export const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;

// Símbolos soportados
export const SUPPORTED_SYMBOLS = ['BTC', 'PAXG'];

// Timeframes disponibles
export const TIMEFRAMES = ['15m', '1h', '4h', '1d'];

// Modos de usuario
export const USER_MODES = {
  inversion: {
    label: 'Inversión',
    description: 'Enfoque a largo plazo'
  },
  trading: {
    label: 'Trading',
    description: 'Operaciones a corto plazo'
  },
  observacion: {
    label: 'Observación',
    description: 'Solo monitorear sin operar'
  }
};

// Colores por market mode
export const MARKET_MODE_COLORS = {
  risk_on: {
    bg: 'bg-green-500',
    text: 'text-green-400',
    border: 'border-green-500'
  },
  neutral: {
    bg: 'bg-yellow-500',
    text: 'text-yellow-400',
    border: 'border-yellow-500'
  },
  risk_off: {
    bg: 'bg-red-500',
    text: 'text-red-400',
    border: 'border-red-500'
  }
};

// Colores por zona
export const ZONE_COLORS = {
  buy: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500'
  },
  neutral: {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-400',
    border: 'border-yellow-500'
  },
  sell: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500'
  }
};
