import { Link } from 'react-router-dom';
import {
  TOPE_JORNADA_CENTIMOS,
  datosJugadoresAntiguos,
  ejecucionAntigua,
  euros,
  eurosConSigno,
  fechaHora,
} from '../lib/pronosticos';
import { useEjecucion, useJornadaActual, useMetricas, usePendientes } from '../lib/usePronosticos';

/** La tarjeta de Inicio. Si algo falla, se degrada ella sola y la portada sigue. */
export function BloquePronosticos({ uid }: { uid: string }) {
  const { estado, jornada } = useJornadaActual(uid);
  const metricas = useMetricas(uid);
  const ejecucion = useEjecucion(uid);
  const { pendientes } = usePendientes(uid);
  const ahora = Date.now();

  const boleto = jornada?.boleto;
  const balance = metricas.datos?.apuestas;
  const ultima = ejecucion.datos?.ultimaImportacion;

  const avisos: { texto: string; ruta: string }[] = [];
  if (pendientes.length > 0) {
    avisos.push({
      texto:
        pendientes.length === 1 ? '1 partido pendiente de rellenar' : `${pendientes.length} partidos pendientes de rellenar`,
      ruta: '/pronosticos/pendientes',
    });
  }
  if (ejecucion.estado === 'listo' && datosJugadoresAntiguos(ultima ? [{ fecha: ultima }] : [], ahora)) {
    avisos.push({
      texto: ultima ? 'Los datos de jugadores tienen más de 14 días' : 'Aún no has importado datos de jugadores',
      ruta: '/pronosticos/ajustes',
    });
  }
  if (ejecucion.estado === 'listo' && ejecucionAntigua(ejecucion.datos, ahora)) {
    avisos.push({ texto: 'El proceso diario lleva más de un día sin ejecutarse', ruta: '/pronosticos/ajustes' });
  }

  return (
    <section className="bloque" aria-labelledby="inicio-pronosticos">
      <div className="seccion__titulo seccion__titulo--junto">
        <h2 id="inicio-pronosticos">Pronósticos</h2>
        <Link className="enlace" to="/pronosticos/boleto">
          Ver boleto
        </Link>
      </div>
      {estado === 'error' ? (
        <p className="aviso-error" role="alert">
          No se han podido cargar los pronósticos.
        </p>
      ) : estado === 'cargando' ? (
        <div className="esqueleto__fila" role="status" aria-label="Cargando los pronósticos" />
      ) : !boleto ? (
        <p className="vacio">Aún no hay boleto para esta jornada.</p>
      ) : (
        <>
          <p className="cifra">
            {euros(boleto.totalCentimos)} <span className="boleto__tope">de {euros(TOPE_JORNADA_CENTIMOS)}</span>
          </p>
          <p>
            {boleto.vacio
              ? 'Ninguna apuesta cumple las reglas esta jornada'
              : `${boleto.apuestas.length} ${boleto.apuestas.length === 1 ? 'apuesta propuesta' : 'apuestas propuestas'}`}
          </p>
          <p className="texto-pequeno">Jornada {jornada.id} · {fechaHora(boleto.generado)}</p>
        </>
      )}
      {balance && balance.n > 0 && (
        <p>
          Balance acumulado:{' '}
          <strong className={balance.beneficioCentimos >= 0 ? 'positivo' : 'negativo'}>
            {eurosConSigno(balance.beneficioCentimos)}
          </strong>
        </p>
      )}
      {avisos.map((a) => (
        <p key={a.texto} className="texto-pequeno">
          <Link className="enlace" to={a.ruta}>
            {a.texto}
          </Link>
        </p>
      ))}
    </section>
  );
}
