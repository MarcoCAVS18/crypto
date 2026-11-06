import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAiDeps } from '../src/config/aiDeps.js';

const withEnv = async (env, fn) => {
  const prev = {};
  for (const k of Object.keys(env)) { prev[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { return await fn(); } finally { for (const k of Object.keys(env)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
};

test('AI_DECISION=off apaga la capa (decide solo la regla)', async () => {
  await withEnv({ AI_DECISION: 'off' }, () => assert.equal(createAiDeps(), undefined));
  await withEnv({ AI_DECISION: 'OFF' }, () => assert.equal(createAiDeps(), undefined));
});

test('encendida: expone chat, caché y noticias; sin GROQ_API_KEY la consulta falla con un mensaje claro (la pantalla lo muestra)', async () => {
  await withEnv({ AI_DECISION: undefined, GROQ_API_KEY: undefined }, async () => {
    const d = createAiDeps();
    for (const k of ['chat', 'cacheGet', 'cacheSet', 'getNews', 'warn']) assert.equal(typeof d[k], 'function', k);
    assert.ok(d.model);
    await assert.rejects(() => d.chat('hola'), /GROQ_API_KEY no configurada/);
  });
});
