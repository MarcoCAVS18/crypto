// Corre en GitHub Actions (news-relay.yml). Necesita GOOGLE_APPLICATION_CREDENTIALS y FIREBASE_PROJECT_ID.
import { initializeApp } from 'firebase-admin/app';
import { setAiCache } from '../src/config/database.js';
import { getGoldHeadlines, getBtcHeadlines, getEthHeadlines } from '../src/services/newsService.js';
import { fetchCotRows } from '../src/services/macroService.js';
import { runRelay, relayCot } from '../src/services/newsRelay.js';

initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });

const results = await runRelay({
  targets: [
    { key: 'headlines_last_paxg', fetch: getGoldHeadlines },
    { key: 'headlines_last_btc',  fetch: getBtcHeadlines },
    { key: 'headlines_last_eth',  fetch: getEthHeadlines }
  ],
  setCache: setAiCache,
  log: (m) => console.log(m)
});
results.push(await relayCot({ fetchRows: (n) => fetchCotRows(n, { timeoutMs: 30000 }), setCache: setAiCache, log: (m) => console.log(m) }));

const md = ['## Relé de noticias y COT', '', '| Clave | Titulares / filas | Guardado |', '|---|---|---|',
  ...results.map(r => `| ${r.key} | ${r.count} | ${r.saved ? 'sí' : `no${r.error ? ` (${r.error})` : ''}`} |`)].join('\n');
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) (await import('node:fs')).appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
// Falla el job (y GitHub avisa) solo si no se pudo guardar nada.
if (!results.some(r => r.saved)) { console.error('No se guardó ningún relé.'); process.exit(1); }
process.exit(0);
