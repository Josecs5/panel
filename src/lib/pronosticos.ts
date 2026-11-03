// Tipos, conversores y reglas de la sección Pronósticos. El proceso diario escribe los
// pronósticos; la web solo los lee y guarda lo que introduce el usuario.

/** Tope por jornada. No se lee de Ajustes: no se puede editar desde la web. */
export const TOPE_JORNADA_CENTIMOS = 500;
export const DIAS_PARA_LIQUIDAR = 7;
export const DIAS_DATOS_JUGADORES = 14;
export const CASOS_PARA_DESBLOQUEAR = 50;
export const MUESTRA_PEQUENA = 30;
/** Un partido se da por terminado a las 2,5 horas de empezar. */
const DURACION_PARTIDO_MS = 2.5 * 3_600_000;
/** Sin ejecución en este tiempo, los datos se presentan como antiguos. */
const HORAS_EJECUCION_ANTIGUA = 36;

export const COMPETICIONES = ['PD', 'PL', 'BL1', 'SA', 'CL'] as const;
export const NOMBRE_COMPETICION: Record<string, string> = {
  PD: 'LaLiga',
  PL: 'Premier League',
  BL1: 'Bundesliga',
  SA: 'Serie A',
  CL: 'Champions League',
};

export const NOMBRE_GRUPO: Record<string, string> = {
  '1x2': '1X2',
  doble_oportunidad: 'Doble oportunidad',
  ou15: 'Más/menos 1,5',
  ou25: 'Más/menos 2,5',
  ou35: 'Más/menos 3,5',
  ambos_marcan: 'Ambos marcan',
  tiros_puerta: 'Tiros a puerta',
  tiros_puerta_equipo: 'Tiros a puerta por equipo',
  corners: 'Córners',
  corners_equipo: 'Córners por equipo',
  faltas: 'Faltas',
  faltas_equipo: 'Faltas por equipo',
  tarjetas: 'Tarjetas',
  tarjetas_equipo: 'Tarjetas por equipo',
  jugador_faltas: 'Jugador: comete falta',
  jugador_recibe_falta: 'Jugador: recibe falta',
  jugador_tarjeta: 'Jugador: ve tarjeta',
  jugador_tiros_puerta: 'Jugador: tira a puerta',
};

const COMPROBADOS = new Set(['1x2', 'ou25']);
const SIN_CUOTAS = new Set([
  'tiros_puerta',
  'tiros_puerta_equipo',
  'faltas',
  'faltas_equipo',
  'jugador_recibe_falta',
]);

export const ESTADISTICAS = ['tiros_puerta', 'corners', 'faltas', 'tarjetas'] as const;
export type Estadistica = (typeof ESTADISTICAS)[number];
export const NOMBRE_ESTADISTICA: Record<Estadistica, string> = {
  tiros_puerta: 'Tiros a puerta',
  corners: 'Córners',
  faltas: 'Faltas',
  tarjetas: 'Tarjetas',
};

export const CATEGORIAS_JUGADOR = ['faltas', 'recibe_falta', 'tarjeta', 'tiros_puerta'] as const;
export type CategoriaJugador = (typeof CATEGORIAS_JUGADOR)[number];
export const NOMBRE_CATEGORIA: Record<CategoriaJugador, string> = {
  faltas: 'Comete falta',
  recibe_falta: 'Recibe falta',
  tarjeta: 'Ve tarjeta',
  tiros_puerta: 'Tira a puerta',
};
export const PREGUNTA_CATEGORIA: Record<CategoriaJugador, string> = {
  faltas: '¿Cometió falta?',
  recibe_falta: '¿Recibió falta?',
  tarjeta: '¿Vio tarjeta?',
  tiros_puerta: '¿Tiró a puerta?',
};

