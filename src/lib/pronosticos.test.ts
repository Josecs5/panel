import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerCopia } from './copia.ts';
import {
  aDatosApuesta,
  aDatosEstadisticasCL,
  aJornada,
  aLiquidacion,
  aPartido,
  aciertos,
  aAjustesPronosticos,
  beneficioAcumulado,
  calcularPendientes,
  centimosDisponibles,
  datosJugadoresAntiguos,
  derbisATexto,
  derbisDesdeTexto,
  ejecucionAntigua,
  estadoMercado,
  etiquetaClave,
  mercadosPrincipales,
  signoMasProbable,
  type ApuestaReal,
  type ItemPronostico,
  type Partido,
} from './pronosticos.ts';
import { aFilas, leerNumero, leerTabla, nombresDudosos, parecidoNombres, proponerAsignacion } from './tablaPegada.ts';

test('una tabla pegada con columnas desordenadas se lee bien', () => {
  const texto = [
    'SoT\tFld\tPlayer\tSquad\tCrdY\tMin\tFls',
    '12\t30\tAna Ruiz\tEquipo A\t3\t1.234\t25',
    '4\t8\tEva Sanz\tEquipo B\t1\t900\t10',
  ].join('\n');
  const tabla = leerTabla(texto);
  assert.equal(tabla.conCabecera, true);
  const asignacion = proponerAsignacion(tabla.cabecera);
  assert.deepEqual(asignacion, {
    jugador: 2,
    equipo: 3,
    minutos: 5,
    faltas_cometidas: 6,
    faltas_recibidas: 1,
    amarillas: 4,
    tiros_puerta: 0,
  });
  const { filas, descartadas, error } = aFilas(tabla, asignacion);
  assert.equal(error, null);
  assert.equal(descartadas, 0);
  assert.deepEqual(filas[0], {
    jugador: 'Ana Ruiz',
    equipo: 'Equipo A',
    minutos: 1234,
    faltas_cometidas: 25,
    faltas_recibidas: 30,
    amarillas: 3,
    tiros_puerta: 12,
  });
});

test('lee CSV con comillas y punto y coma, y cabeceras en español', () => {
  const coma = leerTabla('Jugador,Minutos\n"Ruiz, Ana",900\n');
  assert.deepEqual(coma.filas, [['Ruiz, Ana', '900']]);
  const puntoYComa = leerTabla('Tiros a puerta;Faltas recibidas;Faltas cometidas;Minutos;Jugador\n1;2;3;90;Ana\n');
  const asignacion = proponerAsignacion(puntoYComa.cabecera);
  assert.deepEqual(asignacion, { jugador: 4, minutos: 3, faltas_cometidas: 2, faltas_recibidas: 1, tiros_puerta: 0 });
});

test('sin cabecera se nombran las columnas y hay que asignarlas a mano', () => {
  const tabla = leerTabla('Ana\t90\nEva\t45');
  assert.equal(tabla.conCabecera, false);
  assert.deepEqual(tabla.cabecera, ['Columna 1', 'Columna 2']);
  assert.equal(aFilas(tabla, {}).error, 'Indica qué columna es la del jugador.');
  assert.equal(aFilas(tabla, { jugador: 0 }).error, 'Indica qué columna son los minutos.');
  assert.equal(aFilas(tabla, { jugador: 0, minutos: 1 }).filas.length, 2);
});

test('las filas sin jugador, sin minutos o con datos inválidos se descartan y se cuentan', () => {
  const tabla = leerTabla('Player,Min,Fls\nAna,90,3\n,90,1\nEva,0,1\nLuz,90,x\n');
  const { filas, descartadas } = aFilas(tabla, proponerAsignacion(tabla.cabecera));
  assert.deepEqual(filas.map((f) => f.jugador), ['Ana']);
  assert.equal(descartadas, 3);
});

test('los números admiten formato español e inglés', () => {
  assert.equal(leerNumero('1.234'), 1234);
  assert.equal(leerNumero('1,234'), 1234);
  assert.equal(leerNumero('1,5'), 1.5);
  assert.equal(leerNumero('1.5'), 1.5);
  assert.equal(leerNumero(''), 0);
  assert.equal(leerNumero('-'), 0);
  assert.equal(leerNumero('n/d'), null);
});

test('los nombres parecidos se preguntan y los idénticos no', () => {
  assert.equal(parecidoNombres('Ruiz, Ana', 'Ana Ruiz'), 1);
  assert.equal(parecidoNombres('Ánа Rúiz', 'Ana Ruiz') > 0.5, true);
  const dudas = nombresDudosos(['Ana Ruiz', 'Vinicius Junior', 'Nadie Conocido'], ['Ruiz, Ana', 'Vinícius Jr.']);
  assert.deepEqual(dudas, [{ nombre: 'Vinicius Junior', candidatos: ['Vinícius Jr.'] }]);
});

