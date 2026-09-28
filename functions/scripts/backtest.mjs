#!/usr/bin/env node
// CLI del backtest. Uso:
//   node scripts/backtest.mjs [--cache .backtest-cache] [--out backtest-out] [--holdout-years 2] [--perm 500]
// Descarga historia (o la lee del caché), corre el protocolo de src/backtest/run.js y escribe
// report.md + results.json en --out. Necesita red (Yahoo, FRED, CFTC): se ejecuta en GitHub Actions.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadHistory } from '../src/backtest/data.js';
import { runBacktest } from '../src/backtest/run.js';
import { renderReport } from '../src/backtest/report.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const cacheDir = opt('cache', '.backtest-cache');
const outDir = opt('out', 'backtest-out');

const log = (m) => console.log(`[backtest] ${m}`);
const { raw, sources } = await loadHistory({ cacheDir, log });
log(`oro: ${raw.gold.length} filas`);

const res = runBacktest(raw, { holdoutYears: Number(opt('holdout-years', 2)), permB: Number(opt('perm', 500)), log });
const md = renderReport(res, { sources, generatedAt: new Date().toISOString() });

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'report.md'), md);
await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify({ sources, res }, null, 1));
console.log('\n' + md);