export type ItemPronostico = {
  grupo: string;
  modelo: number | null;
  mercado: number | null;
  final: number;
  cuota: number | null;
  casa: string | null;
};
export type Rango = { total: number[]; local: number[]; visitante: number[] };
export type JugadorTop = { jugador: string; prob: number; origen: string };
export type Partido = {
  id: string;
  competicion: string;
  inicio: string;
  local: string;
  visitante: string;
  jornada: string;
  version: number;
  actualizado: string;
  golesLocal: number;
  golesVisitante: number;
  marcadores: { local: number; visitante: number; prob: number }[];
  rangos: Partial<Record<Estadistica, Rango>>;
  items: Record<string, ItemPronostico>;
  jugadores: Partial<Record<CategoriaJugador, JugadorTop[]>>;
  congelado: string | null;
};

export type SeleccionBoleto = {
  partido: string;
  local: string;
  visitante: string;
  clave: string;
  casa: string;
  cuota: number;
  prob: number;
  ve: number;
  cuotaMinima: number;
};
export type ApuestaBoleto = {
  id: string;
  combinada: boolean;
  prob: number;
  cuota: number;
  ve: number;
  cuotaMinima: number;
  stakeCentimos: number;
  selecciones: SeleccionBoleto[];
};
export type Boleto = {
  generado: string;
  version: number;
  vacio: boolean;
  totalCentimos: number;
  ve: number | null;
  apuestas: ApuestaBoleto[];
};
export type Jornada = {
  id: string;
  semana: string;
  inicio: string;
  fin: string;
  destacados: string[];
  boleto: Boleto | null;
  seguimiento: Record<string, { cuotaHoy: number; cumple: boolean }>;
};

export type ItemLiquidado = {
  estado: string;
  grupo: string;
  final: number;
  modelo: number | null;
  mercado: number | null;
  cuota: number | null;
};
export type Liquidacion = {
  id: string;
  competicion: string;
  inicio: string;
  version: number;
  local: string;
  visitante: string;
  jornada: string;
  resultado: { local: number | null; visitante: number | null };
  items: Record<string, ItemLiquidado>;
  fin: boolean;
};

export type DatosApuesta = {
  semana: string;
  estado: 'hecha' | 'no_hecha';
  cuotaReal: number | null;
  stakeRealCentimos: number | null;
  selecciones: { partido: string; clave: string }[];
  liquidacion?: { estado: string; beneficioCentimos: number; clv: number | null };
};
export type ApuestaReal = DatosApuesta & { id: string };

export const CAMPOS_NUMERICOS = ['minutos', 'faltas_cometidas', 'faltas_recibidas', 'amarillas', 'tiros_puerta'] as const;

/** Solo lleva los datos que traía la tabla: el proceso diario combina las importaciones. */
export type FilaJugador = {
  jugador: string;
  equipo: string;
} & Partial<Record<(typeof CAMPOS_NUMERICOS)[number], number>>;
export type DatosImportacion = { fuente: string; fecha: string; filas: FilaJugador[] };
export type Importacion = DatosImportacion & { id: string };

export const CAMPOS_ESTADISTICA_CL = [
  'corners_l',
  'corners_v',
  'faltas_l',
  'faltas_v',
  'tarjetas_l',
  'tarjetas_v',
  'tiros_puerta_l',
  'tiros_puerta_v',
] as const;
export type DatosEstadisticasCL = Record<(typeof CAMPOS_ESTADISTICA_CL)[number], number>;
export type EstadisticasCL = DatosEstadisticasCL & { id: string };

export type DatosComprobacion = { respuestas: Record<string, boolean> };
export type Comprobacion = DatosComprobacion & { id: string };

export type AjustesPronosticos = {
  casas: string[];
  maxDestacadosLiga: number;
  maxDestacadosChampions: number;
  derbis: { local: string; visitante: string }[];
  veMinimo: number;
  probMinima: number;
  cuotaMinima: number;
  cuotaMaxima: number;
  veMinimoCombinada: number;
  probMinimaCombinada: number;
  inicioJornada: number;
};
export const AJUSTES_PRONOSTICOS_INICIALES: AjustesPronosticos = {
  casas: ['bet365.es', 'codere.es', 'bwin.es'],
  maxDestacadosLiga: 3,
  maxDestacadosChampions: 4,
  derbis: [],
  veMinimo: 0.04,
  probMinima: 0.25,
  cuotaMinima: 1.4,
  cuotaMaxima: 5,
  veMinimoCombinada: 0.04,
  probMinimaCombinada: 0.15,
  inicioJornada: 0,
};

