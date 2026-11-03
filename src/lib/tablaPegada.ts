// Lee tablas de jugadores pegadas de una web o subidas en CSV. Las columnas pueden venir
// en cualquier orden; aquí solo se propone la asignación, y la confirma el usuario.

import { CAMPOS_NUMERICOS, type FilaJugador } from './pronosticos.ts';

export const CAMPOS = [
  'jugador',
  'equipo',
  'minutos',
  'faltas_cometidas',
  'faltas_recibidas',
  'amarillas',
  'tiros_puerta',
] as const;
export type Campo = (typeof CAMPOS)[number];

export const NOMBRE_CAMPO: Record<Campo, string> = {
  jugador: 'Jugador',
  equipo: 'Equipo',
  minutos: 'Minutos',
  faltas_cometidas: 'Faltas cometidas',
  faltas_recibidas: 'Faltas recibidas',
  amarillas: 'Amarillas',
  tiros_puerta: 'Tiros a puerta',
};

const SINONIMOS: Record<Campo, string[]> = {
  jugador: ['jugador', 'player', 'nombre', 'name'],
  equipo: ['equipo', 'team', 'squad', 'club'],
  minutos: ['minutos', 'minutes', 'min', 'mins', 'minutos jugados'],
  faltas_cometidas: ['faltas cometidas', 'faltas', 'fouls', 'fouls committed', 'fls', 'fc', 'cometidas'],
  faltas_recibidas: ['faltas recibidas', 'fouls drawn', 'fouled', 'fld', 'fr', 'recibidas'],
  amarillas: ['amarillas', 'tarjetas amarillas', 'yellow cards', 'yellow', 'crdy', 'ta', 'ycd'],
  tiros_puerta: ['tiros a puerta', 'tiros puerta', 'shots on target', 'shots on goal', 'sot', 'tap'],
};

export type TablaCruda = { cabecera: string[]; filas: string[][]; conCabecera: boolean };

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function separador(linea: string): string {
  const veces = (c: string) => linea.split(c).length - 1;
  for (const c of ['\t', ';']) if (veces(c) > 0) return c;
  return ',';
}

function partirLinea(linea: string, sep: string): string[] {
  const celdas: string[] = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (c === sep && !entreComillas) {
      celdas.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  celdas.push(actual);
  return celdas.map((celda) => celda.trim());
}

const pareceNumero = (celda: string) => /^[\d.,\s]+$/.test(celda) && /\d/.test(celda);

/** Convierte el texto en filas. Si la primera línea no lleva cifras, es la cabecera. */
export function leerTabla(texto: string): TablaCruda {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lineas.length) return { cabecera: [], filas: [], conCabecera: false };
  const sep = separador(lineas[0]);
  const todas = lineas.map((l) => partirLinea(l, sep));
  const conCabecera = !todas[0].some(pareceNumero) && todas.length > 1;
  const ancho = Math.max(...todas.map((f) => f.length));
  const cabecera = conCabecera
    ? todas[0]
    : Array.from({ length: ancho }, (_, i) => `Columna ${i + 1}`);
  return { cabecera, filas: conCabecera ? todas.slice(1) : todas, conCabecera };
}

export type Asignacion = Partial<Record<Campo, number>>;

/** Propone qué columna es cada campo; la coincidencia exacta gana a la parcial. */
export function proponerAsignacion(cabecera: string[]): Asignacion {
  const asignacion: Asignacion = {};
  const usadas = new Set<number>();
  const nombres = cabecera.map(normalizar);
  for (const exacta of [true, false]) {
    for (const campo of CAMPOS) {
      if (asignacion[campo] !== undefined) continue;
      for (const sinonimo of SINONIMOS[campo]) {
        const indice = nombres.findIndex((n, i) =>
          !usadas.has(i) && (exacta ? n === sinonimo : sinonimo.length > 3 && n.includes(sinonimo)),
        );
        if (indice >= 0) {
          asignacion[campo] = indice;
          usadas.add(indice);
          break;
        }
      }
    }
  }
  return asignacion;
}

