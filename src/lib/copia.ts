import { aAjustesParciales } from './ajustes.ts';
import type { Ajustes } from './ajustes.ts';
import { aDatosCandidatura } from './candidaturas.ts';
import { aDatosAportacion, aDatosLiquidativo, aDatosPosicion } from './cartera.ts';
import { aDatosPlazo } from './plazos.ts';
import { aDatosPrompt } from './prompts.ts';
import { aDatosConvocatoria } from './vivienda.ts';

export const COLECCIONES = [
  'plazos',
  'posiciones',
  'aportaciones',
  'liquidativos',
  'vivienda',
  'candidaturas',
  'prompts',
] as const;
export type Coleccion = (typeof COLECCIONES)[number];

export type Elemento = { id?: string; [campo: string]: unknown };

export type Copia = {
  version: 1;
  exportadoEn?: string;
  ajustes?: Partial<Ajustes>;
} & Partial<Record<Coleccion, Elemento[]>>;

export const NOMBRES: Record<Coleccion, string> = {
  plazos: 'plazos',
  posiciones: 'posiciones',
  aportaciones: 'aportaciones',
  liquidativos: 'valores liquidativos',
  vivienda: 'convocatorias de vivienda',
  candidaturas: 'candidaturas',
  prompts: 'prompts',
};

type Resultado = { ok: true; copia: Copia } | { ok: false; error: string };

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

// Firestore no admite "/" en un id ni los nombres reservados tipo __x__ o "..".
const ID_VALIDO = /^[A-Za-z0-9_-]{1,128}$/;

const fallo = (error: string): Resultado => ({ ok: false, error });

/** Valida el JSON por completo antes de escribir nada. */
export function leerCopia(texto: string): Resultado {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return fallo('El archivo no es un JSON válido.');
  }
  if (!esObjeto(json)) return fallo('El archivo no tiene el formato de una copia de Panel.');
  if (json.version !== 1) return fallo('El archivo no indica una versión de copia compatible.');

  const copia: Copia = { version: 1 };
  for (const [clave, valor] of Object.entries(json)) {
    if (clave === 'version') continue;
    if (clave === 'exportadoEn') {
      if (typeof valor === 'string') copia.exportadoEn = valor;
      continue;
    }
    if (clave === 'ajustes') {
      if (!esObjeto(valor)) return fallo('La sección "ajustes" no es válida.');
      copia.ajustes = aAjustesParciales(valor);
      continue;
    }
    if (!COLECCIONES.includes(clave as Coleccion)) {
      return fallo(`El archivo contiene una sección desconocida: "${clave}".`);
    }
    if (!Array.isArray(valor)) return fallo(`La sección "${clave}" debe ser una lista.`);

    const elementos: Elemento[] = [];
    for (const [indice, elemento] of valor.entries()) {
      const posicion = `${clave}, elemento ${indice + 1}`;
      if (!esObjeto(elemento)) return fallo(`${posicion}: no es un objeto.`);
      const { id, ...campos } = elemento;
      if (id !== undefined && (typeof id !== 'string' || !ID_VALIDO.test(id))) {
        return fallo(`${posicion}: el id no es válido.`);
      }
      if (clave === 'plazos' && !aDatosPlazo(campos)) {
        return fallo(`${posicion}: necesita título, fecha AAAA-MM-DD y una categoría válida.`);
      }
      if (clave === 'posiciones' && !aDatosPosicion(campos)) {
        return fallo(`${posicion}: necesita nombre, tipo, identificador y divisa válidos.`);
      }
      if (clave === 'aportaciones' && !aDatosAportacion(campos)) {
        return fallo(`${posicion}: necesita posición, fecha, importe y valor liquidativo válidos.`);
      }
      if (clave === 'liquidativos' && !aDatosLiquidativo(campos)) {
        return fallo(`${posicion}: necesita posición, fecha y valor válidos.`);
      }
      if (clave === 'vivienda' && !aDatosConvocatoria(campos)) {
        return fallo(`${posicion}: necesita municipio, promoción, tipo y estado válidos.`);
      }
      if (clave === 'candidaturas' && !aDatosCandidatura(campos)) {
        return fallo(`${posicion}: necesita empresa, puesto y fase válidos.`);
      }
      if (clave === 'prompts' && !aDatosPrompt(campos)) {
        return fallo(`${posicion}: necesita título y texto.`);
      }
      elementos.push(id === undefined ? campos : { id, ...campos });
    }
    copia[clave as Coleccion] = elementos;
  }
  return { ok: true, copia };
}

/** Texto para confirmar la importación, por ejemplo "9 plazos, 4 posiciones y ajustes". */
export function resumirCopia(copia: Copia): string {
  const partes = COLECCIONES.filter((c) => copia[c]?.length).map(
    (c) => `${copia[c]!.length} ${NOMBRES[c]}`,
  );
  if (copia.ajustes && Object.keys(copia.ajustes).length) partes.push('ajustes');
  if (partes.length === 0) return 'nada';
  return partes.length === 1
    ? partes[0]
    : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}
