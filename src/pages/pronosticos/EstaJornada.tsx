import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TarjetaPartido } from '../../components/TarjetaPartido';
import { useProceso } from '../../lib/datos';
import { fechaDia, fechaHora, aPartido, COMPETICIONES, ejecucionAntigua, NOMBRE_COMPETICION } from '../../lib/pronosticos';
import { useSesion } from '../../lib/sesion';
import { useEjecucion, useJornadaActual } from '../../lib/usePronosticos';

export function EstaJornada() {
  const uid = useSesion().usuario!.uid;
  const { estado, jornada } = useJornadaActual(uid);
  const ejecucion = useEjecucion(uid);
  const consulta = jornada ? { donde: ['jornada', '==', jornada.id] as ['jornada', '==', string] } : null;
  const provisionales = useProceso(uid, 'pronPartidos', aPartido, consulta);
  const congelados = useProceso(uid, 'pronCongelados', aPartido, consulta);
  const ahora = Date.now();

  // Lo congelado manda: es el pronóstico que se audita.
  const partidos = useMemo(() => {
    const porId = new Map(provisionales.datos.map((p) => [p.id, p]));
    for (const p of congelados.datos) porId.set(p.id, p);
    return [...porId.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [provisionales.datos, congelados.datos]);

  if (estado === 'error' || provisionales.estado === 'error' || congelados.estado === 'error') {
    return (
      <p className="aviso-error" role="alert">
        No se han podido cargar los pronósticos. Comprueba tu conexión y recarga la página.
      </p>
    );
  }
  if (estado === 'cargando') return <div className="esqueleto__fila" role="status" aria-label="Cargando la jornada" />;
  if (!jornada) {
    return (
      <p className="vacio">
        Aún no hay ninguna jornada. La crea el proceso diario, que se ejecuta cada mañana.
      </p>
    );
  }

  return (
    <>
      <p className="texto-suave pronosticos__nota">
        {ejecucion.datos ? `Última ejecución: ${fechaHora(ejecucion.datos.fecha)}.` : 'Sin datos de la última ejecución.'}{' '}
        {partidos.length} {partidos.length === 1 ? 'partido destacado' : 'partidos destacados'} del{' '}
        {fechaDia(jornada.inicio)} al {fechaDia(new Date(Date.parse(jornada.fin) - 1).toISOString())}.
      </p>
      {ejecucion.estado === 'listo' && ejecucionAntigua(ejecucion.datos, ahora) && (
        <ul className="avisos">
          <li>
            El proceso diario lleva más de un día sin ejecutarse: estos datos pueden estar antiguos. Míralo en{' '}
            <Link className="enlace" to="/pronosticos/ajustes">
              Ajustes
            </Link>
            .
          </li>
        </ul>
      )}
      {partidos.length === 0 ? (
        <p className="vacio">Esta jornada no tiene partidos destacados pendientes.</p>
      ) : (
        COMPETICIONES.map((competicion) => {
          const grupo = partidos.filter((p) => p.competicion === competicion);
          if (!grupo.length) return null;
          return (
            <section key={competicion} className="pronosticos__seccion" aria-labelledby={`jornada-${competicion}`}>
              <h2 id={`jornada-${competicion}`} className="seccion__nombre">
                {NOMBRE_COMPETICION[competicion]}
              </h2>
              <div className="partidos">
                {grupo.map((partido) => (
                  <TarjetaPartido key={partido.id} partido={partido} ahora={ahora} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
