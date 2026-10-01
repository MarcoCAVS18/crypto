import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeHtml, describeApiError, htmlInsteadOfApiMessage } from './apiErrors.js';

test('looksLikeHtml detecta el index.html devuelto en lugar de JSON', () => {
  assert.equal(looksLikeHtml('<!doctype html><html><head></head></html>'), true);
  assert.equal(looksLikeHtml('  <!DOCTYPE HTML>\n<html>'), true);
  assert.equal(looksLikeHtml('<html lang="es">'), true);
  assert.equal(looksLikeHtml({ a: 1 }), false);
  assert.equal(looksLikeHtml('{"ok":true}'), false);
  assert.equal(looksLikeHtml(undefined), false);
});

test('describeApiError prioriza el motivo del servidor ({error}) sobre el genérico de axios', () => {
  assert.equal(describeApiError({ message: 'Request failed with status code 500', response: { data: { error: 'Groq rechazó la API key (401)' } } }), 'Groq rechazó la API key (401)');
  assert.equal(describeApiError({ message: 'x', response: { data: { message: 'otro formato' } } }), 'otro formato');
  assert.equal(describeApiError({ message: 'Network Error' }), 'Network Error');
  assert.equal(describeApiError({}), 'Error de conexión');
});

test('si /api devuelve HTML en un sitio sin API (Netlify) dice dónde estás y a dónde ir', () => {
  const m = htmlInsteadOfApiMessage('algo.netlify.app', 'pal-crypto');
  assert.match(m, /algo\.netlify\.app/); assert.match(m, /https:\/\/pal-crypto\.web\.app/);
  assert.match(htmlInsteadOfApiMessage('algo.netlify.app', undefined), /web\.app/);
});

test('en Firebase o local, el HTML significa que la función no respondió bien (no manda a otro sitio)', () => {
  for (const h of ['pal-crypto.web.app', 'pal-crypto.firebaseapp.com', 'localhost']) {
    const m = htmlInsteadOfApiMessage(h, 'pal-crypto');
    assert.match(m, /no respondió bien/); assert.doesNotMatch(m, /Abrí/);
  }
});
