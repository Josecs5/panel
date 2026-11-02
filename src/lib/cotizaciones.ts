import type { Cotizacion } from './cartera.ts';

export const TTL_COTIZACION = 5 * 60_000;
export const TTL_CAMBIO = 60 * 60_000;
export const TTL_RESULTADOS = 12 * 60 * 60_000;

const TIEMPO_MAXIMO = 8_000;
const FINNHUB = 'https://finnhub.io/api/v1';

export type Cambio = { usdEur: number; fecha: string; fuente: string; guardadoEn: number };

export type Resultado = {
  ticker: string;
  fecha: string;
  /** bmo: antes de la apertura; amc: tras el cierre; dmh: durante la sesión. */
  momento: string;
  trimestre: number | null;
  ano: number | null;
};

export type ResultadosGuardados = { guardadoEn: number; disponible: boolean; lista: Resultado[] };

export type CacheMercado = {
  cotizaciones: Record<string, Cotizacion>;
  cambio?: Cambio;
  resultados?: ResultadosGuardados;
};

export type MotivoFallo = 'clave' | 'limite' | 'plan' | 'simbolo' | 'red';

export class FalloApi extends Error {
  readonly motivo: MotivoFallo;
  constructor(motivo: MotivoFallo) {
    super(motivo);
    this.motivo = motivo;
  }
}

type Pedir = (url: string, init?: RequestInit) => Promise<Response>;
const pedirReal: Pedir = (url, init) => fetch(url, init);

async function pedirJson(url: string, pedir: Pedir): Promise<Record<string, unknown>> {
  let respuesta: Response;
  try {
    respuesta = await pedir(url, { signal: AbortSignal.timeout(TIEMPO_MAXIMO) });
  } catch {
    throw new FalloApi('red');
  }
  if (respuesta.status === 401) throw new FalloApi('clave');
  if (respuesta.status === 403) throw new FalloApi('plan');
  if (respuesta.status === 429) throw new FalloApi('limite');
  if (!respuesta.ok) throw new FalloApi('red');
  try {
    return (await respuesta.json()) as Record<string, unknown>;
  } catch {
    throw new FalloApi('red');
  }
}

export async function pedirCotizacion(
  ticker: string,
  clave: string,
  ahora: number,
  pedir: Pedir = pedirReal,
): Promise<Cotizacion> {
  const url = `${FINNHUB}/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(clave)}`;
  const { c, d, dp } = await pedirJson(url, pedir);
  // Finnhub responde con ceros y sin error a un ticker que no conoce.
  if (typeof c !== 'number' || c <= 0) throw new FalloApi('simbolo');
  return {
    precio: c,
    variacion: typeof d === 'number' ? d : 0,
    variacionPct: typeof dp === 'number' ? dp : 0,
    guardadoEn: ahora,
  };
}

/** Frankfurter publica el cambio del BCE; si falla, otra fuente gratuita sin clave. */
export async function pedirCambio(ahora: number, pedir: Pedir = pedirReal): Promise<Cambio> {
  try {
    const { rates, date } = await pedirJson(
      'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR',
      pedir,
    );
    const usdEur = (rates as { EUR?: unknown } | undefined)?.EUR;
    if (typeof usdEur === 'number' && usdEur > 0 && typeof date === 'string') {
      return { usdEur, fecha: date, fuente: 'BCE, vía Frankfurter', guardadoEn: ahora };
    }
  } catch {
    // Se intenta con la segunda fuente.
  }
  const { rates, time_last_update_unix: unix } = await pedirJson(
    'https://open.er-api.com/v6/latest/USD',
    pedir,
  );
  const usdEur = (rates as { EUR?: unknown } | undefined)?.EUR;
  if (typeof usdEur !== 'number' || usdEur <= 0) throw new FalloApi('red');
  const fecha = new Date(typeof unix === 'number' ? unix * 1000 : ahora).toISOString().slice(0, 10);
  return { usdEur, fecha, fuente: 'ExchangeRate-API', guardadoEn: ahora };
}

function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Próximos resultados en 90 días; lanza FalloApi('plan') si el plan no lo permite. */
export async function pedirResultados(
  ticker: string,
  clave: string,
  hoy: string,
  pedir: Pedir = pedirReal,
): Promise<Resultado[]> {
  const url =
    `${FINNHUB}/calendar/earnings?symbol=${encodeURIComponent(ticker)}` +
    `&from=${hoy}&to=${sumarDias(hoy, 90)}&token=${encodeURIComponent(clave)}`;
  const { earningsCalendar } = await pedirJson(url, pedir);
  if (!Array.isArray(earningsCalendar)) return [];
  return earningsCalendar
    .filter((e) => typeof e?.date === 'string' && e.date >= hoy)
    .map((e) => ({
      ticker,
      fecha: e.date as string,
      momento: typeof e.hour === 'string' ? e.hour : '',
      trimestre: typeof e.quarter === 'number' ? e.quarter : null,
      ano: typeof e.year === 'number' ? e.year : null,
    }));
}

export const caducado = (guardadoEn: number | undefined, ttl: number, ahora: number) =>
  guardadoEn === undefined || ahora - guardadoEn >= ttl;