const ITEM = (final: number, extra: Partial<ItemPronostico> = {}): ItemPronostico => ({
  grupo: '1x2',
  modelo: final,
  mercado: final,
  final,
  cuota: 2,
  casa: 'bet365.es',
  ...extra,
});

test('los mercados se nombran con los equipos del partido', () => {
  assert.equal(etiquetaClave('1', 'A', 'B'), 'Gana A');
  assert.equal(etiquetaClave('X2', 'A', 'B'), 'B o empate');
  assert.equal(etiquetaClave('o25', 'A', 'B'), 'Más de 2,5 goles');
  assert.equal(etiquetaClave('corners_u105', 'A', 'B'), 'Menos de 10,5 córners');
  assert.equal(etiquetaClave('tarjetas_v_o15', 'A', 'B'), 'B: más de 1,5 tarjetas');
  assert.equal(etiquetaClave('jug:tarjeta:Ruiz, Ana', 'A', 'B'), 'Ruiz, Ana: ve tarjeta');
});

test('de cada estadística se muestra la línea más igualada', () => {
  const claves = mercadosPrincipales({
    o25: ITEM(0.5),
    u25: ITEM(0.5),
    corners_o75: ITEM(0.8),
    corners_u75: ITEM(0.2),
    corners_o95: ITEM(0.52),
    corners_u95: ITEM(0.48),
    corners_l_o45: ITEM(0.45),
  });
  assert.deepEqual(claves, ['o25', 'u25', 'corners_o95', 'corners_u95', 'corners_l_o45']);
});

test('el estado de cada mercado sigue las reglas decididas tras el backtest', () => {
  assert.equal(estadoMercado('1x2', undefined).apostable, true);
  assert.equal(estadoMercado('ou25', undefined).apostable, true);
  assert.deepEqual(estadoMercado('corners', undefined), { apostable: false, texto: 'Bloqueado: 0 de 50 liquidados' });
  assert.equal(estadoMercado('faltas', undefined).texto, 'Sin cuotas: solo informativo');
  const conMotivo = (motivo: string, apostable = false) =>
    ({ motivo, apostable, n: 60 }) as never;
  assert.equal(estadoMercado('1x2', conMotivo('en_pausa')).texto, 'En pausa');
  assert.equal(estadoMercado('corners', conMotivo('desbloqueado', true)).apostable, true);
  assert.equal(estadoMercado('corners', conMotivo('bloqueado_peor_que_mercado')).apostable, false);
});

const APUESTA = (id: string, semana: string, stake: number, extra: Partial<ApuestaReal> = {}): ApuestaReal => ({
  id,
  semana,
  estado: 'hecha',
  cuotaReal: 2,
  stakeRealCentimos: stake,
  selecciones: [{ partido: '1', clave: '1' }],
  ...extra,
});

test('lo apostado no puede pasar del tope de 5 € por jornada', () => {
  const lista = [APUESTA('a', 'S1', 300), APUESTA('b', 'S1', 100), APUESTA('c', 'S2', 500)];
  assert.equal(centimosDisponibles(lista, 'S1', 'nueva'), 100);
  assert.equal(centimosDisponibles(lista, 'S1', 'a'), 400);
  assert.equal(centimosDisponibles(lista, 'S2', 'nueva'), 0);
  assert.equal(centimosDisponibles(lista, 'S3', 'nueva'), 500);
});

test('las pérdidas de una jornada no cambian el tope de la siguiente', () => {
  const perdida = APUESTA('a', 'S1', 500, { liquidacion: { estado: 'perdida', beneficioCentimos: -500, clv: null } });
  assert.equal(centimosDisponibles([perdida], 'S2', 'nueva'), 500);
});

test('el beneficio acumulado va por jornadas e ignora lo no liquidado', () => {
  const lista = [
    APUESTA('b', 'S2', 100, { liquidacion: { estado: 'ganada', beneficioCentimos: 120, clv: null } }),
    APUESTA('a', 'S1', 100, { liquidacion: { estado: 'perdida', beneficioCentimos: -100, clv: null } }),
    APUESTA('c', 'S2', 100),
    APUESTA('d', 'S2', 100, { estado: 'no_hecha' }),
  ];
  assert.deepEqual(beneficioAcumulado(lista), [
    { semana: 'S1', beneficio: -100, acumulado: -100 },
    { semana: 'S2', beneficio: 120, acumulado: 20 },
  ]);
});