export type Ejecucion = {
  fecha: string;
  version: number;
  partidos: number;
  errores: string[];
  avisos: string[];
  peticiones: Record<string, number>;
  oddsPapi: { mes?: string; gastadas?: number; restantes?: number };
  clubEloResponde: boolean;
  ultimaImportacion: string | null;
};

export type MetricasGrupo = {
  n: number;
  n_total: number;
  esperado: number;
  real: number;
  brier: number;
  log_loss_final: number;
  log_loss_modelo?: number;
  log_loss?: number;
  log_loss_mercado?: number;
  calibracion: { tramo: string; n: number; esperado: number; real: number; muestra_pequena: boolean }[];
  muestra_pequena: boolean;
  apostable?: boolean;
  motivo?: string;
};
export type MetricasApuestas = {
  n: number;
  apostadoCentimos: number;
  beneficioCentimos: number;
  roi: number | null;
  clv: number | null;
  muestra_pequena: boolean;
};
export type Metricas = {
  generado: string;
  grupos: Record<string, MetricasGrupo>;
  detalle: Record<string, MetricasGrupo>;
  apuestas: MetricasApuestas;
};
export type Version = {
  id: string;
  numero: number;
  creada: string;
  pesos: Record<string, number>;
  changelog: { texto: string }[];
};

// --- Conversores: lo que no tenga la forma esperada se descarta, nunca rompe la página.

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const texto = (v: unknown, otro = '') => (typeof v === 'string' ? v : otro);
const numeroONull = (v: unknown) => (esNumero(v) ? v : null);

function aItem(crudo: unknown): ItemPronostico | null {
  if (!esObjeto(crudo) || !esNumero(crudo.final)) return null;
  return {
    grupo: texto(crudo.grupo),
    modelo: numeroONull(crudo.modelo),
    mercado: numeroONull(crudo.mercado),
    final: crudo.final,
    cuota: numeroONull(crudo.cuota),
    casa: typeof crudo.casa === 'string' ? crudo.casa : null,
  };
}

export function aPartido(id: string, c: Record<string, unknown>): Partido | null {
  if (typeof c.inicio !== 'string' || typeof c.local !== 'string' || typeof c.visitante !== 'string') return null;
  if (!esNumero(c.golesLocal) || !esNumero(c.golesVisitante) || !esObjeto(c.items)) return null;
  const items: Record<string, ItemPronostico> = {};
  for (const [clave, valor] of Object.entries(c.items)) {
    const item = aItem(valor);
    if (item) items[clave] = item;
  }
  return {
    id,
    competicion: texto(c.competicion),
    inicio: c.inicio,
    local: c.local,
    visitante: c.visitante,
    jornada: texto(c.jornada),
    version: esNumero(c.version) ? c.version : 0,
    actualizado: texto(c.actualizado),
    golesLocal: c.golesLocal,
    golesVisitante: c.golesVisitante,
    marcadores: Array.isArray(c.marcadores)
      ? c.marcadores.filter(
          (m): m is { local: number; visitante: number; prob: number } =>
            esObjeto(m) && esNumero(m.local) && esNumero(m.visitante) && esNumero(m.prob),
        )
      : [],
    rangos: esObjeto(c.rangos) ? (c.rangos as Partido['rangos']) : {},
    items,
    jugadores: esObjeto(c.jugadores) ? (c.jugadores as Partido['jugadores']) : {},
    congelado: typeof c.congelado === 'string' ? c.congelado : null,
  };
}

