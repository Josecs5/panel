import { lazy, Suspense, useState } from 'react';
import { useProceso } from '../../lib/datos';
import {
  CASOS_PARA_DESBLOQUEAR,
  NOMBRE_COMPETICION,
  NOMBRE_GRUPO,
  aVersion,
  estadoMercado,
  euros,
  eurosConSigno,
  fechaHora,
  metrica,
  pct,
  pctConSigno,
  type MetricasGrupo,
} from '../../lib/pronosticos';
import { useSesion } from '../../lib/sesion';
import { useMetricas } from '../../lib/usePronosticos';

const GraficoCalibracion = lazy(() =>
  import('../../components/GraficosPronosticos').then((m) => ({ default: m.GraficoCalibracion })),
);

const Muestra = ({ pequena }: { pequena: boolean }) =>
  pequena ? <span className="texto-pequeno auditoria__muestra">Muestra pequeña</span> : null;

function Fila({ nombre, m, estado }: { nombre: string; m?: MetricasGrupo; estado?: string }) {
  return (
    <tr>
      <th scope="row">
        <span className="tabla__nombre-mercado">{nombre}</span>
        {m && <Muestra pequena={m.muestra_pequena} />}
      </th>
      <td className="tabla__num" data-etiqueta="Liquidados">
        {m?.n_total ?? 0}
      </td>
      <td className="tabla__num" data-etiqueta="Esperado">
        {pct(m?.esperado)}
      </td>
      <td className="tabla__num" data-etiqueta="Real">
        {pct(m?.real)}
      </td>
      <td className="tabla__num" data-etiqueta="Brier">
        {metrica(m?.brier)}
      </td>
      <td className="tabla__num" data-etiqueta="Log loss final">
        {metrica(m?.log_loss ?? m?.log_loss_final)}
      </td>
      <td className="tabla__num" data-etiqueta="Log loss modelo">
        {metrica(m?.log_loss_modelo)}
      </td>
      <td className="tabla__num" data-etiqueta="Log loss mercado">
        {metrica(m?.log_loss_mercado)}
      </td>
      {estado !== undefined && <td data-etiqueta="Estado">{estado}</td>}
    </tr>
  );
}

const CABECERA = ['Liquidados', 'Esperado', 'Real', 'Brier', 'Log loss final', 'Log loss modelo', 'Log loss mercado'];

function Cabecera({ primera, conEstado }: { primera: string; conEstado: boolean }) {
  return (
    <thead>
      <tr>
        <th scope="col">{primera}</th>
        {CABECERA.map((c) => (
          <th key={c} scope="col" className="tabla__num">
            {c}
          </th>
        ))}
        {conEstado && <th scope="col">Estado</th>}
      </tr>
    </thead>
  );
}