const PARTIDO = (id: string, inicio: string, competicion = 'CL'): Partido => ({
  id,
  competicion,
  inicio,
  local: 'A',
  visitante: 'B',
  jornada: 'S1',
  version: 1,
  actualizado: '',
  golesLocal: 1,
  golesVisitante: 1,
  marcadores: [],
  rangos: {},
  items: {},
  jugadores: {
    faltas: [
      { jugador: 'Ana', prob: 0.8, origen: 'mercado' },
      { jugador: 'Eva', prob: 0.7, origen: 'mercado' },
    ],
    tarjeta: [{ jugador: 'Luz', prob: 0.3, origen: 'mercado' }],
  },
  congelado: 'x',
});

test('los pendientes piden estadísticas de Champions y comprueban solo a los jugadores debidos', () => {
  const ahora = Date.parse('2026-11-05T12:00:00Z');
  const cl = PARTIDO('1', '2026-11-04T20:00:00Z');
  const liga = PARTIDO('2', '2026-11-04T18:00:00Z', 'PL');
  const futuro = PARTIDO('3', '2026-11-05T20:00:00Z');
  const caducado = PARTIDO('4', '2026-10-20T20:00:00Z');
  const apuesta = APUESTA('a', 'S1', 100, { selecciones: [{ partido: '1', clave: 'jug:faltas:Eva' }] });
  const salida = calcularPendientes([cl, liga, futuro, caducado], [], [], [apuesta], ahora);

  assert.deepEqual(salida.map((p) => p.partido.id), ['2', '1']);
  const delCl = salida.find((p) => p.partido.id === '1')!;
  assert.equal(delCl.faltanEstadisticas, true);
  assert.deepEqual(delCl.preguntas.map((p) => p.clave).sort(), ['faltas:Ana', 'faltas:Eva', 'tarjeta:Luz']);
  assert.equal(salida.find((p) => p.partido.id === '2')!.faltanEstadisticas, false);
});

test('un partido deja de estar pendiente al responderlo todo', () => {
  const ahora = Date.parse('2026-11-05T12:00:00Z');
  const cl = PARTIDO('1', '2026-11-04T20:00:00Z');
  const respuestas = { id: '1', respuestas: { 'faltas:Ana': true, 'tarjeta:Luz': false } };
  assert.deepEqual(calcularPendientes([cl], [{ id: '1' }], [respuestas], [], ahora), []);
  const parcial = { id: '1', respuestas: { 'faltas:Ana': true } };
  const salida = calcularPendientes([cl], [{ id: '1' }], [parcial], [], ahora);
  assert.deepEqual(salida[0].preguntas.map((p) => p.clave), ['tarjeta:Luz']);
});

test('avisa si los datos de jugadores tienen más de 14 días o no hay ninguno', () => {
  const ahora = Date.parse('2026-11-20T00:00:00Z');
  assert.equal(datosJugadoresAntiguos([], ahora), true);
  assert.equal(datosJugadoresAntiguos([{ fecha: '2026-11-01T00:00:00Z' }], ahora), true);
  assert.equal(datosJugadoresAntiguos([{ fecha: '2026-11-10T00:00:00Z' }], ahora), false);
});

test('una ejecución de hace más de 36 horas se presenta como antigua', () => {
  const ahora = Date.parse('2026-11-05T12:00:00Z');
  const ejecucion = (fecha: string) => ({ fecha }) as never;
  assert.equal(ejecucionAntigua(null, ahora), true);
  assert.equal(ejecucionAntigua(ejecucion('2026-11-05T05:00:00Z'), ahora), false);
  assert.equal(ejecucionAntigua(ejecucion('2026-11-03T05:00:00Z'), ahora), true);
});

test('los datos con mala forma se descartan en lugar de romper la página', () => {
  assert.equal(aPartido('1', { local: 'A' }), null);
  assert.equal(aJornada('1', {}), null);
  assert.equal(aLiquidacion('1', { inicio: 'x' }), null);
  const partido = aPartido('1', {
    inicio: '2026-11-05T20:00:00Z',
    local: 'A',
    visitante: 'B',
    golesLocal: 1,
    golesVisitante: 1,
    items: { '1': { final: 0.5, grupo: '1x2' }, malo: { final: 'x' } },
    marcadores: [{ local: 1, visitante: 0, prob: 0.1 }, { local: 'x' }],
  });
  assert.deepEqual(Object.keys(partido!.items), ['1']);
  assert.equal(partido!.marcadores.length, 1);
});