export function aJornada(id: string, c: Record<string, unknown>): Jornada | null {
  if (typeof c.inicio !== 'string' || typeof c.fin !== 'string') return null;
  return {
    id,
    semana: texto(c.semana, id),
    inicio: c.inicio,
    fin: c.fin,
    destacados: Array.isArray(c.destacados) ? c.destacados.map(String) : [],
    boleto: esObjeto(c.boleto) && Array.isArray(c.boleto.apuestas) ? (c.boleto as Boleto) : null,
    seguimiento: esObjeto(c.seguimiento) ? (c.seguimiento as Jornada['seguimiento']) : {},
  };
}

export function aLiquidacion(id: string, c: Record<string, unknown>): Liquidacion | null {
  if (typeof c.inicio !== 'string' || !esObjeto(c.items)) return null;
  const resultado = esObjeto(c.resultado) ? c.resultado : {};
  return {
    id,
    competicion: texto(c.competicion),
    inicio: c.inicio,
    version: esNumero(c.version) ? c.version : 0,
    local: texto(c.local),
    visitante: texto(c.visitante),
    jornada: texto(c.jornada),
    resultado: { local: numeroONull(resultado.local), visitante: numeroONull(resultado.visitante) },
    items: c.items as Record<string, ItemLiquidado>,
    fin: c.fin === true,
  };
}

export function aDatosApuesta(c: Record<string, unknown>): DatosApuesta | null {
  if ((c.estado !== 'hecha' && c.estado !== 'no_hecha') || !Array.isArray(c.selecciones)) return null;
  const hecha = c.estado === 'hecha';
  if (hecha && (!esNumero(c.cuotaReal) || c.cuotaReal <= 1)) return null;
  if (hecha && (!esNumero(c.stakeRealCentimos) || c.stakeRealCentimos <= 0)) return null;
  const selecciones = c.selecciones.filter(
    (s): s is { partido: string; clave: string } =>
      esObjeto(s) && typeof s.partido === 'string' && typeof s.clave === 'string',
  );
  if (!selecciones.length) return null;
  const datos: DatosApuesta = {
    semana: texto(c.semana),
    estado: c.estado,
    cuotaReal: numeroONull(c.cuotaReal),
    stakeRealCentimos: numeroONull(c.stakeRealCentimos),
    selecciones: selecciones.map(({ partido, clave }) => ({ partido, clave })),
  };
  // La liquidación la añade el proceso diario; hay que conservarla en una copia.
  if (esObjeto(c.liquidacion) && typeof c.liquidacion.estado === 'string' && esNumero(c.liquidacion.beneficioCentimos)) {
    datos.liquidacion = {
      estado: c.liquidacion.estado,
      beneficioCentimos: c.liquidacion.beneficioCentimos,
      clv: numeroONull(c.liquidacion.clv),
    };
  }
  return datos;
}

export const aApuestaReal = (id: string, c: Record<string, unknown>): ApuestaReal | null => {
  const datos = aDatosApuesta(c);
  return datos && { id, ...datos };
};

function aFilaJugador(c: unknown): FilaJugador | null {
  if (!esObjeto(c) || typeof c.jugador !== 'string' || !c.jugador.trim()) return null;
  const fila: FilaJugador = { jugador: c.jugador.trim(), equipo: texto(c.equipo).trim() };
  for (const campo of CAMPOS_NUMERICOS) {
    const valor = c[campo];
    if (esNumero(valor) && valor >= 0) fila[campo] = valor;
  }
  return CAMPOS_NUMERICOS.some((campo) => fila[campo] !== undefined) ? fila : null;
}

export function aDatosImportacion(c: Record<string, unknown>): DatosImportacion | null {
  if (typeof c.fecha !== 'string' || !Array.isArray(c.filas)) return null;
  const filas = c.filas.map(aFilaJugador).filter((f): f is FilaJugador => f !== null);
  if (!filas.length) return null;
  return { fuente: texto(c.fuente), fecha: c.fecha, filas };
}

export const aImportacion = (id: string, c: Record<string, unknown>): Importacion | null => {
  const datos = aDatosImportacion(c);
  return datos && { id, ...datos };
};

