// Las fechas de los datos son cadenas AAAA-MM-DD, sin hora ni zona horaria.
// "Hoy" siempre es el día en Madrid, esté donde esté el navegador.

const PARTES_MADRID = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const FORMATO_CORTO = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const FORMATO_LARGO = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', dateStyle: 'full' });

const HORA_MADRID = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  minute: '2-digit',
});

const aUTC = (fecha: string) => new Date(`${fecha}T12:00:00Z`);

export function hoyEnMadrid(ahora: Date = new Date()): string {
  const partes = Object.fromEntries(PARTES_MADRID.formatToParts(ahora).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
}

export function esFechaValida(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = aUTC(valor);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

/** Días naturales de una fecha a otra; negativo si `hasta` ya pasó. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta).getTime() - aUTC(desde).getTime()) / 86_400_000);
}

export const fechaCorta = (fecha: string) => FORMATO_CORTO.format(aUTC(fecha));
export const fechaLarga = (fecha: string) => FORMATO_LARGO.format(aUTC(fecha));
export const horaEnMadrid = (ahora: Date = new Date()) => HORA_MADRID.format(ahora);