/** Admite 1.234 y 1,5 como en España, y 1,234 y 1.5 como en otras webs. */
export function leerNumero(celda: string | undefined): number | null {
  const limpia = (celda ?? '').replace(/\s/g, '');
  if (limpia === '' || limpia === '-' || limpia === '–') return 0;
  if (!/^\d[\d.,]*$/.test(limpia)) return null;
  const miles = /^\d{1,3}([.,]\d{3})+$/.test(limpia);
  const valor = Number(miles ? limpia.replace(/[.,]/g, '') : limpia.replace(',', '.'));
  return Number.isFinite(valor) ? valor : null;
}

export type ResultadoFilas = { filas: FilaJugador[]; descartadas: number; error: string | null };

export function aFilas(tabla: TablaCruda, asignacion: Asignacion): ResultadoFilas {
  if (asignacion.jugador === undefined) return { filas: [], descartadas: 0, error: 'Indica qué columna es la del jugador.' };
  if (CAMPOS_NUMERICOS.every((campo) => asignacion[campo] === undefined)) {
    return { filas: [], descartadas: 0, error: 'Indica al menos una columna de datos.' };
  }

  const valor = (fila: string[], campo: Campo) =>
    asignacion[campo] === undefined ? undefined : fila[asignacion[campo]!];
  const filas: FilaJugador[] = [];
  let descartadas = 0;
  for (const fila of tabla.filas) {
    const jugador = (valor(fila, 'jugador') ?? '').trim();
    const nueva: FilaJugador = { jugador, equipo: (valor(fila, 'equipo') ?? '').trim() };
    let valida = jugador !== '';
    // Solo las columnas asignadas: las demás se quedan como están en otras importaciones.
    for (const campo of CAMPOS_NUMERICOS) {
      if (asignacion[campo] === undefined) continue;
      const numero = leerNumero(valor(fila, campo));
      if (numero === null || (campo === 'minutos' && numero === 0)) valida = false;
      else nueva[campo] = numero;
    }
    if (valida) filas.push(nueva);
    else descartadas += 1;
  }
  return { filas, descartadas, error: filas.length ? null : 'Ninguna fila tiene jugador y datos válidos.' };
}

const clavePersona = (nombre: string) => {
  const conOrden = nombre.includes(',')
    ? `${nombre.slice(nombre.indexOf(',') + 1)} ${nombre.slice(0, nombre.indexOf(','))}`
    : nombre;
  return normalizar(conOrden);
};

function bigramas(texto: string): string[] {
  const salida: string[] = [];
  for (let i = 0; i < texto.length - 1; i++) salida.push(texto.slice(i, i + 2));
  return salida;
}

/** Parecido de 0 a 1 entre dos nombres, sin depender del orden ni de los acentos. */
export function parecidoNombres(a: string, b: string): number {
  const x = clavePersona(a);
  const y = clavePersona(b);
  if (x === y) return 1;
  const bx = bigramas(x);
  const by = bigramas(y);
  if (!bx.length || !by.length) return 0;
  const restantes = [...by];
  let comunes = 0;
  for (const b1 of bx) {
    const i = restantes.indexOf(b1);
    if (i >= 0) {
      comunes += 1;
      restantes.splice(i, 1);
    }
  }
  return (2 * comunes) / (bx.length + by.length);
}

const UMBRAL_DUDA = 0.6;

export type Duda = { nombre: string; candidatos: string[] };

/** Los nombres idénticos pasan solos; los parecidos se le preguntan al usuario. */
export function nombresDudosos(nombres: string[], conocidos: string[]): Duda[] {
  const dudas: Duda[] = [];
  for (const nombre of new Set(nombres)) {
    const puntuados = conocidos
      .map((c) => ({ c, p: parecidoNombres(nombre, c) }))
      .filter(({ p }) => p >= UMBRAL_DUDA)
      .sort((a, b) => b.p - a.p);
    if (!puntuados.length || puntuados[0].p === 1) continue;
    dudas.push({ nombre, candidatos: [...new Set(puntuados.map(({ c }) => c))].slice(0, 3) });
  }
  return dudas;
}
