import { useState, type FormEvent } from 'react';
import { guardarElemento } from '../../lib/datos';
import {
  TOPE_JORNADA_CENTIMOS,
  centimosDisponibles,
  cuota,
  etiquetaClave,
  euros,
  eurosConSigno,
  fechaHora,
  nombreCasa,
  pct,
  pctConSigno,
  type ApuestaBoleto,
  type ApuestaReal,
  type Jornada,
} from '../../lib/pronosticos';
import { useSesion } from '../../lib/sesion';
import { useApuestasReales, useJornadaActual } from '../../lib/usePronosticos';

const aNumero = (texto: string) => Number(texto.replace(',', '.'));
const ESTADO_LIQUIDACION: Record<string, string> = {
  ganada: 'Ganada',
  perdida: 'Perdida',
  sin_liquidar: 'Sin liquidar',
};

function datosApuesta(jornada: Jornada, apuesta: ApuestaBoleto) {
  return {
    semana: jornada.id,
    selecciones: apuesta.selecciones.map((s) => ({ partido: s.partido, clave: s.clave })),
  };
}

function FormularioHecha({
  jornada,
  apuesta,
  disponibles,
  onTerminar,
}: {
  jornada: Jornada;
  apuesta: ApuestaBoleto;
  disponibles: number;
  onTerminar: () => void;
}) {
  const uid = useSesion().usuario!.uid;
  const [cuotaReal, setCuotaReal] = useState(String(apuesta.cuota.toFixed(2)).replace('.', ','));
  const [stake, setStake] = useState(String((apuesta.stakeCentimos / 100).toFixed(2)).replace('.', ','));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const valorCuota = aNumero(cuotaReal);
    const centimos = Math.round(aNumero(stake) * 100);
    if (!(valorCuota > 1)) return setError('La cuota debe ser mayor que 1.');
    if (!(centimos > 0)) return setError('El stake debe ser mayor que 0 €.');
    if (centimos > disponibles) {
      return setError(`Con esto pasarías de ${euros(TOPE_JORNADA_CENTIMOS)} en la jornada: te quedan ${euros(disponibles)}.`);
    }
    setGuardando(true);
    try {
      await guardarElemento(
        uid,
        'pronApuestas',
        { ...datosApuesta(jornada, apuesta), estado: 'hecha', cuotaReal: valorCuota, stakeRealCentimos: centimos },
        apuesta.id,
      );
      onTerminar();
    } catch {
      setError('No se ha podido guardar. Vuelve a intentarlo.');
      setGuardando(false);
    }
  }

  return (
    <form className="apuesta__formulario" onSubmit={enviar}>
      <label className="campo">
        <span>Cuota real</span>
        <input inputMode="decimal" required autoFocus value={cuotaReal} onChange={(e) => setCuotaReal(e.target.value)} />
      </label>
      <label className="campo">
        <span>Stake real (€)</span>
        <input inputMode="decimal" required value={stake} onChange={(e) => setStake(e.target.value)} />
      </label>
      <div className="formulario__acciones">
        <button className="boton boton--principal boton--peq" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="boton boton--secundario boton--peq" onClick={onTerminar}>
          Cancelar
        </button>
      </div>
      {error && (
        <p className="aviso-error apuesta__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Accion({ jornada, apuesta, real, disponibles }: { jornada: Jornada; apuesta: ApuestaBoleto; real?: ApuestaReal; disponibles: number }) {
  const uid = useSesion().usuario!.uid;
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState(false);

  async function noHecha() {
    setError(false);
    try {
      await guardarElemento(
        uid,
        'pronApuestas',
        { ...datosApuesta(jornada, apuesta), estado: 'no_hecha', cuotaReal: null, stakeRealCentimos: null },
        apuesta.id,
      );
    } catch {
      setError(true);
    }
  }

  if (editando) {
    return <FormularioHecha jornada={jornada} apuesta={apuesta} disponibles={disponibles} onTerminar={() => setEditando(false)} />;
  }
  if (real?.liquidacion) {
    return (
      <p className="apuesta__estado">
        {ESTADO_LIQUIDACION[real.liquidacion.estado] ?? real.liquidacion.estado}:{' '}
        <strong className={real.liquidacion.beneficioCentimos >= 0 ? 'positivo' : 'negativo'}>
          {eurosConSigno(real.liquidacion.beneficioCentimos)}
        </strong>
      </p>
    );
  }
  return (
    <div className="apuesta__acciones">
      {real && (
        <p className="apuesta__estado">
          {real.estado === 'hecha'
            ? `Hecha: ${euros(real.stakeRealCentimos ?? 0)} a ${cuota(real.cuotaReal)}`
            : 'No la hiciste'}
        </p>
      )}
      <button type="button" className="boton boton--secundario boton--peq" onClick={() => setEditando(true)}>
        {real?.estado === 'hecha' ? 'Corregir' : 'La he hecho'}
      </button>
      {real?.estado !== 'no_hecha' && (
        <button type="button" className="boton boton--secundario boton--peq" onClick={noHecha}>
          No la hice
        </button>
      )}
      {error && (
        <p className="aviso-error apuesta__error" role="alert">
          No se ha podido guardar. Vuelve a intentarlo.
        </p>
      )}
    </div>
  );
}

function Apuesta({ jornada, apuesta, reales }: { jornada: Jornada; apuesta: ApuestaBoleto; reales: ApuestaReal[] }) {
  const real = reales.find((r) => r.id === apuesta.id);
  return (
    <li className="apuesta">
      <div className="apuesta__selecciones">
        {apuesta.combinada && <p className="apuesta__tipo">Combinada de {apuesta.selecciones.length}</p>}
        {apuesta.selecciones.map((s, indice) => {
          const hoy = jornada.seguimiento[`${apuesta.id}#${indice}`];
          return (
            <div key={`${s.partido}-${s.clave}`} className="seleccion">
              <p className="plazo__titulo">{etiquetaClave(s.clave, s.local, s.visitante)}</p>
              <p className="texto-pequeno">
                {s.local} - {s.visitante} · {nombreCasa(s.casa)}
              </p>
              <p className="seleccion__cuotas">
                Cuota {cuota(s.cuota)} · Mínima aceptable <strong>{cuota(s.cuotaMinima)}</strong>
              </p>
              {hoy && (
                <p className={hoy.cumple ? 'texto-pequeno' : 'texto-pequeno negativo'}>
                  Hoy: {cuota(hoy.cuotaHoy)}
                  {hoy.cumple ? '' : '. Ya no llega a la mínima: no la hagas a esta cuota.'}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <dl className="apuesta__datos">
        <div>
          <dt>Probabilidad</dt>
          <dd>{pct(apuesta.prob)}</dd>
        </div>
        <div>
          <dt>Cuota</dt>
          <dd>{cuota(apuesta.cuota)}</dd>
        </div>
        <div>
          <dt>VE</dt>
          <dd>{pctConSigno(apuesta.ve)}</dd>
        </div>
        <div>
          <dt>Stake</dt>
          <dd className="apuesta__stake">{euros(apuesta.stakeCentimos)}</dd>
        </div>
      </dl>
      <Accion
        jornada={jornada}
        apuesta={apuesta}
        real={real}
        disponibles={centimosDisponibles(reales, jornada.id, apuesta.id)}
      />
    </li>
  );
}

export function BoletoVista() {
  const uid = useSesion().usuario!.uid;
  const { estado, jornada } = useJornadaActual(uid);
  const reales = useApuestasReales(uid);

  if (estado === 'error' || reales.estado === 'error') {
    return (
      <p className="aviso-error" role="alert">
        No se ha podido cargar el boleto. Comprueba tu conexión y recarga la página.
      </p>
    );
  }
  if (estado === 'cargando') return <div className="esqueleto__fila" role="status" aria-label="Cargando el boleto" />;

  const boleto = jornada?.boleto;
  if (!jornada || !boleto) {
    return <p className="vacio">Aún no hay boleto. Se genera en la primera ejecución con cuotas de cada jornada.</p>;
  }

  return (
    <section aria-labelledby="boleto-titulo">
      <h2 id="boleto-titulo" className="oculto">
        Boleto de la jornada
      </h2>
      <div className="boleto__resumen">
        <p className="cifra">
          {euros(boleto.totalCentimos)} <span className="boleto__tope">de {euros(TOPE_JORNADA_CENTIMOS)}</span>
        </p>
        {!boleto.vacio && <p>VE del boleto: {pctConSigno(boleto.ve)}</p>}
        <p className="texto-pequeno">Generado: {fechaHora(boleto.generado)} · Versión {boleto.version} del modelo</p>
      </div>
      {boleto.vacio ? (
        <p className="vacio">
          Boleto de 0 € esta jornada: ninguna apuesta cumple las reglas. Solo se propone una apuesta si la cuota de tu
          casa supera lo que el mercado considera justo por el margen exigido.
        </p>
      ) : (
        <ul className="apuestas">
          {boleto.apuestas.map((apuesta) => (
            <Apuesta key={apuesta.id} jornada={jornada} apuesta={apuesta} reales={reales.datos} />
          ))}
        </ul>
      )}
    </section>
  );
}
