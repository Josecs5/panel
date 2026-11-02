import { Link } from 'react-router-dom';
import { BloqueAportacion, BloqueNasdaq, BloqueValorCartera } from '../components/BloquesCartera';
import { Cabecera } from '../components/Cabecera';
import { ResumenPlazo } from '../components/PlazoVista';
import { aCandidatura, ETIQUETA_FASE, proximosPasos } from '../lib/candidaturas';
import { useColeccion } from '../lib/datos';
import { fechaCorta } from '../lib/fechas';
import { separarPlazos } from '../lib/plazos';
import { useSesion } from '../lib/sesion';
import { useCartera } from '../lib/useCartera';
import { useHoy } from '../lib/useHoy';
import { usePlazos } from '../lib/usePlazos';
import { aConvocatoria, ordenarConvocatorias } from '../lib/vivienda';

const MAXIMO_FILAS = 5;

export function Inicio() {
  const uid = useSesion().usuario!.uid;
  const hoy = useHoy();
  const { estado, datos } = usePlazos(uid);
  const proximos = separarPlazos(datos, hoy).proximos.slice(0, MAXIMO_FILAS);
  const cartera = useCartera(uid);
  const vivienda = useColeccion(uid, 'vivienda', aConvocatoria);
  const candidaturas = useColeccion(uid, 'candidaturas', aCandidatura);

  const abiertas = ordenarConvocatorias(vivienda.datos.filter((c) => c.estado === 'abierta'));
  const pasos = proximosPasos(candidaturas.datos);

  return (
    <>
      <Cabecera titulo="Inicio" />
      <div className="inicio">
        <section aria-labelledby="inicio-plazos">
          <div className="seccion__titulo">
            <h2 id="inicio-plazos">Próximos plazos</h2>
            <Link className="enlace" to="/plazos">
              Ver todos
            </Link>
          </div>
          {estado === 'error' && (
            <p className="aviso-error" role="alert">
              No se han podido cargar los plazos. Comprueba tu conexión y recarga la página.
            </p>
          )}
          {estado === 'cargando' && <EsqueletoPlazos />}
          {estado === 'listo' && proximos.length === 0 && (
            <p className="vacio">
              No tienes plazos próximos. <Link className="enlace" to="/plazos">Añade uno</Link> o
              importa tu copia desde <Link className="enlace" to="/ajustes">Ajustes</Link>.
            </p>
          )}
          {proximos.length > 0 && (
            <ul className="lista-plazos">
              {proximos.map((plazo) => (
                <li key={plazo.id} className="plazo plazo--resumen">
                  <ResumenPlazo plazo={plazo} hoy={hoy} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="inicio__lateral">
          {cartera.avisoAportacion && (
            <section className="bloque bloque--aviso" aria-labelledby="inicio-aportacion">
              <h2 id="inicio-aportacion">Aportación pendiente</h2>
              <BloqueAportacion aviso={cartera.avisoAportacion} />
            </section>
          )}
          <section className="bloque" aria-labelledby="inicio-cartera">
            <div className="seccion__titulo seccion__titulo--junto">
              <h2 id="inicio-cartera">Cartera</h2>
              <Link className="enlace" to="/cartera">
                Ver cartera
              </Link>
            </div>
            {cartera.hayError ? (
              <p className="aviso-error" role="alert">
                No se ha podido cargar la cartera. Recarga la página.
              </p>
            ) : cartera.listo ? (
              <BloqueValorCartera
                resumen={cartera.resumen}
                actualizadoEn={cartera.actualizadoEn}
                hayPosiciones={cartera.posiciones.length > 0}
              />
            ) : (
              <div className="esqueleto__fila" role="status" aria-label="Cargando la cartera" />
            )}
            {cartera.avisos.map((texto) => (
              <p key={texto} className="texto-pequeno">
                {texto}
              </p>
            ))}
          </section>
          <section className="bloque" aria-labelledby="inicio-mercado">
            <h2 id="inicio-mercado">Mercado de EE. UU.</h2>
            <BloqueNasdaq />
          </section>
          <section className="bloque" aria-labelledby="inicio-vivienda">
            <div className="seccion__titulo seccion__titulo--junto">
              <h2 id="inicio-vivienda">Convocatorias de vivienda abiertas</h2>
              <Link className="enlace" to="/vivienda">
                Ver todas
              </Link>
            </div>
            {vivienda.estado === 'error' && (
              <p className="aviso-error" role="alert">
                No se han podido cargar las convocatorias.
              </p>
            )}
            {vivienda.estado === 'listo' && abiertas.length === 0 && (
              <p className="texto-suave">Ninguna abierta ahora mismo.</p>
            )}
            {abiertas.length > 0 && (
              <ul className="lista-breve">
                {abiertas.slice(0, MAXIMO_FILAS).map((c) => (
                  <li key={c.id}>
                    <span className="lista-breve__titulo">{c.promocion}</span>
                    <span className="texto-pequeno">
                      {c.municipio}
                      {c.finPlazo ? ` · hasta el ${fechaCorta(c.finPlazo)}` : ' · sin fecha de fin'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="bloque" aria-labelledby="inicio-candidaturas">
            <div className="seccion__titulo seccion__titulo--junto">
              <h2 id="inicio-candidaturas">Próximos pasos de candidaturas</h2>
              <Link className="enlace" to="/candidaturas">
                Ver tablero
              </Link>
            </div>
            {candidaturas.estado === 'error' && (
              <p className="aviso-error" role="alert">
                No se han podido cargar las candidaturas.
              </p>
            )}
            {candidaturas.estado === 'listo' && pasos.length === 0 && (
              <p className="texto-suave">Sin próximos pasos pendientes.</p>
            )}
            {pasos.length > 0 && (
              <ul className="lista-breve">
                {pasos.slice(0, MAXIMO_FILAS).map((c) => {
                  const vencido = c.proximoPasoFecha !== null && c.proximoPasoFecha < hoy;
                  return (
                    <li key={c.id}>
                      <span className="lista-breve__titulo">
                        {c.empresa}: {c.proximoPaso}
                      </span>
                      <span className={vencido ? 'texto-pequeno negativo' : 'texto-pequeno'}>
                        {c.proximoPasoFecha && (
                          <>
                            {vencido && 'Pasado: '}
                            {fechaCorta(c.proximoPasoFecha)} ·{' '}
                          </>
                        )}
                        {ETIQUETA_FASE[c.fase]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export function EsqueletoPlazos() {
  return (
    <div className="esqueleto" role="status" aria-label="Cargando los plazos">
      {[0, 1, 2].map((i) => (
        <div key={i} className="esqueleto__fila" />
      ))}
    </div>
  );
}
