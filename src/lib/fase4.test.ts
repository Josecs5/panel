import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aAjustes } from './ajustes.ts';
import {
  aCandidatura,
  estaBajoMinimo,
  opcionesConActual,
  proximosPasos,
} from './candidaturas.ts';
import type { Candidatura } from './candidaturas.ts';
import { leerCopia } from './copia.ts';
import { aPrompt, filtrarPrompts, limpiarLista, listaDesdeTexto, todasLasEtiquetas } from './prompts.ts';
import type { Prompt } from './prompts.ts';
import { aConvocatoria, filtrarConvocatorias, ordenarConvocatorias, plazosDeConvocatorias } from './vivienda.ts';
import type { Convocatoria } from './vivienda.ts';

const conv = (id: string, extra: Partial<Convocatoria> = {}): Convocatoria => ({
  id,
  municipio: 'Villa A',
  promocion: `Promoción ${id}`,
  tipo: 'VPO',
  estado: 'abierta',
  finPlazo: null,
  conjunta: 'nose',
  requisitos: '',
  enlace: '',
  notas: '',
  ...extra,
});

const cand = (id: string, extra: Partial<Candidatura> = {}): Candidatura => ({
  id,
  empresa: id,
  puesto: 'Puesto',
  area: 'Otro',
  modalidad: '',
  salario: null,
  fecha: null,
  proximoPaso: 'Algo',
  proximoPasoFecha: null,
  enlace: '',
  contacto: '',
  notas: '',
  fase: 'enviada',
  ...extra,
});

const prompt = (id: string, extra: Partial<Prompt> = {}): Prompt => ({
  id,
  titulo: id,
  herramienta: '',
  etiquetas: [],
  texto: 'texto',
  ...extra,
});

// Vivienda

test('valida las convocatorias y completa lo opcional', () => {
  const base = { municipio: 'Villa A', promocion: 'P', tipo: 'VPO', estado: 'abierta' };
  const r = aConvocatoria('x', base);
  assert.equal(r?.conjunta, 'nose');
  assert.equal(r?.finPlazo, null);
  assert.equal(aConvocatoria('x', { ...base, municipio: ' ' }), null);
  assert.equal(aConvocatoria('x', { ...base, tipo: 'Otro' }), null);
  assert.equal(aConvocatoria('x', { ...base, estado: 'Abierta' }), null);
});

test('ordena por estado y luego por lo que vence antes', () => {
  const orden = ordenarConvocatorias([
    conv('cerrada', { estado: 'cerrada', finPlazo: '2026-01-01' }),
    conv('sin-fecha'),
    conv('tarde', { finPlazo: '2027-01-01' }),
    conv('pronto', { finPlazo: '2026-12-01' }),
    conv('proxima', { estado: 'proxima' }),
  ]);
  assert.deepEqual(orden.map((c) => c.id), ['pronto', 'tarde', 'sin-fecha', 'proxima', 'cerrada']);
});

test('filtra por municipio y por estado', () => {
  const lista = [conv('a'), conv('b', { municipio: 'Villa B' }), conv('c', { estado: 'cerrada' })];
  assert.deepEqual(filtrarConvocatorias(lista, null, null).length, 3);
  assert.deepEqual(filtrarConvocatorias(lista, 'Villa B', null).map((c) => c.id), ['b']);
  assert.deepEqual(filtrarConvocatorias(lista, null, 'cerrada').map((c) => c.id), ['c']);
  assert.deepEqual(filtrarConvocatorias(lista, 'Villa B', 'cerrada'), []);
});

test('solo las que tienen fin de plazo aparecen en Plazos', () => {
  const plazos = plazosDeConvocatorias([conv('a'), conv('b', { finPlazo: '2026-12-01', enlace: 'https://x.test' })]);
  assert.equal(plazos.length, 1);
  assert.deepEqual(plazos[0], {
    id: 'vivienda-b',
    titulo: 'Promoción b · Villa A',
    fecha: '2026-12-01',
    categoria: 'Vivienda',
    nota: '',
    enlace: 'https://x.test',
    origen: 'vivienda',
  });
});

// Candidaturas

test('valida las candidaturas', () => {
  const base = { empresa: 'E', puesto: 'P', fase: 'oferta', salario: 30000 };
  assert.equal(aCandidatura('x', base)?.salario, 30000);
  assert.equal(aCandidatura('x', base)?.area, 'Otro');
  assert.equal(aCandidatura('x', { ...base, salario: 'mucho' })?.salario, null);
  assert.equal(aCandidatura('x', { ...base, empresa: '' }), null);
  assert.equal(aCandidatura('x', { ...base, fase: 'otra' }), null);
});

