import { esFechaValida } from './fechas.ts';

export const FASES = [
  'por-enviar',
  'enviada',
  'entrevista-rrhh',
  'entrevista-tecnica',
  'oferta',
  'descartada',
] as const;
export type Fase = (typeof FASES)[number];
export const ETIQUETA_FASE: Record<Fase, string> = {
  'por-enviar': 'Por enviar',
  enviada: 'Enviada',
  'entrevista-rrhh': 'Entrevista RRHH',
  'entrevista-tecnica': 'Entrevista técnica',
  oferta: 'Oferta',
  descartada: 'Descartada',
};

/** Siempre disponible, aunque la lista de áreas de Ajustes esté vacía. */
export const AREA_OTRA = 'Otro';
export const MODALIDADES = ['Presencial', 'Híbrido', 'Remoto'] as const;

export type DatosCandidatura = {
  empresa: string;
  puesto: string;
  area: string;
  modalidad: string;
  salario: number | null;
  fecha: string | null;
  proximoPaso: string;
  proximoPasoFecha: string | null;
  enlace: string;
  contacto: string;
  notas: string;
  fase: Fase;
};
export type Candidatura = DatosCandidatura & { id: string };

const texto = (v: unknown) => (typeof v === 'string' ? v : '');
const lleno = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export function aDatosCandidatura(c: Record<string, unknown>): DatosCandidatura | null {
  if (!lleno(c.empresa) || !lleno(c.puesto)) return null;
  if (!FASES.includes(c.fase as Fase)) return null;
  return {
    empresa: c.empresa.trim(),
    puesto: c.puesto.trim(),
    area: lleno(c.area) ? c.area : AREA_OTRA,
    modalidad: texto(c.modalidad),
    salario: typeof c.salario === 'number' && Number.isFinite(c.salario) && c.salario >= 0 ? c.salario : null,
    fecha: esFechaValida(c.fecha) ? c.fecha : null,
    proximoPaso: texto(c.proximoPaso),
    proximoPasoFecha: esFechaValida(c.proximoPasoFecha) ? c.proximoPasoFecha : null,
    enlace: texto(c.enlace),
    contacto: texto(c.contacto),
    notas: texto(c.notas),
    fase: c.fase as Fase,
  };
}

export function aCandidatura(id: string, crudo: Record<string, unknown>): Candidatura | null {
  const datos = aDatosCandidatura(crudo);
  return datos && { id, ...datos };
}

/** Sin salario indicado o sin mínimo definido no se puede afirmar que esté por debajo. */
export const estaBajoMinimo = (salario: number | null, minimo: number | null) =>
  salario !== null && minimo !== null && salario < minimo;

/** Próximos pasos pendientes: los que tienen fecha primero y por orden; sin las descartadas. */
export function proximosPasos(lista: Candidatura[]): Candidatura[] {
  return lista
    .filter((c) => c.fase !== 'descartada' && c.proximoPaso.trim() !== '')
    .sort(
      (a, b) =>
        (a.proximoPasoFecha ?? '9999').localeCompare(b.proximoPasoFecha ?? '9999') ||
        a.empresa.localeCompare(b.empresa, 'es'),
    );
}

/** Las opciones de un selector: la lista de Ajustes más el valor ya guardado, si no está. */
export function opcionesConActual(lista: string[], actual: string): string[] {
  return actual && !lista.includes(actual) ? [...lista, actual] : lista;
}
