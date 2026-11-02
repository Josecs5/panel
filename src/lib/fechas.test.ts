import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasEntre, esFechaValida, fechaCorta, fechaLarga, hoyEnMadrid } from './fechas.ts';

test('hoy cambia a medianoche de Madrid, no a la de UTC', () => {
  // Invierno, UTC+1
  assert.equal(hoyEnMadrid(new Date('2026-11-02T22:59:00Z')), '2026-11-02');
  assert.equal(hoyEnMadrid(new Date('2026-11-02T23:00:00Z')), '2026-11-03');
  // Verano, UTC+2
  assert.equal(hoyEnMadrid(new Date('2026-07-01T21:59:00Z')), '2026-07-01');
  assert.equal(hoyEnMadrid(new Date('2026-07-01T22:00:00Z')), '2026-07-02');
});

test('cuenta días naturales, también al cruzar un cambio de hora', () => {
  assert.equal(diasEntre('2026-11-02', '2026-11-07'), 5);
  assert.equal(diasEntre('2026-11-02', '2026-11-02'), 0);
  assert.equal(diasEntre('2026-11-02', '2026-11-01'), -1);
  assert.equal(diasEntre('2026-10-24', '2026-10-26'), 2);
  assert.equal(diasEntre('2027-03-27', '2027-03-29'), 2);
});

test('solo acepta fechas reales en formato AAAA-MM-DD', () => {
  assert.equal(esFechaValida('2026-11-07'), true);
  assert.equal(esFechaValida('2028-02-29'), true);
  assert.equal(esFechaValida('2026-02-30'), false);
  assert.equal(esFechaValida('07/11/2026'), false);
  assert.equal(esFechaValida(null), false);
});

test('formatea en español sin moverse de día', () => {
  assert.equal(fechaLarga('2026-11-07'), 'sábado, 7 de noviembre de 2026');
  assert.match(fechaCorta('2026-11-07'), /7 nov.* 2026/);
});
