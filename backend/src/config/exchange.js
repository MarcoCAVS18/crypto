import ccxt from 'ccxt';
import dotenv from 'dotenv';

dotenv.config();

// Configuración del exchange (Binance)
const exchangeConfig = {
  apiKey: process.env.BINANCE_API_KEY || '',
  secret: process.env.BINANCE_API_SECRET || '',
  enableRateLimit: true,
  options: {
    defaultType: 'spot'
  }
};

// Instancia del exchange
let exchange = null;

// Obtiene la instancia del exchange
export function getExchange() {
  if (!exchange) {
    exchange = new ccxt.binance(exchangeConfig);
  }
  return exchange;
}

// Símbolos soportados
export const SUPPORTED_SYMBOLS = {
  BTC: 'BTC/USDT',
  PAXG: 'PAXG/USDT'
};

// Timeframes soportados
export const SUPPORTED_TIMEFRAMES = ['15m', '1h', '4h', '1d'];