export function aDatosEstadisticasCL(c: Record<string, unknown>): DatosEstadisticasCL | null {
  const salida = {} as DatosEstadisticasCL;
  for (const campo of CAMPOS_ESTADISTICA_CL) {
    const valor = c[campo];
    if (!esNumero(valor) || valor < 0 || !Number.isInteger(valor)) return null;
    salida[campo] = valor;
  }
  return salida;
}

export const aEstadisticasCL = (id: string, c: Record<string, unknown>): EstadisticasCL | null => {
  const datos = aDatosEstadisticasCL(c);
  return datos && { id, ...datos };
};

export function aDatosComprobacion(c: Record<string, unknown>): DatosComprobacion | null {
  if (!esObjeto(c.respuestas)) return null;
  const respuestas: Record<string, boolean> = {};
  for (const [clave, valor] of Object.entries(c.respuestas)) {
    if (typeof valor === 'boolean') respuestas[clave] = valor;
  }
  return { respuestas };
}

export const aComprobacion = (id: string, c: Record<string, unknown>): Comprobacion | null => {
  const datos = aDatosComprobacion(c);
  return datos && { id, ...datos };
};

export function aAjustesPronosticos(c: Record<string, unknown>): AjustesPronosticos {
  const a = { ...AJUSTES_PRONOSTICOS_INICIALES };
  if (Array.isArray(c.casas)) {
    const casas = c.casas.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
    if (casas.length) a.casas = casas;
  }
  if (Array.isArray(c.derbis)) {
    a.derbis = c.derbis.filter(
      (d): d is { local: string; visitante: string } =>
        esObjeto(d) && typeof d.local === 'string' && typeof d.visitante === 'string',
    );
  }
  const entero = (v: unknown, min: number, max: number) => esNumero(v) && Number.isInteger(v) && v >= min && v <= max;
  if (entero(c.maxDestacadosLiga, 0, 10)) a.maxDestacadosLiga = c.maxDestacadosLiga as number;
  if (entero(c.maxDestacadosChampions, 0, 10)) a.maxDestacadosChampions = c.maxDestacadosChampions as number;
  if (entero(c.inicioJornada, 0, 6)) a.inicioJornada = c.inicioJornada as number;
  for (const campo of ['veMinimo', 'probMinima', 'cuotaMinima', 'cuotaMaxima', 'veMinimoCombinada', 'probMinimaCombinada'] as const) {
    const valor = c[campo];
    if (esNumero(valor) && valor > 0) a[campo] = valor;
  }
  return a;
}

export function derbisDesdeTexto(texto: string): { local: string; visitante: string }[] {
  const derbis = [];
  for (const linea of texto.split('\n')) {
    const partes = linea.split(/\s+(?:-|–|vs\.?)\s+/i).map((p) => p.trim());
    if (partes.length === 2 && partes[0] && partes[1]) derbis.push({ local: partes[0], visitante: partes[1] });
  }
  return derbis;
}

export const derbisATexto = (derbis: { local: string; visitante: string }[]) =>
  derbis.map((d) => `${d.local} - ${d.visitante}`).join('\n');

export function aEjecucion(c: Record<string, unknown>): Ejecucion | null {
  if (typeof c.fecha !== 'string') return null;
  return {
    fecha: c.fecha,
    version: esNumero(c.version) ? c.version : 0,
    partidos: esNumero(c.partidos) ? c.partidos : 0,
    errores: Array.isArray(c.errores) ? c.errores.map(String) : [],
    avisos: Array.isArray(c.avisos) ? c.avisos.map(String) : [],
    peticiones: esObjeto(c.peticiones) ? (c.peticiones as Record<string, number>) : {},
    oddsPapi: esObjeto(c.oddsPapi) ? (c.oddsPapi as Ejecucion['oddsPapi']) : {},
    clubEloResponde: c.clubEloResponde === true,
    ultimaImportacion: typeof c.ultimaImportacion === 'string' ? c.ultimaImportacion : null,
  };
}

