import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  caducado,
  FalloApi,
  pedirCambio,
  pedirCotizacion,
  pedirResultados,
  TTL_COTIZACION,
} from './cotizaciones.ts';

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

const motivo = (m: string) => (e: unknown) => e instanceof FalloApi && e.motivo === m;

test('convierte la respuesta de Finnhub y sella la hora', async () => {
  let pedido = '';
  const r = await pedirCotizacion('XYZ', 'k/1', 1000, async (url) => {
    pedido = url;
    return json({ c: 210.5, d: -1.5, dp: -0.7, pc: 212 });
  });
  assert.deepEqual(r, { precio: 210.5, variacion: -1.5, variacionPct: -0.7, guardadoEn: 1000 });
  assert.match(pedido, /symbol=XYZ&token=k%2F1/);
});

test('un ticker desconocido llega con ceros y se trata como error', async () => {
  await assert.rejects(
    pedirCotizacion('XXXX', 'k', 0, async () => json({ c: 0, d: null, dp: null })),
    motivo('simbolo'),
  );
});

test('distingue clave inválida, plan, límite y red', async () => {
  const con = (status: number) => async () => json({ error: 'x' }, status);
  await assert.rejects(pedirCotizacion('A', 'k', 0, con(401)), motivo('clave'));
  await assert.rejects(pedirCotizacion('A', 'k', 0, con(403)), motivo('plan'));
  await assert.rejects(pedirCotizacion('A', 'k', 0, con(429)), motivo('limite'));
  await assert.rejects(pedirCotizacion('A', 'k', 0, con(500)), motivo('red'));
  await assert.rejects(
    pedirCotizacion('A', 'k', 0, async () => {
      throw new TypeError('sin red');
    }),
    motivo('red'),
  );
  await assert.rejects(
    pedirCotizacion('A', 'k', 0, async () => new Response('no es json')),
    motivo('red'),
  );
});

test('usa Frankfurter para el cambio', async () => {
  const r = await pedirCambio(5, async () => json({ date: '2026-11-02', rates: { EUR: 0.89 } }));
  assert.deepEqual(r, { usdEur: 0.89, fecha: '2026-11-02', fuente: 'BCE, vía Frankfurter', guardadoEn: 5 });
});

test('si Frankfurter falla, usa la segunda fuente', async () => {
  const r = await pedirCambio(5, async (url) =>
    url.includes('frankfurter')
      ? json({}, 503)
      : json({ rates: { EUR: 0.9 }, time_last_update_unix: 1793923200 }),
  );
  assert.equal(r.usdEur, 0.9);
  assert.equal(r.fuente, 'ExchangeRate-API');
  assert.match(r.fecha, /^\d{4}-\d{2}-\d{2}$/);
});

test('si Frankfurter responde algo raro, también usa la segunda fuente', async () => {
  const r = await pedirCambio(5, async (url) =>
    url.includes('frankfurter') ? json({ rates: {} }) : json({ rates: { EUR: 0.9 } }),
  );
  assert.equal(r.fuente, 'ExchangeRate-API');
});

test('si fallan las dos fuentes, lo indica', async () => {
  await assert.rejects(pedirCambio(5, async () => json({}, 503)), motivo('red'));
});

test('filtra los resultados pasados y pide 90 días', async () => {
  let pedido = '';
  const r = await pedirResultados('ABC', 'k', '2026-11-02', async (url) => {
    pedido = url;
    return json({
      earningsCalendar: [
        { date: '2026-11-01', hour: 'amc', quarter: 3, year: 2026 },
        { date: '2026-11-10', hour: 'bmo', quarter: 3, year: 2026 },
      ],
    });
  });
  assert.deepEqual(r, [{ ticker: 'ABC', fecha: '2026-11-10', momento: 'bmo', trimestre: 3, ano: 2026 }]);
  assert.match(pedido, /from=2026-11-02&to=2027-01-31/);
});

test('si el plan no permite los resultados, lo indica para omitir la sección', async () => {
  await assert.rejects(
    pedirResultados('ABC', 'k', '2026-11-02', async () => json({ error: 'x' }, 403)),
    motivo('plan'),
  );
});

test('una cotización caduca a los 5 minutos', () => {
  assert.equal(caducado(undefined, TTL_COTIZACION, 0), true);
  assert.equal(caducado(0, TTL_COTIZACION, TTL_COTIZACION - 1), false);
  assert.equal(caducado(0, TTL_COTIZACION, TTL_COTIZACION), true);
});
