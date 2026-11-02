import type { ReactNode } from 'react';
import { fechaLarga } from '../lib/fechas';
import { useHoy } from '../lib/useHoy';

/** Título de la sección; a la derecha, su acción principal o la fecha de hoy. */
export function Cabecera({ titulo, accion }: { titulo: string; accion?: ReactNode }) {
  const hoy = useHoy();
  return (
    <header className="pagina__cabecera">
      <h1>{titulo}</h1>
      {accion ?? <time dateTime={hoy} className="texto-suave">{fechaLarga(hoy)}</time>}
    </header>
  );
}
