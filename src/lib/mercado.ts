import { ANOS_CUBIERTOS, CIERRES_ANTICIPADOS, FESTIVOS } from '../data/calendario-nasdaq.ts';
import { diasEntre, fechaCorta, hoyEnMadrid, horaEnMadrid } from './fechas.ts';

// Todo se calcula con la hora de Nueva York: así se acierta en las semanas en que
// EE. UU. y Europa cambian la hora en fechas distintas.

const FORMATO_NY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function relojNY(instante: Date) {
  const p = Object.fromEntries(FORMATO_NY.formatToParts(instante).map((x) => [x.type, x.value]));
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    comoUTC: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second),
  };
}

/** El instante real que corresponde a una hora de reloj en Nueva York. */
export function instanteNY(fecha: string, hora: number, minuto = 0): Date {
  const [ano, mes, dia] = fecha.split('-').map(Number);
  const objetivo = Date.UTC(ano, mes - 1, dia, hora, minuto);
  let estimado = objetivo;
  // Dos pasadas bastan: la segunda corrige si la primera cruzó un cambio de hora.
  for (let i = 0; i < 2; i += 1) estimado += objetivo - relojNY(new Date(estimado)).comoUTC;
  return new Date(estimado);
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const esFinDeSemana = (fecha: string) => [0, 6].includes(new Date(`${fecha}T12:00:00Z`).getUTCDay());

export type Sesion = {
  preapertura: Date;
  apertura: Date;
  cierre: Date;
  finAmpliada: Date;
  anticipada: boolean;
};

/** Horario de un día en Nueva York, o null si no hay mercado. */
export function sesionDelDia(fecha: string): Sesion | null {
  if (esFinDeSemana(fecha) || FESTIVOS.has(fecha)) return null;
  const anticipada = CIERRES_ANTICIPADOS.has(fecha);
  return {
    preapertura: instanteNY(fecha, 4),
    apertura: instanteNY(fecha, 9, 30),
    cierre: instanteNY(fecha, anticipada ? 13 : 16),
    finAmpliada: instanteNY(fecha, anticipada ? 17 : 20),
    anticipada,
  };
}

export type EstadoMercado = {
  estado: 'abierto' | 'preapertura' | 'after-hours' | 'cerrado';
  /** La sesión del día en Nueva York, si hay mercado ese día. */
  sesion: Sesion | null;
  proximaApertura: Date;
  /** False si la fecha queda fuera del calendario: un festivo podría no estar contemplado. */
  calendarioCubierto: boolean;
};

export function estadoMercado(ahora: Date = new Date()): EstadoMercado {
  const hoyNY = relojNY(ahora).fecha;
  const sesion = sesionDelDia(hoyNY);

  let estado: EstadoMercado['estado'] = 'cerrado';
  if (sesion) {
    if (ahora >= sesion.preapertura && ahora < sesion.apertura) estado = 'preapertura';
    else if (ahora >= sesion.apertura && ahora < sesion.cierre) estado = 'abierto';
    else if (ahora >= sesion.cierre && ahora < sesion.finAmpliada) estado = 'after-hours';
  }

  let proximaApertura = sesion && ahora < sesion.apertura ? sesion.apertura : null;
  // El mayor hueco posible entre sesiones es de cuatro días.
  for (let i = 1; !proximaApertura && i <= 10; i += 1) {
    proximaApertura = sesionDelDia(sumarDias(hoyNY, i))?.apertura ?? null;
  }

  return {
    estado,
    sesion,
    proximaApertura: proximaApertura!,
    calendarioCubierto: ANOS_CUBIERTOS.includes(Number(hoyNY.slice(0, 4))),
  };
}

export const ETIQUETA_ESTADO: Record<EstadoMercado['estado'], string> = {
  abierto: 'Abierto',
  preapertura: 'Preapertura',
  'after-hours': 'After-hours',
  cerrado: 'Cerrado',
};

/** "hoy, 15:30", "mañana, 15:30" o "lun, 9 nov 2026, 15:30", en hora de Madrid. */
export function cuandoEnMadrid(instante: Date, ahora: Date = new Date()): string {
  const dia = hoyEnMadrid(instante);
  const diferencia = diasEntre(hoyEnMadrid(ahora), dia);
  const texto = diferencia === 0 ? 'hoy' : diferencia === 1 ? 'mañana' : fechaCorta(dia);
  return `${texto}, ${horaEnMadrid(instante)}`;
}