export function aMetricas(c: Record<string, unknown>): Metricas | null {
  if (!esObjeto(c.grupos)) return null;
  return {
    generado: texto(c.generado),
    grupos: c.grupos as Metricas['grupos'],
    detalle: esObjeto(c.detalle) ? (c.detalle as Metricas['detalle']) : {},
    apuestas: esObjeto(c.apuestas)
      ? (c.apuestas as MetricasApuestas)
      : { n: 0, apostadoCentimos: 0, beneficioCentimos: 0, roi: null, clv: null, muestra_pequena: true },
  };
}

export function aVersion(id: string, c: Record<string, unknown>): Version | null {
  if (!esNumero(c.numero)) return null;
  return {
    id,
    numero: c.numero,
    creada: texto(c.creada),
    pesos: esObjeto(c.pesos) ? (c.pesos as Record<string, number>) : {},
    changelog: Array.isArray(c.changelog) ? (c.changelog as { texto: string }[]) : [],
  };
}

// --- Textos y formatos

const PORCENTAJE = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });
const PORCENTAJE_1 = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});
const CUOTA = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METRICA = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const EUROS_SIGNO = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' });
const FECHA_HORA = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export const pct = (p: number | null | undefined) => (p === null || p === undefined ? '–' : PORCENTAJE.format(p));
export const pctConSigno = (p: number | null | undefined) =>
  p === null || p === undefined ? '–' : PORCENTAJE_1.format(p);
export const cuota = (c: number | null | undefined) => (c === null || c === undefined ? '–' : CUOTA.format(c));
export const metrica = (m: number | null | undefined) => (m === null || m === undefined ? '–' : METRICA.format(m));
export const euros = (centimos: number) => EUROS.format(centimos / 100);
export const eurosConSigno = (centimos: number) => EUROS_SIGNO.format(centimos / 100);
const DIA = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long' });
export const fechaDia = (iso: string) => {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '–' : DIA.format(fecha);
};
export const fechaHora = (iso: string) => {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '–' : FECHA_HORA.format(fecha);
};
export const nombreCasa = (casa: string | null) =>
  casa ? ({ 'bet365.es': 'Bet365', 'codere.es': 'Codere', 'bwin.es': 'bwin' } as Record<string, string>)[casa] ?? casa : '–';

const lineaTexto = (digitos: string) => (Number(digitos) / 10).toLocaleString('es-ES', { minimumFractionDigits: 1 });

/** Nombre legible de un mercado, como aparece en el boleto y en el historial. */
export function etiquetaClave(clave: string, local: string, visitante: string): string {
  const fijas: Record<string, string> = {
    '1': `Gana ${local}`,
    X: 'Empate',
    '2': `Gana ${visitante}`,
    '1X': `${local} o empate`,
    '12': 'Sin empate',
    X2: `${visitante} o empate`,
    btts_si: 'Ambos marcan',
    btts_no: 'No marcan ambos',
  };
  if (fijas[clave]) return fijas[clave];
  if (clave.startsWith('jug:')) {
    const [, categoria, ...nombre] = clave.split(':');
    const accion = NOMBRE_CATEGORIA[categoria as CategoriaJugador]?.toLocaleLowerCase('es') ?? categoria;
    return `${nombre.join(':')}: ${accion}`;
  }
  const goles = clave.match(/^([ou])(\d+)$/);
  if (goles) return `${goles[1] === 'o' ? 'Más' : 'Menos'} de ${lineaTexto(goles[2])} goles`;
  const estadistica = clave.match(/^(corners|tarjetas|faltas|tiros_puerta)_(?:(l|v)_)?([ou])(\d+)$/);
  if (estadistica) {
    const [, nombre, equipo, lado, digitos] = estadistica;
    const unidad = NOMBRE_ESTADISTICA[nombre as Estadistica].toLocaleLowerCase('es');
    const base = `${lado === 'o' ? 'más' : 'menos'} de ${lineaTexto(digitos)} ${unidad}`;
    if (equipo) return `${equipo === 'l' ? local : visitante}: ${base}`;
    return base[0].toLocaleUpperCase('es') + base.slice(1);
  }
  return clave;
}

