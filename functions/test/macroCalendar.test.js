import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MACRO_EVENTS, etToUtcMs, etDateKey, getUpcomingEvents, getCalendarCoverage, POST_EVENT_WINDOW_MS
} from '../src/data/macroCalendar.js';

const utc = (iso) => new Date(iso).getTime();

// ── Conversión ET → UTC (DST) ───────────────────────────────────────────────

test('etToUtcMs respeta el horario de verano (EDT, UTC−4)', () => {
  assert.equal(new Date(etToUtcMs('2026-09-16', '14:00')).toISOString(), '2026-09-16T18:00:00.000Z'); // FOMC
  assert.equal(new Date(etToUtcMs('2026-10-14', '08:30')).toISOString(), '2026-10-14T12:30:00.000Z'); // CPI
});

test('etToUtcMs respeta el horario estándar (EST, UTC−5)', () => {
  assert.equal(new Date(etToUtcMs('2026-12-09', '14:00')).toISOString(), '2026-12-09T19:00:00.000Z');
  assert.equal(new Date(etToUtcMs('2026-11-06', '08:30')).toISOString(), '2026-11-06T13:30:00.000Z'); // DST terminó el 1-nov
});

test('etDateKey devuelve la fecha de Nueva York, no la de UTC', () => {
  assert.equal(etDateKey(utc('2026-09-16T03:00:00Z')), '2026-09-15');  // 23:00 ET del día anterior
  assert.equal(etDateKey(utc('2026-09-16T04:30:00Z')), '2026-09-16');
});

// ── B4: el evento no desaparece el día de la publicación ────────────────────

const fomc = (now) => getUpcomingEvents(7, 'PAXG', utc(now)).find(e => e.name === 'FOMC' && e.date === '2026-09-16');

test('B4: el FOMC sigue visible durante TODO el día del evento, antes de las 14:00 ET', () => {
  // 00:01 UTC del 16 = 20:01 ET del 15 (aún "mañana"); antes desaparecía justo acá
  const eve = fomc('2026-09-16T00:01:00Z');
  assert.ok(eve, 'debe seguir visible pasada la medianoche UTC');
  assert.equal(eve.daysUntil, 1);
  for (const now of ['2026-09-16T04:30:00Z', '2026-09-16T12:00:00Z', '2026-09-16T17:30:00Z']) {
    const e = fomc(now);
    assert.ok(e, `no visible en ${now}`);
    assert.equal(e.daysUntil, 0);
    assert.equal(e.phase, 'upcoming');
  }
});

test('B4: hoursUntil es coherente con la hora real de la decisión (18:00 UTC)', () => {
  assert.equal(fomc('2026-09-16T12:00:00Z').hoursUntil, 6);
  assert.equal(fomc('2026-09-16T17:30:00Z').hoursUntil, 0.5);
});

test('B4: tras la publicación pasa a "released" y se mantiene 6 h', () => {
  const after1h = fomc('2026-09-16T19:00:00Z');
  assert.equal(after1h.phase, 'released');
  assert.ok(after1h.hoursUntil < 0);
  assert.ok(fomc('2026-09-17T00:00:00Z'));                         // +6 h justas
  assert.equal(fomc('2026-09-17T00:30:00Z'), undefined);           // +6.5 h: ya no
  assert.equal(POST_EVENT_WINDOW_MS, 6 * 3600 * 1000);
});

test('B4: daysUntil cuenta días de calendario de Nueva York (0 hoy, 1 mañana)', () => {
  assert.equal(fomc('2026-09-15T12:00:00Z').daysUntil, 1);
  assert.equal(fomc('2026-09-15T23:00:00Z').daysUntil, 1);   // 19:00 ET del 15
  assert.equal(fomc('2026-09-16T03:00:00Z').daysUntil, 1);   // 23:00 ET del 15
  assert.equal(fomc('2026-09-16T04:30:00Z').daysUntil, 0);   // 00:30 ET del 16
  assert.equal(fomc('2026-09-13T12:00:00Z').daysUntil, 3);
});