test('marca el salario solo si está por debajo del mínimo', () => {
  assert.equal(estaBajoMinimo(29999, 30000), true);
  assert.equal(estaBajoMinimo(30000, 30000), false);
  assert.equal(estaBajoMinimo(null, 30000), false);
  assert.equal(estaBajoMinimo(29999, null), false);
});

test('los próximos pasos excluyen las descartadas y lo que no tiene paso', () => {
  const orden = proximosPasos([
    cand('sin-fecha'),
    cand('tarde', { proximoPasoFecha: '2026-12-01' }),
    cand('pronto', { proximoPasoFecha: '2026-11-05' }),
    cand('descartada', { fase: 'descartada', proximoPasoFecha: '2026-11-01' }),
    cand('vacia', { proximoPaso: '  ' }),
  ]);
  assert.deepEqual(orden.map((c) => c.id), ['pronto', 'tarde', 'sin-fecha']);
});

test('un valor guardado que ya no está en la lista sigue siendo elegible', () => {
  assert.deepEqual(opcionesConActual(['A'], 'B'), ['A', 'B']);
  assert.deepEqual(opcionesConActual(['A'], 'A'), ['A']);
  assert.deepEqual(opcionesConActual(['A'], ''), ['A']);
});

// Prompts

test('limpia listas: espacios, vacíos y repetidos sin distinguir mayúsculas', () => {
  assert.deepEqual(limpiarLista([' a ', '', 'A', 'b', 3]), ['a', 'b']);
  assert.deepEqual(listaDesdeTexto('uno, dos ,, Uno'), ['uno', 'dos']);
});

test('valida los prompts', () => {
  assert.deepEqual(aPrompt('x', { titulo: ' T ', texto: 'Z', etiquetas: ['a', 'a'] }), {
    id: 'x',
    titulo: 'T',
    herramienta: '',
    etiquetas: ['a'],
    texto: 'Z',
  });
  assert.equal(aPrompt('x', { titulo: 'T', texto: '  ' }), null);
  assert.equal(aPrompt('x', { texto: 'Z' }), null);
});

test('busca sin distinguir mayúsculas ni acentos, en todos los campos', () => {
  const lista = [
    prompt('Revisión', { herramienta: 'Claude', texto: 'Mejora el código' }),
    prompt('Resumen', { etiquetas: ['trabajo'] }),
  ];
  const buscar = (q: string) => filtrarPrompts(lista, q, null).map((p) => p.id);
  assert.deepEqual(buscar('revision'), ['Revisión']);
  assert.deepEqual(buscar('CODIGO'), ['Revisión']);
  assert.deepEqual(buscar('claude mejora'), ['Revisión']);
  assert.deepEqual(buscar('trabajo'), ['Resumen']);
  assert.deepEqual(buscar('claude trabajo'), []);
  assert.deepEqual(buscar('  '), ['Resumen', 'Revisión']);
});

test('filtra por etiqueta y las lista sin repetir', () => {
  const lista = [prompt('a', { etiquetas: ['z', 'y'] }), prompt('b', { etiquetas: ['y'] })];
  assert.deepEqual(filtrarPrompts(lista, '', 'z').map((p) => p.id), ['a']);
  assert.deepEqual(todasLasEtiquetas(lista), ['y', 'z']);
});

// Ajustes y copia

test('los ajustes guardan municipios y áreas limpios', () => {
  const a = aAjustes({ municipios: [' Villa A ', 'villa a', ''], areas: 'no es lista' });
  assert.deepEqual(a.municipios, ['Villa A']);
  assert.deepEqual(a.areas, []);
});

test('la copia valida vivienda, candidaturas y prompts', () => {
  const error = (v: unknown) => {
    const r = leerCopia(JSON.stringify(v));
    assert.equal(r.ok, false);
    return (r as Extract<typeof r, { ok: false }>).error;
  };
  assert.match(error({ version: 1, vivienda: [{ municipio: 'A' }] }), /vivienda, elemento 1/);
  assert.match(error({ version: 1, candidaturas: [{ empresa: 'A' }] }), /candidaturas, elemento 1/);
  assert.match(error({ version: 1, prompts: [{ titulo: 'A' }] }), /prompts, elemento 1/);
  const ok = leerCopia(JSON.stringify({ version: 1, ajustes: { municipios: ['A'], areas: ['B'] } }));
  assert.equal(ok.ok, true);
  assert.deepEqual((ok as Extract<typeof ok, { ok: true }>).copia.ajustes, { municipios: ['A'], areas: ['B'] });
});
