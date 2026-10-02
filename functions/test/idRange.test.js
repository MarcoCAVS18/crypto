import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newestByIdRange, getOutcomes, getLatestSnapshots, _setDbForTests } from '../src/config/database.js';

const H = 3600 * 1000;
const T = Date.parse('2026-10-02T12:00:00Z');
const pad = (n) => String(n).padStart(2, '0');
const idAt = (sym, ms) => { const d = new Date(ms); return `${sym}_${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`; };

// Firestore falso ESTRICTO: como el real en producción, rechaza orderBy(id, 'desc') (exige un índice que no existe).
function strictFirestore(ids) {
  const makeQuery = (conds = [], order = null) => ({
    where: (field, op, value) => makeQuery([...conds, { field, op, value }], order),
    orderBy: (field, dir = 'asc') => {
      if (typeof field !== 'string' && dir === 'desc') throw new Error('9 FAILED_PRECONDITION: The query requires an index.');
      return makeQuery(conds, { field, dir });
    },
    limit: () => { throw new Error('el helper no debe usar limit (pediría el extremo viejo)'); },
    get: async () => {
      let rows = ids.map(id => ({ id, data: { symbol: id.split('_')[0] } }));
      for (const c of conds) rows = rows.filter(r => (c.op === '>=' ? r.id >= c.value : r.id < c.value));
      rows.sort((a, b) => (a.id < b.id ? -1 : 1));
      return { docs: rows.map(r => ({ id: r.id, data: () => r.data })) };
    }
  });
  return { collection: () => makeQuery() };
}

test('newestByIdRange: devuelve las N más nuevas (más nueva primero) sin pedir orden descendente por ID', async () => {
  const ids = Array.from({ length: 500 }, (_, i) => idAt('PAXG', T - i * H));
  ids.push(idAt('BTC', T), idAt('PAXGX', T));                      // otros símbolos: no se mezclan
  _setDbForTests(strictFirestore(ids));
  const got = await newestByIdRange('decisions', 'PAXG_', 5, T);
  assert.deepEqual(got.map(d => d.id), [0, 1, 2, 3, 4].map(i => idAt('PAXG', T - i * H)));
});

test('newestByIdRange: si lo reciente es poco, agranda la ventana (datos de hace meses) y no devuelve de más', async () => {
  const old = Array.from({ length: 30 }, (_, i) => idAt('PAXG', T - (200 * 24 + i) * H));
  _setDbForTests(strictFirestore(old));
  const got = await newestByIdRange('snapshots', 'PAXG_', 10, T);
  assert.equal(got.length, 10);
  assert.equal(got[0].id, idAt('PAXG', T - 200 * 24 * H));
  _setDbForTests(strictFirestore([]));
  assert.deepEqual(await newestByIdRange('snapshots', 'PAXG_', 10, T), []);
});

test('getOutcomes y getLatestSnapshots usan el helper (no exigen índice)', async () => {
  _setDbForTests(strictFirestore([idAt('PAXG', Date.now()), idAt('PAXG', Date.now() - H)]));
  assert.equal((await getOutcomes('paxg', 300)).length, 2);
  assert.equal((await getLatestSnapshots('PAXG', 1)).length, 1);
});