test('los eventos vienen ordenados y dentro de la ventana pedida', () => {
  const now = utc('2026-09-28T12:00:00Z');
  const ev = getUpcomingEvents(21, 'PAXG', now);
  const times = ev.map(e => new Date(e.eventTime).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(ev.every(e => times[0] >= now - POST_EVENT_WINDOW_MS));
  assert.ok(ev.every(e => new Date(e.eventTime).getTime() <= now + 21 * 86400000));
  // PCE de agosto (30-sep) ya no falta: antes figuraba el 25-sep y hoy no se mostraba
  assert.ok(ev.some(e => e.name === 'PCE' && e.date === '2026-09-30'));
});

// ── Activos ─────────────────────────────────────────────────────────────────

test('ETH y otras cripto comparten los eventos de BTC; PCE es solo de oro', () => {
  const now = utc('2026-10-01T12:00:00Z');
  const eth  = getUpcomingEvents(30, 'ETH', now).map(e => e.name);
  const paxg = getUpcomingEvents(30, 'PAXG', now).map(e => e.name);
  assert.ok(eth.includes('CPI') && eth.includes('FOMC') && eth.includes('NFP'));
  assert.ok(!eth.includes('PCE'));
  assert.ok(paxg.includes('PCE'));
  assert.deepEqual(getUpcomingEvents(30, 'XAUUSDT', now).map(e => e.date), getUpcomingEvents(30, 'PAXG', now).map(e => e.date));
});

test('sin activo devuelve todos', () => {
  const now = utc('2026-10-01T12:00:00Z');
  assert.ok(getUpcomingEvents(30, null, now).length >= getUpcomingEvents(30, 'PAXG', now).length);
});

// ── Integridad de los datos ─────────────────────────────────────────────────

test('datos: fechas válidas, únicas, ordenadas y con bandera verified', () => {
  const seen = new Set();
  let prev = '';
  for (const e of MACRO_EVENTS) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(new Date(e.date).getTime()));
    assert.ok(e.date >= prev, `fuera de orden: ${e.date}`);
    prev = e.date;
    const k = `${e.date}:${e.name}`;
    assert.ok(!seen.has(k), `duplicado ${k}`);
    seen.add(k);
    assert.equal(typeof e.verified, 'boolean');
    assert.ok(['critical', 'high'].includes(e.impact));
    assert.ok(e.assets.length > 0);
  }
});

test('datos: correcciones verificadas contra fuentes oficiales', () => {
  const has = (date, name) => MACRO_EVENTS.some(e => e.date === date && e.name === name && e.verified);
  assert.ok(has('2026-09-11', 'CPI'));   // BLS: IPC agosto → vie 11-sep (antes 10-sep)
  assert.ok(has('2026-10-14', 'CPI'));   // BLS: IPC septiembre → mié 14-oct (antes 13-oct)
  assert.ok(has('2026-09-30', 'PCE'));   // BEA: PCE agosto → 30-sep (antes 25-sep)
  assert.ok(has('2026-09-16', 'FOMC'));
  assert.ok(has('2026-10-28', 'FOMC'));
  // contrastadas en octubre (resumen del buscador que cita las páginas oficiales; no se pudo abrir la fuente desde el sandbox)
  assert.ok(has('2026-10-29', 'PCE'));   // BEA: PCE septiembre → 29-oct (antes 30-oct)
  assert.ok(has('2026-11-10', 'CPI'));   // BLS: IPC octubre → mar 10-nov (antes 12-nov)
  assert.ok(has('2026-11-06', 'NFP'));   // BLS: empleo octubre → vie 6-nov
  assert.ok(has('2026-11-25', 'PCE'));   // BEA: PCE octubre → 25-nov
  assert.ok(has('2026-12-09', 'FOMC'));  // Fed: 8–9 dic, decisión el 9
  assert.ok(has('2026-12-10', 'CPI'));   // BLS: IPC noviembre → jue 10-dic
  assert.ok(has('2026-12-23', 'PCE'));   // BEA: PCE noviembre → 23-dic (antes 18-dic)
  assert.ok(!MACRO_EVENTS.some(e => ['2026-10-30', '2026-11-12', '2026-12-18'].includes(e.date)), 'las fechas viejas ya no están');
});

test('cobertura: informa último evento, días restantes y no verificados', () => {
  const c = getCalendarCoverage(utc('2026-09-28T12:00:00Z'));
  assert.equal(c.lastEventDate, '2026-12-23');
  assert.ok(c.daysCovered >= 85 && c.daysCovered <= 87, `daysCovered=${c.daysCovered}`);
  assert.ok(c.upcomingCount > 0);
  assert.equal(c.unverifiedUpcoming, 0);   // las 7 fechas pendientes quedaron contrastadas
  assert.equal(getCalendarCoverage(utc('2027-01-15T00:00:00Z')).daysCovered, 0);
});
