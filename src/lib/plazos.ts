import { diasEntre, esFechaValida } from './fechas.ts';

export const CATEGORIAS = ['Viaje', 'Trámites', 'Trabajo', 'Inversión', 'Personal'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export type DatosPlazo = {
  titulo: string;
  fecha: string;
  categoria: Categoria;
  nota: string;
  enlace: string;
};
export type Plazo = DatosPlazo & { id: string };

/** Un plazo tal como se lista: propio o derivado de una convocatoria de vivienda. */
export type CategoriaVista = Categoria | 'Vivienda';
export type PlazoListado = Omit<Plazo, 'categoria'> & {
  categoria: CategoriaVista;
  origen?: 'vivienda';
};
export const esPlazoPropio = (plazo: PlazoListado): plazo is Plazo => plazo.origen === undefined;

const esCategoria = (valor: unknown): valor is Categoria =>
  CATEGORIAS.includes(valor as Categoria);

/** Convierte un objeto guardado en un plazo, o null si le falta algo esencial. */
export function aDatosPlazo(crudo: Record<string, unknown>): DatosPlazo | null {
  const { titulo, fecha, categoria, nota, enlace } = crudo;
  if (typeof titulo !== 'string' || !titulo.trim()) return null;
  if (!esFechaValida(fecha) || !esCategoria(categoria)) return null;
  return {
    titulo: titulo.trim(),
    fecha,
    categoria,
    nota: typeof nota === 'string' ? nota : '',
    enlace: typeof enlace === 'string' ? enlace : '',
  };
}

export function aPlazo(id: string, crudo: Record<string, unknown>): Plazo | null {
  const datos = aDatosPlazo(crudo);
  return datos && { id, ...datos };
}

type ConFecha = { fecha: string; titulo: string };

const porFecha = (a: ConFecha, b: ConFecha) =>
  a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo, 'es');

/** Lo pasado se archiva solo: un plazo de hoy todavía cuenta como próximo. */
export function separarPlazos<T extends ConFecha>(plazos: T[], hoy: string) {
  const ordenados = [...plazos].sort(porFecha);
  return {
    proximos: ordenados.filter((p) => p.fecha >= hoy),
    archivados: ordenados.filter((p) => p.fecha < hoy).reverse(),
  };
}

export const esUrgente = (dias: number) => dias < 7;
export const diasHasta = (fecha: string, hoy: string) => diasEntre(hoy, fecha);

/** Solo enlaces web: evita que un JSON importado cuele un javascript:. */
export function enlaceSeguro(enlace: string): string | null {
  try {
    const { protocol } = new URL(enlace.trim());
    return protocol === 'https:' || protocol === 'http:' ? enlace.trim() : null;
  } catch {
    return null;
  }
}
