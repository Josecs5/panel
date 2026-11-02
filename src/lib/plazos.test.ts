import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aPlazo, diasHasta, enlaceSeguro, esUrgente, separarPlazos } from './plazos.ts';
import type { Plazo } from './plazos.ts';

const plazo = (id: string, fecha: string, titulo = id): Plazo => ({
  id,
  titulo,
  fecha,
  categoria: 'Personal',
  nota: '',
  enlace: '',
});

test('ordena los próximos por fecha y archiva solo lo ya pasado', () => {
  const { proximos, archivados } = separarPlazos(
    [
      plazo('futuro', '2026-12-01'),
      plazo('ayer', '2026-11-01'),
      plazo('hoy', '2026-11-02'),
      plazo('antiguo', '2026-01-01'),
    ],
    '2026-11-02',
  );
  assert.deepEqual(proximos.map((p) => p.id), ['hoy', 'futuro']);
  assert.deepEqual(archivados.map((p) => p.id), ['ayer', 'antiguo']);
});

test('con la misma fecha, ordena por título', () => {
  const { proximos } = separarPlazos(
    [plazo('b', '2026-11-11', 'Vacunación'), plazo('a', '2026-11-11', 'Huelga')],
    '2026-11-02',
  );
  assert.deepEqual(proximos.map((p) => p.id), ['a', 'b']);
});

test('es urgente si faltan menos de 7 días', () => {
  assert.equal(esUrgente(diasHasta('2026-11-02', '2026-11-02')), true);
  assert.equal(esUrgente(diasHasta('2026-11-08', '2026-11-02')), true);
  assert.equal(esUrgente(diasHasta('2026-11-09', '2026-11-02')), false);
});

test('descarta los plazos incompletos o con categoría desconocida', () => {
  const base = { titulo: 'A', fecha: '2026-11-07', categoria: 'Viaje' };
  assert.ok(aPlazo('x', base));
  assert.equal(aPlazo('x', { ...base, titulo: '  ' }), null);
  assert.equal(aPlazo('x', { ...base, fecha: '07/11/2026' }), null);
  assert.equal(aPlazo('x', { ...base, categoria: 'Otra' }), null);
});

test('rellena nota y enlace si faltan', () => {
  const resultado = aPlazo('x', { titulo: 'A', fecha: '2026-11-07', categoria: 'Viaje', nota: null });
  assert.equal(resultado?.nota, '');
  assert.equal(resultado?.enlace, '');
});

test('solo admite enlaces web', () => {
  assert.equal(enlaceSeguro(' https://example.test/a '), 'https://example.test/a');
  assert.equal(enlaceSeguro('http://example.test'), 'http://example.test');
  assert.equal(enlaceSeguro('javascript:alert(1)'), null);
  assert.equal(enlaceSeguro('data:text/html,x'), null);
  assert.equal(enlaceSeguro('no es un enlace'), null);
  assert.equal(enlaceSeguro(''), null);
});
