import { useColeccion, useDocumentoProceso, useProceso, type ConsultaProceso } from './datos';
import {
  aApuestaReal,
  aComprobacion,
  aEjecucion,
  aEstadisticasCL,
  aJornada,
  aMetricas,
  aPartido,
  calcularPendientes,
} from './pronosticos';
import { useHoy } from './useHoy';

const ULTIMA_JORNADA: ConsultaProceso = { ordenDesc: 'inicio', limite: 1 };

/** La jornada más reciente, sin calcular la semana en la web: la fija el proceso diario. */
export function useJornadaActual(uid: string) {
  const { estado, datos } = useProceso(uid, 'pronJornadas', aJornada, ULTIMA_JORNADA);
  return { estado, jornada: datos[0] ?? null };
}

export const useEjecucion = (uid: string) => useDocumentoProceso(uid, 'pronEstado', 'ultima', aEjecucion);
export const useMetricas = (uid: string) => useDocumentoProceso(uid, 'pronMetricas', 'resumen', aMetricas);
export const useApuestasReales = (uid: string) => useColeccion(uid, 'pronApuestas', aApuestaReal);

/** Solo lo reciente: pasados 7 días, lo que falte ya no se puede liquidar. */
export function usePendientes(uid: string) {
  const hoy = useHoy();
  const desde = new Date(Date.parse(`${hoy}T00:00:00Z`) - 8 * 86_400_000).toISOString();
  const congelados = useProceso(uid, 'pronCongelados', aPartido, { donde: ['inicio', '>=', desde] });
  const estadisticas = useColeccion(uid, 'pronEstadisticasCL', aEstadisticasCL);
  const comprobaciones = useColeccion(uid, 'pronComprobaciones', aComprobacion);
  const apuestas = useApuestasReales(uid);

  const estados = [congelados.estado, estadisticas.estado, comprobaciones.estado, apuestas.estado];
  return {
    estado: estados.includes('error') ? ('error' as const) : estados.includes('cargando') ? ('cargando' as const) : ('listo' as const),
    pendientes: calcularPendientes(congelados.datos, estadisticas.datos, comprobaciones.datos, apuestas.datos, Date.now()),
    comprobaciones: comprobaciones.datos,
  };
}