const ORDEN_GOLES = ['1X', '12', 'X2', 'o15', 'u15', 'o25', 'u25', 'o35', 'u35', 'btts_si', 'btts_no'];

/** Los mercados de la tarjeta: los de goles y, de cada estadística, la línea más igualada. */
export function mercadosPrincipales(items: Record<string, ItemPronostico>): string[] {
  const claves = ORDEN_GOLES.filter((c) => items[c]);
  const mejores = new Map<string, string>();
  for (const [clave, item] of Object.entries(items)) {
    const coincide = clave.match(/^(corners|tarjetas|faltas|tiros_puerta)_(?:(l|v)_)?o\d+$/);
    if (!coincide) continue;
    const familia = `${coincide[1]}_${coincide[2] ?? 't'}`;
    const actual = mejores.get(familia);
    if (!actual || Math.abs(item.final - 0.5) < Math.abs(items[actual].final - 0.5)) mejores.set(familia, clave);
  }
  for (const nombre of ESTADISTICAS) {
    for (const equipo of ['t', 'l', 'v']) {
      const clave = mejores.get(`${nombre}_${equipo}`);
      if (!clave) continue;
      claves.push(clave);
      const contraria = clave.replace(/o(\d+)$/, 'u$1');
      if (items[contraria]) claves.push(contraria);
    }
  }
  return claves;
}

// --- Reglas

export function ejecucionAntigua(ejecucion: Ejecucion | null, ahora: number): boolean {
  if (!ejecucion) return true;
  return ahora - Date.parse(ejecucion.fecha) > HORAS_EJECUCION_ANTIGUA * 3_600_000;
}

export type EstadoMercado = { apostable: boolean; texto: string };

/** Sin métricas aún, el estado sale de las reglas fijadas tras el backtest. */
export function estadoMercado(grupo: string, metricas: MetricasGrupo | undefined): EstadoMercado {
  if (SIN_CUOTAS.has(grupo)) return { apostable: false, texto: 'Sin cuotas: solo informativo' };
  const motivo = metricas?.motivo;
  if (motivo === 'en_pausa') return { apostable: false, texto: 'En pausa' };
  if (motivo === 'bloqueado_peor_que_mercado') return { apostable: false, texto: 'Bloqueado: peor que el mercado' };
  if (motivo === 'bloqueado_sin_mercado') return { apostable: false, texto: 'Bloqueado: sin mercado para comparar' };
  if (COMPROBADOS.has(grupo)) return { apostable: true, texto: 'Comprobado en el backtest' };
  if (metricas?.apostable) return { apostable: true, texto: 'Desbloqueado' };
  return { apostable: false, texto: `Bloqueado: ${metricas?.n ?? 0} de ${CASOS_PARA_DESBLOQUEAR} liquidados` };
}

/** Lo que aún se puede apostar en la jornada sin pasar del tope de 5 €. */
export function centimosDisponibles(apuestas: ApuestaReal[], semana: string, idApuesta: string): number {
  const usados = apuestas
    .filter((a) => a.semana === semana && a.estado === 'hecha' && a.id !== idApuesta)
    .reduce((total, a) => total + (a.stakeRealCentimos ?? 0), 0);
  return Math.max(TOPE_JORNADA_CENTIMOS - usados, 0);
}

export function beneficioAcumulado(apuestas: ApuestaReal[]): { semana: string; beneficio: number; acumulado: number }[] {
  const porSemana = new Map<string, number>();
  for (const a of apuestas) {
    if (a.estado === 'hecha' && a.liquidacion) {
      porSemana.set(a.semana, (porSemana.get(a.semana) ?? 0) + a.liquidacion.beneficioCentimos);
    }
  }
  let acumulado = 0;
  return [...porSemana.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, beneficio]) => {
      acumulado += beneficio;
      return { semana, beneficio, acumulado };
    });
}

