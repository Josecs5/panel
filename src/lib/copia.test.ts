import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aAjustes } from './ajustes.ts';
import { leerCopia, resumirCopia } from './copia.ts';

const PLAZO = { id: 'a', titulo: 'A', fecha: '2026-11-07', categoria: 'Viaje' };
const POSICION = { nombre: 'X', tipo: 'accion', identificador: 'X', divisa: 'USD', cantidad: null };

function leerBien(valor: unknown) {
  const resultado = leerCopia(JSON.stringify(valor));
  assert.equal(resultado.ok, true);
  return (resultado as Extract<typeof resultado, { ok: true }>).copia;
}

function error(valor: unknown) {
  const resultado = leerCopia(typeof valor === 'string' ? valor : JSON.stringify(valor));
  assert.equal(resultado.ok, false);
  return (resultado as Extract<typeof resultado, { ok: false }>).error;
}

test('acepta una copia válida y separa el id de los campos', () => {
  const copia = leerBien({ version: 1, plazos: [PLAZO], posiciones: [POSICION] });
  assert.deepEqual(copia.plazos, [PLAZO]);
  assert.deepEqual(copia.posiciones, [POSICION]);
});

test('valida posiciones, aportaciones y valores liquidativos', () => {
  assert.match(error({ version: 1, posiciones: [{ nombre: 'X' }] }), /posiciones, elemento 1/);
  assert.match(
    error({ version: 1, aportaciones: [{ posicionId: 'a', fecha: '2026-11-02', importe: 0, valorLiquidativo: 10 }] }),
    /aportaciones, elemento 1/,
  );
  assert.match(
    error({ version: 1, liquidativos: [{ posicionId: 'a', fecha: 'ayer', valor: 10 }] }),
    /liquidativos, elemento 1/,
  );
});

test('rechaza lo que no es una copia', () => {
  assert.match(error('{no es json'), /JSON válido/);
  assert.match(error([1, 2]), /formato/);
  assert.match(error({ plazos: [] }), /versión/);
  assert.match(error({ version: 2 }), /versión/);
});

test('rechaza secciones desconocidas o mal formadas', () => {
  assert.match(error({ version: 1, plazoz: [] }), /desconocida: "plazoz"/);
  assert.match(error({ version: 1, plazos: {} }), /debe ser una lista/);
  assert.match(error({ version: 1, plazos: ['x'] }), /elemento 1: no es un objeto/);
  assert.match(error({ version: 1, ajustes: [] }), /ajustes/);
});

test('indica qué plazo falla', () => {
  assert.match(error({ version: 1, plazos: [PLAZO, { titulo: 'B' }] }), /plazos, elemento 2/);
});

test('rechaza ids que Firestore no admite', () => {
  for (const id of ['a/b', '..', '__x__x/', '', 3]) {
    assert.match(error({ version: 1, plazos: [{ ...PLAZO, id }] }), /id no es válido/);
  }
});

test('de los ajustes conserva solo los campos válidos', () => {
  const copia = leerBien({
    version: 1,
    ajustes: { finnhubKey: ' k ', salarioMinimo: null, diaCobro: 40, otro: 1 },
  });
  assert.deepEqual(copia.ajustes, { finnhubKey: 'k', salarioMinimo: null });
});

test('los ajustes vacíos toman los valores por defecto', () => {
  assert.equal(aAjustes({}).aportacionPorFondo, 250);
  assert.equal(aAjustes({ aportacionPorFondo: -5 }).aportacionPorFondo, 250);
  assert.equal(aAjustes({ aportacionPorFondo: 100 }).aportacionPorFondo, 100);
});

test('resume el contenido en español', () => {
  assert.equal(resumirCopia(leerBien({ version: 1 })), 'nada');
  assert.equal(resumirCopia(leerBien({ version: 1, plazos: [PLAZO] })), '1 plazos');
  assert.equal(
    resumirCopia(leerBien({ version: 1, plazos: [PLAZO], posiciones: [POSICION], ajustes: { diaCobro: 1 } })),
    '1 plazos, 1 posiciones y ajustes',
  );
});