export function Auditoria() {
  const uid = useSesion().usuario!.uid;
  const metricas = useMetricas(uid);
  const versiones = useProceso(uid, 'pronVersiones', aVersion);
  const grupos = metricas.datos?.grupos ?? {};
  const conCalibracion = Object.keys(grupos).filter((g) => grupos[g].calibracion?.length);
  const [elegido, setElegido] = useState<string | null>(null);
  const grupoCalibracion = elegido && grupos[elegido] ? elegido : conCalibracion[0] ?? null;

  if (metricas.estado === 'error' || versiones.estado === 'error') {
    return (
      <p className="aviso-error" role="alert">
        No se ha podido cargar la auditoría. Comprueba tu conexión y recarga la página.
      </p>
    );
  }
  if (metricas.estado === 'cargando') return <div className="esqueleto__fila" role="status" aria-label="Cargando la auditoría" />;

  const estados = Object.keys(NOMBRE_GRUPO).map((grupo) => ({ grupo, ...estadoMercado(grupo, grupos[grupo]) }));
  const conDatos = estados.filter((e) => grupos[e.grupo]?.n_total);
  const sinDatos = estados.filter((e) => !grupos[e.grupo]?.n_total);
  const enPausa = estados.filter((e) => e.texto === 'En pausa');
  const jugadores = Object.keys(NOMBRE_GRUPO).filter((g) => g.startsWith('jugador_') && !estadoMercado(g, grupos[g]).apostable);
  const apuestas = metricas.datos?.apuestas;
  const detalle = Object.entries(metricas.datos?.detalle ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const ordenadas = [...versiones.datos].sort((a, b) => b.numero - a.numero);

  return (
    <>
      <p className="texto-suave pronosticos__nota">
        {metricas.datos?.generado
          ? `Calculado: ${fechaHora(metricas.datos.generado)}. `
          : 'Aún no hay métricas: se calculan cuando se liquida el primer partido. '}
        Log loss y Brier: cuanto más bajo, mejor. Las comparaciones con el mercado usan solo los casos con cuotas.
      </p>

      <section className="pronosticos__seccion" aria-labelledby="auditoria-mercados">
        <h2 id="auditoria-mercados" className="seccion__nombre">
          Modelo frente al mercado
        </h2>
        {conDatos.length > 0 && (
          <div className="tabla-marco">
            <table className="tabla">
              <Cabecera primera="Mercado" conEstado />
              <tbody>
                {conDatos.map(({ grupo, texto }) => (
                  <Fila key={grupo} nombre={NOMBRE_GRUPO[grupo]} m={grupos[grupo]} estado={texto} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sinDatos.length > 0 && (
          <>
            <h3 className="seccion__nombre">Mercados aún sin liquidar</h3>
            <ul className="sin-datos">
              {sinDatos.map(({ grupo, texto }) => (
                <li key={grupo}>
                  <span>{NOMBRE_GRUPO[grupo]}</span>
                  <span className="texto-suave">{texto}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="auditoria__dos">
        <section className="pronosticos__seccion" aria-labelledby="auditoria-calibracion">
          <h2 id="auditoria-calibracion" className="seccion__nombre">
            Calibración
          </h2>
          {grupoCalibracion ? (
            <>
              <label className="campo campo--enlinea">
                <span>Mercado</span>
                <select value={grupoCalibracion} onChange={(e) => setElegido(e.target.value)}>
                  {conCalibracion.map((g) => (
                    <option key={g} value={g}>
                      {NOMBRE_GRUPO[g] ?? g}
                    </option>
                  ))}
                </select>
              </label>
              <Suspense fallback={<div className="esqueleto__fila" role="status" aria-label="Cargando el gráfico" />}>
                <GraficoCalibracion tramos={grupos[grupoCalibracion].calibracion} />
              </Suspense>
              <details className="grafico__datos">
                <summary>Ver los datos</summary>
                <div className="tabla-marco">
                  <table className="tabla tabla--simple tabla--compacta">
                    <thead>
                      <tr>
                        <th scope="col">Tramo</th>
                        <th scope="col" className="tabla__num">
                          Casos
                        </th>
                        <th scope="col" className="tabla__num">
                          Esperado
                        </th>
                        <th scope="col" className="tabla__num">
                          Real
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupos[grupoCalibracion].calibracion.map((t) => (
                        <tr key={t.tramo}>
                          <th scope="row">{t.tramo}</th>
                          <td className="tabla__num">
                            {t.n}
                            {t.muestra_pequena ? ' (muestra pequeña)' : ''}
                          </td>
                          <td className="tabla__num">{pct(t.esperado)}</td>
                          <td className="tabla__num">{pct(t.real)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <p className="vacio">Se dibuja cuando haya pronósticos liquidados.</p>
          )}
        </section>

        <div className="auditoria__lateral">
          <section className="bloque" aria-labelledby="auditoria-apuestas">
            <h2 id="auditoria-apuestas">Tus apuestas</h2>
            {apuestas && apuestas.n > 0 ? (
              <>
                <p className="cifra">
                  <span className={apuestas.beneficioCentimos >= 0 ? 'positivo' : 'negativo'}>
                    {eurosConSigno(apuestas.beneficioCentimos)}
                  </span>
                </p>
                <p>
                  {apuestas.n} liquidadas · {euros(apuestas.apostadoCentimos)} apostados
                </p>
                <p>
                  ROI {pctConSigno(apuestas.roi)} · CLV {pctConSigno(apuestas.clv)}
                </p>
                <Muestra pequena={apuestas.muestra_pequena} />
              </>
            ) : (
              <p className="vacio">Aún no tienes apuestas liquidadas.</p>
            )}
          </section>
          <section className="bloque" aria-labelledby="auditoria-pausa">
            <h2 id="auditoria-pausa">Mercados en pausa</h2>
            {enPausa.length === 0 ? (
              <p className="vacio">Ninguno.</p>
            ) : (
              <ul className="lista-breve">
                {enPausa.map((e) => (
                  <li key={e.grupo}>{NOMBRE_GRUPO[e.grupo]}</li>
                ))}
              </ul>
            )}
          </section>
          <section className="bloque" aria-labelledby="auditoria-jugadores">
            <h2 id="auditoria-jugadores">Mercados de jugador bloqueados</h2>
            <ul className="lista-breve">
              {jugadores.map((g) => (
                <li key={g}>
                  {NOMBRE_GRUPO[g].replace('Jugador: c', 'C').replace('Jugador: r', 'R').replace('Jugador: v', 'V').replace('Jugador: t', 'T')}:{' '}
                  {grupos[g]?.n_total ?? 0} de {CASOS_PARA_DESBLOQUEAR} liquidados
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {detalle.length > 0 && (
        <section className="pronosticos__seccion" aria-labelledby="auditoria-detalle">
          <h2 id="auditoria-detalle" className="seccion__nombre">
            Por mercado, liga y versión
          </h2>
          <div className="tabla-marco">
            <table className="tabla">
              <Cabecera primera="Mercado" conEstado={false} />
              <tbody>
                {detalle.map(([clave, m]) => {
                  const [grupo, liga, version] = clave.split('|');
                  const nombre = `${NOMBRE_GRUPO[grupo] ?? grupo} · ${NOMBRE_COMPETICION[liga] ?? liga} · v${version}`;
                  return <Fila key={clave} nombre={nombre} m={m} />;
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="pronosticos__seccion" aria-labelledby="auditoria-versiones">
        <h2 id="auditoria-versiones" className="seccion__nombre">
          Versiones del modelo
        </h2>
        {ordenadas.length === 0 ? (
          <p className="vacio">La primera versión se crea en la primera ejecución.</p>
        ) : (
          <ul className="versiones">
            {ordenadas.map((v) => (
              <li key={v.id}>
                <p className="plazo__titulo">Versión {v.numero}</p>
                <p className="texto-pequeno">{fechaHora(v.creada)}</p>
                {v.changelog.map((c) => (
                  <p key={c.texto}>{c.texto}</p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