export type PreguntaJugador = { clave: string; jugador: string; categoria: CategoriaJugador };
export type PartidoPendiente = { partido: Partido; faltanEstadisticas: boolean; preguntas: PreguntaJugador[] };

/** Partidos jugados en los últimos 7 días a los que les falta algo que solo tú puedes dar. */
export function calcularPendientes(
  congelados: Partido[],
  estadisticas: { id: string }[],
  comprobaciones: Comprobacion[],
  apuestas: ApuestaReal[],
  ahora: number,
): PartidoPendiente[] {
  const conEstadisticas = new Set(estadisticas.map((e) => e.id));
  const respuestas = new Map(comprobaciones.map((c) => [c.id, c.respuestas]));
  const salida: PartidoPendiente[] = [];
  for (const partido of congelados) {
    const inicio = Date.parse(partido.inicio);
    if (ahora < inicio + DURACION_PARTIDO_MS) continue;
    if (ahora > inicio + DIAS_PARA_LIQUIDAR * 86_400_000) continue;

    const preguntas = new Map<string, PreguntaJugador>();
    for (const categoria of CATEGORIAS_JUGADOR) {
      const primero = partido.jugadores[categoria]?.[0];
      if (primero) {
        preguntas.set(`${categoria}:${primero.jugador}`, {
          clave: `${categoria}:${primero.jugador}`,
          jugador: primero.jugador,
          categoria,
        });
      }
    }
    for (const apuesta of apuestas) {
      if (apuesta.estado !== 'hecha') continue;
      for (const seleccion of apuesta.selecciones) {
        if (seleccion.partido !== partido.id || !seleccion.clave.startsWith('jug:')) continue;
        const [, categoria, ...nombre] = seleccion.clave.split(':');
        const jugador = nombre.join(':');
        preguntas.set(`${categoria}:${jugador}`, {
          clave: `${categoria}:${jugador}`,
          jugador,
          categoria: categoria as CategoriaJugador,
        });
      }
    }
    const contestadas = respuestas.get(partido.id) ?? {};
    const sinResponder = [...preguntas.values()].filter((p) => contestadas[p.clave] === undefined);
    const faltanEstadisticas = partido.competicion === 'CL' && !conEstadisticas.has(partido.id);
    if (faltanEstadisticas || sinResponder.length) {
      salida.push({ partido, faltanEstadisticas, preguntas: sinResponder });
    }
  }
  return salida.sort((a, b) => a.partido.inicio.localeCompare(b.partido.inicio));
}

export function datosJugadoresAntiguos(importaciones: { fecha: string }[], ahora: number): boolean {
  const ultima = Math.max(0, ...importaciones.map((i) => Date.parse(i.fecha)).filter(Number.isFinite));
  return ahora - ultima > DIAS_DATOS_JUGADORES * 86_400_000;
}

export type ResumenAciertos = { ganadas: number; total: number; esperado: number };

export function aciertos(liquidacion: Liquidacion, grupo: string | null): ResumenAciertos {
  let ganadas = 0;
  let total = 0;
  let esperado = 0;
  for (const item of Object.values(liquidacion.items)) {
    if (grupo && item.grupo !== grupo) continue;
    if (item.estado !== 'ganada' && item.estado !== 'perdida') continue;
    total += 1;
    esperado += item.final;
    if (item.estado === 'ganada') ganadas += 1;
  }
  return { ganadas, total, esperado };
}

/** El signo que el pronóstico daba como más probable, y si acertó. */
export function signoMasProbable(liquidacion: Liquidacion): { clave: string; prob: number; acierto: boolean } | null {
  const signos = ['1', 'X', '2'].filter((c) => liquidacion.items[c]);
  if (!signos.length) return null;
  const clave = signos.reduce((a, b) => (liquidacion.items[b].final > liquidacion.items[a].final ? b : a));
  return { clave, prob: liquidacion.items[clave].final, acierto: liquidacion.items[clave].estado === 'ganada' };
}
