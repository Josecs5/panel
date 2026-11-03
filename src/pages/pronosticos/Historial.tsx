import { lazy, Suspense, useMemo, useState } from 'react';
import { useProceso } from '../../lib/datos';
import {
  COMPETICIONES,
  NOMBRE_COMPETICION,
  NOMBRE_GRUPO,
  aLiquidacion,
  aciertos,
  beneficioAcumulado,
  etiquetaClave,
  euros,
  eurosConSigno,
  fechaHora,
  pct,
  signoMasProbable,
  type Liquidacion,
} from '../../lib/pronosticos';
import { useSesion } from '../../lib/sesion';
import { useApuestasReales } from '../../lib/usePronosticos';

const GraficoBeneficio = lazy(() =>
  import('../../components/GraficosPronosticos').then((m) => ({ default: m.GraficoBeneficio })),
);
const TODOS = 'todos';
const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function FilaPartido({ liquidacion: l, grupo }: { liquidacion: Liquidacion; grupo: string | null }) {
  const signo = signoMasProbable(l);
  const resumen = aciertos(l, grupo);
  const { local, visitante } = l.resultado;
  return (
    <li className="historial__partido">
      <div>
        <p className="plazo__titulo">
          {l.local} {local !== null && visitante !== null ? `${local}-${visitante}` : '-'} {l.visitante}
        </p>
        <p className="texto-pequeno">
          {NOMBRE_COMPETICION[l.competicion] ?? l.competicion} · {fechaHora(l.inicio)} · Versión {l.version}
        </p>
      </div>
      <div className="historial__dato">
        {signo && (
          <p className={signo.acierto ? 'positivo' : 'negativo'}>
            {etiquetaClave(signo.clave, l.local, l.visitante)}, {pct(signo.prob)}: {signo.acierto ? 'acertó' : 'falló'}
          </p>
        )}
        <p className="texto-pequeno">
          {resumen.total === 0
            ? 'Nada liquidado en este mercado'
            : `Acertados ${resumen.ganadas} de ${resumen.total}; se esperaban ${decimal.format(resumen.esperado)}`}
          {!l.fin && ' · Faltan datos por llegar'}
        </p>
      </div>
    </li>
  );
}

export function Historial() {
  const uid = useSesion().usuario!.uid;
  const { estado, datos } = useProceso(uid, 'pronLiquidaciones', aLiquidacion);
  const apuestas = useApuestasReales(uid);
  const [liga, setLiga] = useState(TODOS);
  const [grupo, setGrupo] = useState(TODOS);

  const serie = useMemo(() => beneficioAcumulado(apuestas.datos), [apuestas.datos]);
  const balancePorSemana = useMemo(() => new Map(serie.map((p) => [p.semana, p.beneficio])), [serie]);
  const grupoFiltro = grupo === TODOS ? null : grupo;

  const jornadas = useMemo(() => {
    const porJornada = new Map<string, Liquidacion[]>();
    const filtradas = datos
      .filter((l) => liga === TODOS || l.competicion === liga)
      .filter((l) => !grupoFiltro || Object.values(l.items).some((i) => i.grupo === grupoFiltro))
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
    for (const l of filtradas) {
      const lista = porJornada.get(l.jornada) ?? [];
      lista.push(l);
      porJornada.set(l.jornada, lista);
    }
    return [...porJornada.entries()];
  }, [datos, liga, grupoFiltro]);

  if (estado === 'error' || apuestas.estado === 'error') {
    return (
      <p className="aviso-error" role="alert">
        No se ha podido cargar el historial. Comprueba tu conexión y recarga la página.
      </p>
    );
  }
  if (estado === 'cargando') return <div className="esqueleto__fila" role="status" aria-label="Cargando el historial" />;
  if (datos.length === 0) {
    return (
      <p className="vacio">
        Aún no hay partidos liquidados. Aparecerán aquí cuando termine el primer partido congelado y lo procese la
        ejecución de la mañana siguiente.
      </p>
    );
  }

  const ultimo = serie[serie.length - 1];

  return (
    <>
      <section className="pronosticos__seccion" aria-labelledby="historial-beneficio">
        <h2 id="historial-beneficio" className="seccion__nombre">
          Beneficio acumulado
        </h2>
        {serie.length === 0 ? (
          <p className="vacio">Aún no hay apuestas tuyas liquidadas.</p>
        ) : (
          <>
            <p className="cifra">
              <span className={ultimo.acumulado >= 0 ? 'positivo' : 'negativo'}>{eurosConSigno(ultimo.acumulado)}</span>
            </p>
            <p className="texto-pequeno">Hasta la jornada {ultimo.semana}</p>
            {serie.length >= 2 && (
              <Suspense fallback={<div className="esqueleto__fila" role="status" aria-label="Cargando el gráfico" />}>
                <GraficoBeneficio serie={serie} />
              </Suspense>
            )}
          </>
        )}
      </section>

      <div className="filtros">
        <label className="campo campo--enlinea">
          <span>Liga</span>
          <select value={liga} onChange={(e) => setLiga(e.target.value)}>
            <option value={TODOS}>Todas</option>
            {COMPETICIONES.map((c) => (
              <option key={c} value={c}>
                {NOMBRE_COMPETICION[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="campo campo--enlinea">
          <span>Mercado</span>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value={TODOS}>Todos</option>
            {Object.entries(NOMBRE_GRUPO).map(([clave, nombre]) => (
              <option key={clave} value={clave}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {jornadas.length === 0 && <p className="vacio">Ningún partido coincide con estos filtros.</p>}
      {jornadas.map(([semana, lista]) => {
        const balance = balancePorSemana.get(semana);
        return (
          <section key={semana} className="pronosticos__seccion" aria-label={`Jornada ${semana}`}>
            <div className="seccion__titulo">
              <h2 className="seccion__nombre">Jornada {semana}</h2>
              <p className="texto-pequeno">
                {balance === undefined ? 'Sin apuestas liquidadas' : `Balance: ${eurosConSigno(balance)}`}
              </p>
            </div>
            <ul className="historial">
              {lista.map((l) => (
                <FilaPartido key={l.id} liquidacion={l} grupo={grupoFiltro} />
              ))}
            </ul>
          </section>
        );
      })}
      {apuestas.datos.some((a) => a.estado === 'hecha' && !a.liquidacion) && (
        <p className="texto-pequeno">
          Tienes apuestas sin liquidar por valor de{' '}
          {euros(
            apuestas.datos
              .filter((a) => a.estado === 'hecha' && !a.liquidacion)
              .reduce((total, a) => total + (a.stakeRealCentimos ?? 0), 0),
          )}
          .
        </p>
      )}
    </>
  );
}
