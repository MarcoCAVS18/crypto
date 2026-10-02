import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDecimal } from './decimalInput.js';

test('acepta coma o punto como decimal (teclado en español)', () => {
  assert.equal(sanitizeDecimal('0,5'), '0.5');
  assert.equal(sanitizeDecimal('0.5'), '0.5');
  assert.equal(sanitizeDecimal('0,00012345'), '0.00012345');
  assert.equal(sanitizeDecimal('12'), '12');
});

test('mientras se escribe conserva el separador final y el inicial', () => {
  assert.equal(sanitizeDecimal('1,'), '1.');
  assert.equal(sanitizeDecimal('1.'), '1.');
  assert.equal(sanitizeDecimal(','), '.');
  assert.equal(sanitizeDecimal(''), '');
});

test('números pegados con separador de miles', () => {
  assert.equal(sanitizeDecimal('1.234,56'), '1234.56');
  assert.equal(sanitizeDecimal('1,234.56'), '1234.56');
  assert.equal(sanitizeDecimal('95.000'), '95.000');   // ambiguo: se toma como decimal (un solo separador)
});

test('descarta letras y símbolos y no deja dos separadores', () => {
  assert.equal(sanitizeDecimal('$12abc'), '12');
  assert.equal(sanitizeDecimal('1.2.3'), '12.3');
  assert.equal(sanitizeDecimal('-5'), '5');
  assert.equal(sanitizeDecimal(null), '');
});
