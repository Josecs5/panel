export type DatosPrompt = {
  titulo: string;
  herramienta: string;
  etiquetas: string[];
  texto: string;
};
export type Prompt = DatosPrompt & { id: string };

/** Quita espacios, vacíos y repetidos; sirve para etiquetas y para listas de Ajustes. */
export function limpiarLista(valores: unknown[]): string[] {
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const valor of valores) {
    if (typeof valor !== 'string') continue;
    const limpio = valor.trim();
    const clave = limpio.toLocaleLowerCase('es');
    if (limpio && !vistos.has(clave)) {
      vistos.add(clave);
      lista.push(limpio);
    }
  }
  return lista;
}

export const listaDesdeTexto = (texto: string) => limpiarLista(texto.split(','));

export function aDatosPrompt(c: Record<string, unknown>): DatosPrompt | null {
  const { titulo, herramienta, etiquetas, texto } = c;
  if (typeof titulo !== 'string' || !titulo.trim()) return null;
  if (typeof texto !== 'string' || !texto.trim()) return null;
  return {
    titulo: titulo.trim(),
    herramienta: typeof herramienta === 'string' ? herramienta.trim() : '',
    etiquetas: Array.isArray(etiquetas) ? limpiarLista(etiquetas) : [],
    texto,
  };
}

export function aPrompt(id: string, crudo: Record<string, unknown>): Prompt | null {
  const datos = aDatosPrompt(crudo);
  return datos && { id, ...datos };
}

const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');

/** Busca sin distinguir mayúsculas ni acentos; todas las palabras deben aparecer. */
export function filtrarPrompts(lista: Prompt[], busqueda: string, etiqueta: string | null): Prompt[] {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
  return lista
    .filter((p) => !etiqueta || p.etiquetas.includes(etiqueta))
    .filter((p) => {
      const contenido = normalizar(
        [p.titulo, p.herramienta, ...p.etiquetas, p.texto].join(' '),
      );
      return palabras.every((palabra) => contenido.includes(palabra));
    })
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
}

export const todasLasEtiquetas = (lista: Prompt[]) =>
  [...new Set(lista.flatMap((p) => p.etiquetas))].sort((a, b) => a.localeCompare(b, 'es'));
