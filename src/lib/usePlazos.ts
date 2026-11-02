import { useMemo } from 'react';
import { useColeccion, type Lectura } from './datos.ts';
import { aPlazo, type PlazoListado } from './plazos.ts';
import { aConvocatoria, plazosDeConvocatorias } from './vivienda.ts';

/** Los plazos propios junto con los fines de plazo de las convocatorias de vivienda. */
export function usePlazos(uid: string): Lectura<PlazoListado[]> {
  const plazos = useColeccion(uid, 'plazos', aPlazo);
  const vivienda = useColeccion(uid, 'vivienda', aConvocatoria);

  const datos = useMemo<PlazoListado[]>(
    () => [...plazos.datos, ...plazosDeConvocatorias(vivienda.datos)],
    [plazos.datos, vivienda.datos],
  );

  const estados = [plazos.estado, vivienda.estado];
  const estado = estados.includes('error')
    ? 'error'
    : estados.includes('cargando')
      ? 'cargando'
      : 'listo';
  return { estado, datos };
}
