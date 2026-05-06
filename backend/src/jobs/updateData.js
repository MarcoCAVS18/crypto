import cron from 'node-cron';
import { getCryptoData } from '../services/marketData.js';
import { getGoldContext } from '../services/goldContext.js';

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

// Refresca el contexto de oro (macro + noticias + Groq) — cada 6h
async function updateGoldContext() {
  console.log(`[${new Date().toISOString()}] Actualizando contexto de oro...`);
  try {
    const ctx = await getGoldContext(true); // forceRefresh
    console.log(`[GoldContext cron] Sentimiento: ${ctx.analysis?.sentiment} (score: ${ctx.analysis?.score})`);
  } catch (err) {
    console.error('[GoldContext cron] Error:', err.message);
  }
}

// Inicia el cron job para actualización automática
export function startUpdateJob() {
  // Actualizar inmediatamente al iniciar
  updateAllData();

  // Contexto de oro al arrancar (no forzar refresh — respetar caché existente)
  getGoldContext(false).catch(err =>
    console.warn('[GoldContext init] Error inicial:', err.message)
  );

  // Programar actualización de precios cada 5 minutos
  cron.schedule('*/5 * * * *', () => {
    updateAllData();
  });

  // Programar actualización del contexto de oro cada 6 horas
  cron.schedule('0 */6 * * *', () => {
    updateGoldContext();
  });

  console.log('Cron jobs: precios cada 5min, contexto oro cada 6h');
}

// Obtiene los datos del cache
export function getCachedData(symbol) {
  return dataCache[symbol];
}
