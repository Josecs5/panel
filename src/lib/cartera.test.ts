import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aPosicion,
  avisoDeAportacion,
  calcularAccion,
  calcularFondo,
  participacionesDe,
  resumirCartera,
  serieValorAportado,
  ultimoCobro,
} from './cartera.ts';
import type { Aportacion, Cotizacion, Liquidativo, Posicion } from './cartera.ts';

const accion = (extra: Partial<Posicion> = {}): Posicion => ({
  id: 'a',
  nombre: 'Acción',
  tipo: 'accion',
  identificador: 'ABC',
  divisa: 'USD',
  cantidad: 10,
  precioMedio: 100,
  fechaCompra: null,
  ...extra,
});
const fondo = (extra: Partial<Posicion> = {}): Posicion => ({
  ...accion({ id: 'f', nombre: 'Fondo', tipo: 'fondo', identificador: 'IE00', divisa: 'EUR', cantidad: null, precioMedio: null }),
  ...extra,
});
const cot: Cotizacion = { precio: 120, variacion: 2, variacionPct: 1.69, guardadoEn: 0 };
const ap = (fecha: string, importe: number, vl: number, id = 'f'): Aportacion => ({
  id: fecha,
  posicionId: id,
  fecha,
  importe,
  valorLiquidativo: vl,
});
const vl = (fecha: string, valor: number, id = 'f'): Liquidativo => ({
  id: `v${fecha}`,
  posicionId: id,
  fecha,
  valor,
});
const cerca = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('calcula valor y ganancia de una acción en USD, EUR y %', () => {
  const r = calcularAccion(accion(), cot, 0.9);
  cerca(r.valorUsd, 1200);
  cerca(r.valorEur, 1080);
  cerca(r.gananciaUsd, 200);
  cerca(r.gananciaEur, 180);
  cerca(r.gananciaPct, 20);
  cerca(r.variacionDiaEur, 18);
});

test('sin cantidad hay % pero no valor; sin precio medio hay valor pero no ganancia', () => {
  const sinCantidad = calcularAccion(accion({ cantidad: null }), cot, 0.9);
  assert.equal(sinCantidad.valorUsd, null);
  assert.equal(sinCantidad.gananciaUsd, null);
  cerca(sinCantidad.gananciaPct, 20);

  const sinPrecioMedio = calcularAccion(accion({ precioMedio: null }), cot, 0.9);
  cerca(sinPrecioMedio.valorUsd, 1200);
  assert.equal(sinPrecioMedio.gananciaUsd, null);
  assert.equal(sinPrecioMedio.gananciaPct, null);
});

test('sin cotización ni cambio no se inventa ninguna cifra', () => {
  const sinCot = calcularAccion(accion(), null, 0.9);
  assert.equal(sinCot.valorUsd, null);
  assert.equal(sinCot.variacionDiaEur, null);
  const sinCambio = calcularAccion(accion(), cot, null);
  cerca(sinCambio.valorUsd, 1200);
  assert.equal(sinCambio.valorEur, null);
});

test('calcula las participaciones a partir de importe y valor liquidativo', () => {
  cerca(participacionesDe({ importe: 250, valorLiquidativo: 12.5 }), 20);
});

test('un fondo suma aportaciones y valora con el último liquidativo', () => {
  const r = calcularFondo(fondo(), [ap('2026-01-10', 100, 10), ap('2026-02-10', 110, 11)], [vl('2026-03-01', 12)], null);
  cerca(r.participaciones, 20);
  cerca(r.aportado, 210);
  assert.deepEqual(r.ultimoLiquidativo, { valor: 12, fecha: '2026-03-01' });
  cerca(r.valor, 240);
  cerca(r.ganancia, 30);
  cerca(r.gananciaPct, (30 / 210) * 100);
});

test('el liquidativo suelto gana a la aportación del mismo día', () => {
  const r = calcularFondo(fondo(), [ap('2026-01-10', 100, 10)], [vl('2026-01-10', 11)], null);
  assert.equal(r.ultimoLiquidativo?.valor, 11);
});

test('incluye las participaciones iniciales', () => {
  const r = calcularFondo(fondo({ cantidad: 5, precioMedio: 8 }), [ap('2026-01-10', 100, 10)], [], null);
  cerca(r.participaciones, 15);
  cerca(r.aportado, 140);
  cerca(r.valor, 150);
});

test('sin precio de las iniciales no afirma cuánto se aportó', () => {
  const r = calcularFondo(fondo({ cantidad: 5 }), [ap('2026-01-10', 100, 10)], [], null);
  assert.equal(r.aportado, null);
  assert.equal(r.ganancia, null);
  cerca(r.valor, 150);
});

