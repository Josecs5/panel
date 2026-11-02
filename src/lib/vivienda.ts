import { esFechaValida } from './fechas.ts';
import type { PlazoListado } from './plazos.ts';

export const TIPOS_VIVIENDA = ['VPO', 'Obra nueva'] as const;
export type TipoVivienda = (typeof TIPOS_VIVIENDA)[number];

export const ESTADOS = ['abierta', 'proxima', 'cerrada', 'sorteada'] as const;
export type EstadoConvocatoria = (typeof ESTADOS)[number];
export const ETIQUETA_ESTADO: Record<EstadoConvocatoria, string> = {
  abierta: 'Abierta',
  proxima: 'Próxima',
  cerrada: 'Cerrada',
  sorteada: 'Sorteada',
};

export const CONJUNTA = ['si', 'no', 'nose'] as const;
export type Conjunta = (typeof CONJUNTA)[number];
export const ETIQUETA_CONJUNTA: Record<Conjunta, string> = {
  si: 'Sí',
  no: 'No',
  nose: 'No se sabe',
};

export type DatosConvocatoria = {
  municipio: string;
  promocion: string;
  tipo: TipoVivienda;
  estado: EstadoConvocatoria;
  finPlazo: string | null;
  conjunta: Conjunta;
  requisitos: string;
  enlace: string;
  notas: string;
};
export type Convocatoria = DatosConvocatoria & { id: string };

const texto = (v: unknown) => (typeof v === 'string' ? v : '');
const lleno = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export function aDatosConvocatoria(c: Record<string, unknown>): DatosConvocatoria | null {
  if (!lleno(c.municipio) || !lleno(c.promocion)) return null;
  if (!TIPOS_VIVIENDA.includes(c.tipo as TipoVivienda)) return null;
  if (!ESTADOS.includes(c.estado as EstadoConvocatoria)) return null;
  return {
    municipio: c.municipio.trim(),
    promocion: c.promocion.trim(),
    tipo: c.tipo as TipoVivienda,
    estado: c.estado as EstadoConvocatoria,
    finPlazo: esFechaValida(c.finPlazo) ? c.finPlazo : null,
    conjunta: CONJUNTA.includes(c.conjunta as Conjunta) ? (c.conjunta as Conjunta) : 'nose',
    requisitos: texto(c.requisitos),
    enlace: texto(c.enlace),
    notas: texto(c.notas),
  };
}

export function aConvocatoria(id: string, crudo: Record<string, unknown>): Convocatoria | null {
  const datos = aDatosConvocatoria(crudo);
  return datos && { id, ...datos };
}

/** Primero lo abierto y lo que vence antes; sin fin de plazo, al final de su estado. */
export function ordenarConvocatorias(lista: Convocatoria[]): Convocatoria[] {
  return [...lista].sort(
    (a, b) =>
      ESTADOS.indexOf(a.estado) - ESTADOS.indexOf(b.estado) ||
      (a.finPlazo ?? '9999').localeCompare(b.finPlazo ?? '9999') ||
      a.promocion.localeCompare(b.promocion, 'es'),
  );
}

export function filtrarConvocatorias(
  lista: Convocatoria[],
  municipio: string | null,
  estado: EstadoConvocatoria | null,
): Convocatoria[] {
  return lista.filter(
    (c) => (!municipio || c.municipio === municipio) && (!estado || c.estado === estado),
  );
}

/** Las convocatorias con fin de plazo también aparecen en Plazos. */
export const plazosDeConvocatorias = (lista: Convocatoria[]): PlazoListado[] =>
  lista.flatMap((c) =>
    c.finPlazo
      ? [
          {
            id: `vivienda-${c.id}`,
            titulo: `${c.promocion} · ${c.municipio}`,
            fecha: c.finPlazo,
            categoria: 'Vivienda' as const,
            nota: '',
            enlace: c.enlace,
            origen: 'vivienda' as const,
          },
        ]
      : [],
  );
