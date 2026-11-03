import {
  CATEGORIAS_JUGADOR,
  ESTADISTICAS,
  NOMBRE_CATEGORIA,
  NOMBRE_ESTADISTICA,
  cuota,
  etiquetaClave,
  fechaHora,
  mercadosPrincipales,
  nombreCasa,
  pct,
  type Partido,
} from '../lib/pronosticos';

const dosDecimales = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ORIGEN: Record<string, string> = { modelo: 'Modelo', mercado: 'Mercado', sin_datos: 'Sin datos' };

function Signo({ partido, clave, titulo }: { partido: Partido; clave: string; titulo: string }) {
  const item = partido.items[clave];
  return (
    <div className="signo">
      <dt>{titulo}</dt>
      <dd className="signo__prob">{pct(item?.final)}</dd>
      <dd className="texto-pequeno">
        {item?.modelo !== null && item?.modelo !== undefined && <>Modelo {pct(item.modelo)}</>}
      </dd>
      <dd className="texto-pequeno">
        {item?.cuota ? `${cuota(item.cuota)} en ${nombreCasa(item.casa)}` : 'Sin cuota'}
      </dd>
    </div>
  );
}

const rangoTexto = (rango: number[] | undefined) =>
  rango && rango.length === 2 ? (rango[0] === rango[1] ? String(rango[0]) : `${rango[0]} a ${rango[1]}`) : '–';

export function TarjetaPartido({ partido, ahora }: { partido: Partido; ahora: number }) {
  const empezado = Date.parse(partido.inicio) <= ahora;
  const claves = mercadosPrincipales(partido.items);

  return (
    <article className="partido">
      <header className="partido__cabecera">
        <h3 className="partido__titulo">
          {partido.local} <span className="texto-suave">-</span> {partido.visitante}
        </h3>
        <p className="texto-pequeno">
          {fechaHora(partido.inicio)}
          {empezado && ' · Empezado'}
          {partido.congelado
            ? ` · Congelado: ${fechaHora(partido.congelado)}`
            : ` · Provisional: ${fechaHora(partido.actualizado)}`}
        </p>
      </header>

      <div className="partido__cuerpo">
        <dl className="signos">
          <Signo partido={partido} clave="1" titulo={partido.local} />
          <Signo partido={partido} clave="X" titulo="Empate" />
          <Signo partido={partido} clave="2" titulo={partido.visitante} />
        </dl>

        <dl className="partido__goles">
          <div>
            <dt className="texto-pequeno">Goles esperados</dt>
            <dd className="partido__dato">
              {dosDecimales.format(partido.golesLocal)} - {dosDecimales.format(partido.golesVisitante)}
            </dd>
          </div>
          <div>
            <dt className="texto-pequeno">Marcadores más probables</dt>
            <dd className="partido__marcadores">
              {partido.marcadores.map((m) => (
                <span key={`${m.local}-${m.visitante}`}>
                  <strong>
                    {m.local}-{m.visitante}
                  </strong>{' '}
                  {pct(m.prob)}
                </span>
              ))}
            </dd>
          </div>
        </dl>

        <div className="tabla-marco">
          <table className="tabla tabla--simple tabla--compacta">
            <caption className="oculto">Rango probable, del percentil 25 al 75</caption>
            <thead>
              <tr>
                <th scope="col">Rango 25-75</th>
                <th scope="col" className="tabla__num">
                  Total
                </th>
                <th scope="col" className="tabla__num">
                  Local
                </th>
                <th scope="col" className="tabla__num">
                  Visitante
                </th>
              </tr>
            </thead>
            <tbody>
              {ESTADISTICAS.map((nombre) => {
                const rango = partido.rangos[nombre];
                return (
                  <tr key={nombre}>
                    <th scope="row">{NOMBRE_ESTADISTICA[nombre]}</th>
                    <td className="tabla__num">{rangoTexto(rango?.total)}</td>
                    <td className="tabla__num">{rangoTexto(rango?.local)}</td>
                    <td className="tabla__num">{rangoTexto(rango?.visitante)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <details className="desplegable">
        <summary>Jugadores</summary>
        <div className="jugadores">
          {CATEGORIAS_JUGADOR.map((categoria) => {
            const lista = partido.jugadores[categoria] ?? [];
            return (
              <section key={categoria}>
                <h4 className="jugadores__titulo">{NOMBRE_CATEGORIA[categoria]}</h4>
                {lista.length === 0 ? (
                  <p className="texto-pequeno">Sin datos</p>
                ) : (
                  <ul className="jugadores__lista">
                    {lista.map((j) => (
                      <li key={j.jugador}>
                        <span>{j.jugador}</span>
                        <span className="jugadores__prob">{pct(j.prob)}</span>
                        <span className="texto-pequeno">{ORIGEN[j.origen] ?? j.origen}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </details>

      {claves.length > 0 && (
        <details className="desplegable">
          <summary>Más mercados</summary>
          <div className="tabla-marco">
            <table className="tabla tabla--simple tabla--compacta">
              <thead>
                <tr>
                  <th scope="col">Selección</th>
                  <th scope="col" className="tabla__num">
                    Final
                  </th>
                  <th scope="col" className="tabla__num">
                    Modelo
                  </th>
                  <th scope="col" className="tabla__num">
                    Mercado
                  </th>
                  <th scope="col" className="tabla__num">
                    Cuota
                  </th>
                </tr>
              </thead>
              <tbody>
                {claves.map((clave) => {
                  const item = partido.items[clave];
                  return (
                    <tr key={clave}>
                      <th scope="row">{etiquetaClave(clave, partido.local, partido.visitante)}</th>
                      <td className="tabla__num">{pct(item.final)}</td>
                      <td className="tabla__num">{pct(item.modelo)}</td>
                      <td className="tabla__num">{pct(item.mercado)}</td>
                      <td className="tabla__num">
                        {item.cuota ? (
                          <>
                            {cuota(item.cuota)}
                            <span className="tabla__casa">{nombreCasa(item.casa)}</span>
                          </>
                        ) : (
                          '–'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </article>
  );
}
