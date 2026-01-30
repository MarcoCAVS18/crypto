import cron from 'node-cron';
import { getCryptoData } from '../services/marketData.js';

// Cache global para datos actualizados
export const dataCache = {
  BTC: null,
  PAXG: null,
  lastUpdate: null
};

// Actualiza los datos de ambos símbolos
async function updateAllData() {
  console.log(`[${new Date().toISOString()}] Actualizando datos de mercado...`);

  try {
    // Actualizar BTC
    const btcData = await getCryptoData('BTC', '4h', 100);
    dataCache.BTC = btcData;
    console.log(`BTC actualizado: $${btcData.price}`);
  } catch (error) {
    console.error('Error actualizando BTC:', error.message);
  }

  try {
    // Actualizar PAXG
    const paxgData = await getCryptoData('PAXG', '4h', 100);
    dataCache.PAXG = paxgData;
    console.log(`PAXG actualizado: $${paxgData.price}`);
  } catch (error) {
    console.error('Error actualizando PAXG:', error.message);
  }

  dataCache.lastUpdate = new Date();
  console.log(`[${new Date().toISOString()}] Actualización completada`);
}

// Inicia el cron job para actualización automática
export function startUpdateJob() {
  // Actualizar inmediatamente al iniciar
  updateAllData();

  // Programar actualización cada 5 minutos
  cron.schedule('*/5 * * * *', () => {
    updateAllData();
  });

  console.log('Cron job programado: actualización cada 5 minutos');
}

// Obtiene los datos del cache
export function getCachedData(symbol) {
  return dataCache[symbol];
}
