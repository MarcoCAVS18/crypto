import { test } from 'node:test';
import assert from 'node:assert/strict';

// Sin localStorage (Node): el token vive en memoria y las funciones no revientan
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { getToken, setToken, clearToken } = await import('../services/session.js');

test('sesión: guarda, lee y borra el token', () => {
  assert.equal(getToken(), null);
  setToken('abc');
  assert.equal(getToken(), 'abc');
  clearToken();
  assert.equal(getToken(), null);
});

test('sesión: si localStorage lanza (modo privado), usa memoria sin romper', () => {
  globalThis.localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
  setToken('mem');
  assert.equal(getToken(), 'mem');
  clearToken();
  assert.equal(getToken(), null);
});