test('una apuesta hecha exige cuota y stake reales, y se conserva su liquidación', () => {
  const base = { estado: 'hecha', semana: 'S1', selecciones: [{ partido: '1', clave: '1' }] };
  assert.equal(aDatosApuesta(base), null);
  assert.equal(aDatosApuesta({ ...base, cuotaReal: 1, stakeRealCentimos: 100 }), null);
  assert.equal(aDatosApuesta({ ...base, cuotaReal: 2, stakeRealCentimos: 0 }), null);
  const hecha = aDatosApuesta({
    ...base,
    cuotaReal: 2,
    stakeRealCentimos: 100,
    liquidacion: { estado: 'ganada', beneficioCentimos: 100, clv: 0.02 },
  });
  assert.equal(hecha!.liquidacion!.beneficioCentimos, 100);
  assert.equal(aDatosApuesta({ ...base, estado: 'no_hecha' })!.estado, 'no_hecha');
  assert.equal(aDatosApuesta({ estado: 'hecha' }), null);
});

test('las estadísticas de Champions exigen los ocho conteos enteros', () => {
  const completas = {
    corners_l: 5,
    corners_v: 4,
    faltas_l: 10,
    faltas_v: 12,
    tarjetas_l: 2,
    tarjetas_v: 1,
    tiros_puerta_l: 6,
    tiros_puerta_v: 3,
  };
  assert.deepEqual(aDatosEstadisticasCL(completas), completas);
  assert.equal(aDatosEstadisticasCL({ ...completas, corners_l: 1.5 }), null);
  assert.equal(aDatosEstadisticasCL({ ...completas, faltas_v: undefined }), null);
});

test('los ajustes ignoran valores inválidos y no incluyen el tope', () => {
  const a = aAjustesPronosticos({
    casas: ['bet365.es', 7, ' '],
    maxDestacadosLiga: 99,
    maxDestacadosChampions: 2,
    veMinimo: -1,
    probMinima: 0.3,
    tope: 100000,
  });
  assert.deepEqual(a.casas, ['bet365.es']);
  assert.equal(a.maxDestacadosLiga, 3);
  assert.equal(a.maxDestacadosChampions, 2);
  assert.equal(a.veMinimo, 0.04);
  assert.equal(a.probMinima, 0.3);
  assert.equal('tope' in a, false);
});

test('los derbis se leen por líneas y conservan los guiones del nombre', () => {
  const derbis = derbisDesdeTexto('Real Madrid CF - Club Atlético de Madrid\nsin separador\nParis Saint-Germain vs Olympique');
  assert.deepEqual(derbis, [
    { local: 'Real Madrid CF', visitante: 'Club Atlético de Madrid' },
    { local: 'Paris Saint-Germain', visitante: 'Olympique' },
  ]);
  assert.equal(derbisATexto(derbis.slice(0, 1)), 'Real Madrid CF - Club Atlético de Madrid');
});

test('los aciertos cuentan solo lo liquidado y el signo más probable', () => {
  const item = (estado: string, final: number, grupo = '1x2') => ({ estado, final, grupo, modelo: null, mercado: null, cuota: null });
  const liquidacion = aLiquidacion('1', {
    inicio: '2026-11-05T20:00:00Z',
    items: { '1': item('ganada', 0.6), X: item('perdida', 0.25), '2': item('perdida', 0.15), corners_o95: item('sin_liquidar', 0.5, 'corners') },
  })!;
  assert.deepEqual(aciertos(liquidacion, null).total, 3);
  assert.deepEqual(aciertos(liquidacion, '1x2').ganadas, 1);
  assert.deepEqual(aciertos(liquidacion, 'corners').total, 0);
  assert.deepEqual(signoMasProbable(liquidacion), { clave: '1', prob: 0.6, acierto: true });
});

test('la copia de seguridad valida los datos manuales de Pronósticos', () => {
  const buena = leerCopia(
    JSON.stringify({
      version: 1,
      pronApuestas: [{ id: '2026-W46-1', estado: 'no_hecha', semana: 'S1', selecciones: [{ partido: '1', clave: '1' }] }],
      pronImportaciones: [{ id: 'a', fuente: 'web', fecha: '2026-11-03', filas: [{ jugador: 'Ana', minutos: 90 }] }],
      pronComprobaciones: [{ id: '1', respuestas: { 'faltas:Ana': true } }],
      ajustesPronosticos: { casas: ['bet365.es'] },
    }),
  );
  assert.equal(buena.ok, true);
  const mala = leerCopia(JSON.stringify({ version: 1, pronEstadisticasCL: [{ id: '1', corners_l: 'x' }] }));
  assert.equal(mala.ok, false);
});