test('un fondo sin datos no tiene valor', () => {
  const r = calcularFondo(fondo(), [], [], null);
  assert.equal(r.valor, null);
  assert.equal(r.aportado, null);
});

test('ignora los registros de otros fondos', () => {
  const r = calcularFondo(fondo(), [ap('2026-01-10', 100, 10, 'otro')], [vl('2026-01-10', 11, 'otro')], null);
  assert.equal(r.participaciones, 0);
  assert.equal(r.ultimoLiquidativo, null);
});

test('un fondo en USD se convierte; sin cambio no suma al total', () => {
  const posicion = fondo({ divisa: 'USD' });
  cerca(calcularFondo(posicion, [ap('2026-01-10', 100, 10)], [], 0.9).valorEur, 90);
  assert.equal(calcularFondo(posicion, [ap('2026-01-10', 100, 10)], [], null).valorEur, null);
});

test('el resumen suma lo que tiene valor y nombra lo que no', () => {
  const r = resumirCartera(
    [calcularAccion(accion(), cot, 0.9), calcularAccion(accion({ id: 'b', nombre: 'Sin cantidad', cantidad: null }), cot, 0.9)],
    [calcularFondo(fondo(), [ap('2026-01-10', 100, 10)], [], null)],
  );
  cerca(r.valorEur, 1180);
  cerca(r.variacionDiaEur, 18);
  cerca(r.variacionDiaPct, (18 / 1162) * 100);
  assert.deepEqual(r.sinValor, ['Sin cantidad']);
});

test('un resumen vacío no da cero, da null', () => {
  assert.equal(resumirCartera([], []).valorEur, null);
});

test('la serie acumula aportado y usa el último liquidativo conocido', () => {
  const serie = serieValorAportado(
    [fondo()],
    [ap('2026-01-10', 100, 10), ap('2026-03-10', 120, 12)],
    [vl('2026-02-10', 11)],
    null,
  );
  assert.deepEqual(serie.map((p) => p.fecha), ['2026-01-10', '2026-02-10', '2026-03-10']);
  cerca(serie[0].valor, 100);
  cerca(serie[1].valor, 110);
  cerca(serie[1].aportado, 100);
  cerca(serie[2].valor, 240);
  cerca(serie[2].aportado, 220);
});

test('la serie de varios fondos suma cada uno con su liquidativo', () => {
  const serie = serieValorAportado(
    [fondo(), fondo({ id: 'g' })],
    [ap('2026-01-10', 100, 10), ap('2026-02-10', 50, 5, 'g')],
    [],
    null,
  );
  cerca(serie[1].valor, 150);
  cerca(serie[1].aportado, 150);
});

test('el último cobro es de este mes o del anterior, ajustando meses cortos', () => {
  assert.equal(ultimoCobro('2026-11-28', 28), '2026-11-28');
  assert.equal(ultimoCobro('2026-11-27', 28), '2026-10-28');
  assert.equal(ultimoCobro('2027-01-05', 28), '2026-12-28');
  assert.equal(ultimoCobro('2027-02-28', 31), '2027-02-28');
  assert.equal(ultimoCobro('2027-03-05', 31), '2027-02-28');
});

test('avisa de aportar a los fondos sin aportación desde el último cobro', () => {
  const fondos = [fondo(), fondo({ id: 'g', nombre: 'Otro' })];
  const aviso = avisoDeAportacion(fondos, [ap('2026-11-01', 250, 10)], 28, 250, '2026-11-02');
  assert.deepEqual(aviso, { fondos: ['Otro'], importe: 250, cobro: '2026-10-28' });
});

test('no avisa si ya se aportó, si no hay día de cobro o si no hay fondos', () => {
  assert.equal(avisoDeAportacion([fondo()], [ap('2026-11-01', 250, 10)], 28, 250, '2026-11-02'), null);
  assert.equal(avisoDeAportacion([fondo()], [], null, 250, '2026-11-02'), null);
  assert.equal(avisoDeAportacion([], [], 28, 250, '2026-11-02'), null);
});

test('valida las posiciones y normaliza el identificador', () => {
  const base = { nombre: 'X', tipo: 'accion', identificador: ' abc ', divisa: 'USD', cantidad: null, precioMedio: 77 };
  assert.equal(aPosicion('x', base)?.identificador, 'ABC');
  assert.equal(aPosicion('x', base)?.cantidad, null);
  assert.equal(aPosicion('x', { ...base, tipo: 'otro' }), null);
  assert.equal(aPosicion('x', { ...base, divisa: 'GBP' }), null);
  assert.equal(aPosicion('x', { ...base, nombre: '' }), null);
});
