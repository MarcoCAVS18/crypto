import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeHtml, describeApiError, HTML_INSTEAD_OF_API } from './apiErrors.js';

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

test('describeApiError explica el caso "el sitio devolvió HTML" (sin proxy a la API)', () => {
  assert.equal(describeApiError({ message: 'x', response: { data: '<!doctype html><html></html>' } }), HTML_INSTEAD_OF_API);
  assert.match(HTML_INSTEAD_OF_API, /VITE_API_URL/);
});
