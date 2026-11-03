import { useState, type FormEvent } from 'react';
import { ImportarTabla } from '../../components/ImportarTabla';
import { guardarAjustesPronosticos, useAjustesPronosticos } from '../../lib/datos';
import { horaEnMadrid } from '../../lib/fechas';
import { listaDesdeTexto } from '../../lib/prompts';
import {
  TOPE_JORNADA_CENTIMOS,
  derbisATexto,
  derbisDesdeTexto,
  euros,
  fechaHora,
  type AjustesPronosticos,
} from '../../lib/pronosticos';
import { useSesion } from '../../lib/sesion';
import { useEjecucion } from '../../lib/usePronosticos';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const aPorcentaje = (p: number) => String(Math.round(p * 1000) / 10);
const TOPE_ODDSPAPI = 200;

function Formulario({ inicial }: { inicial: AjustesPronosticos }) {
  const uid = useSesion().usuario!.uid;
  const [casas, setCasas] = useState(inicial.casas.join(', '));
  const [liga, setLiga] = useState(String(inicial.maxDestacadosLiga));
  const [champions, setChampions] = useState(String(inicial.maxDestacadosChampions));
  const [inicio, setInicio] = useState(String(inicial.inicioJornada));
  const [derbis, setDerbis] = useState(derbisATexto(inicial.derbis));
  const [ve, setVe] = useState(aPorcentaje(inicial.veMinimo));
  const [prob, setProb] = useState(aPorcentaje(inicial.probMinima));
  const [cuotaMinima, setCuotaMinima] = useState(String(inicial.cuotaMinima));
  const [cuotaMaxima, setCuotaMaxima] = useState(String(inicial.cuotaMaxima));
  const [veCombinada, setVeCombinada] = useState(aPorcentaje(inicial.veMinimoCombinada));
  const [probCombinada, setProbCombinada] = useState(aPorcentaje(inicial.probMinimaCombinada));
  const [resultado, setResultado] = useState<{ error: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    const listaCasas = listaDesdeTexto(casas);
    if (!listaCasas.length) {
      setResultado({ error: true, texto: 'Indica al menos una casa de apuestas.' });
      return;
    }
    setGuardando(true);
    setResultado(null);
    try {
      await guardarAjustesPronosticos(uid, {
        casas: listaCasas,
        maxDestacadosLiga: Number(liga),
        maxDestacadosChampions: Number(champions),
        inicioJornada: Number(inicio),
        derbis: derbisDesdeTexto(derbis),
        veMinimo: Number(ve) / 100,
        probMinima: Number(prob) / 100,
        cuotaMinima: Number(cuotaMinima),
        cuotaMaxima: Number(cuotaMaxima),
        veMinimoCombinada: Number(veCombinada) / 100,
        probMinimaCombinada: Number(probCombinada) / 100,
      });
      setResultado({ error: false, texto: `Guardado a las ${horaEnMadrid()}. Se aplica desde la próxima jornada.` });
    } catch {
      setResultado({ error: true, texto: 'No se han podido guardar. Vuelve a intentarlo.' });
    } finally {
      setGuardando(false);
    }
  }

  const numero = (etiqueta: string, valor: string, cambiar: (v: string) => void, opciones: { min: string; max?: string; step: string }) => (
    <label className="campo">
      <span>{etiqueta}</span>
      <input type="number" inputMode="decimal" required {...opciones} value={valor} onChange={(e) => cambiar(e.target.value)} />
    </label>
  );

  return (
    <form className="formulario" onSubmit={guardar}>
      <label className="campo formulario__ancho">
        <span>Casas de apuestas</span>
        <input spellCheck={false} value={casas} onChange={(e) => setCasas(e.target.value)} />
        <small className="campo__ayuda">
          Separadas por comas, en orden de preferencia: se propone la primera que ofrezca el mercado. Cada casa gasta una
          petición de OddsPapi al día.
        </small>
      </label>
      {numero('Destacados por liga', liga, setLiga, { min: '0', max: '10', step: '1' })}
      {numero('Destacados de Champions', champions, setChampions, { min: '0', max: '10', step: '1' })}
      <label className="campo">
        <span>La jornada empieza el</span>
        <select value={inicio} onChange={(e) => setInicio(e.target.value)}>
          {DIAS.map((dia, i) => (
            <option key={dia} value={i}>
              {dia}
            </option>
          ))}
        </select>
      </label>
      <label className="campo formulario__ancho">
        <span>Derbis</span>
        <textarea rows={4} value={derbis} onChange={(e) => setDerbis(e.target.value)} />
        <small className="campo__ayuda">Uno por línea, con los nombres de football-data.org. Ejemplo: Sevilla FC - Real Betis Balompié.</small>
      </label>
      {numero('VE mínimo (%)', ve, setVe, { min: '0.1', step: '0.1' })}
      {numero('Probabilidad mínima (%)', prob, setProb, { min: '1', max: '100', step: '1' })}
      {numero('Cuota mínima', cuotaMinima, setCuotaMinima, { min: '1.01', step: '0.01' })}
      {numero('Cuota máxima', cuotaMaxima, setCuotaMaxima, { min: '1.01', step: '0.01' })}
      {numero('VE mínimo de combinada (%)', veCombinada, setVeCombinada, { min: '0.1', step: '0.1' })}
      {numero('Probabilidad mínima de combinada (%)', probCombinada, setProbCombinada, { min: '1', max: '100', step: '1' })}
      <p className="texto-suave formulario__ancho">
        El tope de {euros(TOPE_JORNADA_CENTIMOS)} por jornada no se puede cambiar desde aquí.
      </p>
      <div className="formulario__acciones formulario__ancho">
        <button className="boton boton--principal" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar ajustes'}
        </button>
        {resultado && (
          <p className={resultado.error ? 'aviso-error' : 'texto-suave'} role="status">
            {resultado.texto}
          </p>
        )}
      </div>
    </form>
  );
}

function EstadoEjecucion() {
  const uid = useSesion().usuario!.uid;
  const { estado, datos } = useEjecucion(uid);

  return (
    <section className="ajustes__bloque" aria-labelledby="estado-titulo">
      <h2 id="estado-titulo">Última ejecución</h2>
      {estado === 'error' && (
        <p className="aviso-error" role="alert">
          No se ha podido cargar el estado.
        </p>
      )}
      {estado === 'cargando' && <div className="esqueleto__fila" role="status" aria-label="Cargando el estado" />}
      {estado === 'listo' && !datos && <p className="vacio">Aún no se ha ejecutado.</p>}
      {datos && (
        <>
          <dl className="datos-ejecucion">
            <div>
              <dt>Fecha</dt>
              <dd>{fechaHora(datos.fecha)}</dd>
            </div>
            <div>
              <dt>Versión del modelo</dt>
              <dd>{datos.version}</dd>
            </div>
            <div>
              <dt>Partidos con pronóstico</dt>
              <dd>{datos.partidos}</dd>
            </div>
            <div>
              <dt>OddsPapi este mes</dt>
              <dd>
                {datos.oddsPapi.gastadas ?? 0} de {TOPE_ODDSPAPI}
              </dd>
            </div>
            <div>
              <dt>Peticiones de esta ejecución</dt>
              <dd>
                OddsPapi {datos.peticiones.oddsPapi ?? 0} · football-data.org {datos.peticiones.footballData ?? 0}
              </dd>
            </div>
            <div>
              <dt>ClubElo</dt>
              <dd>{datos.clubEloResponde ? 'Responde' : 'No responde; se usa el Elo propio'}</dd>
            </div>
            <div>
              <dt>Última importación de jugadores</dt>
              <dd>{datos.ultimaImportacion ? fechaHora(datos.ultimaImportacion) : 'Ninguna'}</dd>
            </div>
          </dl>
          {datos.errores.length > 0 && (
            <ul className="aviso-error lista-errores" role="alert">
              {datos.errores.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {datos.avisos.length > 0 && (
            <ul className="avisos">
              {datos.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          {datos.errores.length === 0 && datos.avisos.length === 0 && <p className="texto-suave">Sin errores ni avisos.</p>}
        </>
      )}
    </section>
  );
}

export function AjustesModulo() {
  const uid = useSesion().usuario!.uid;
  const { estado, datos } = useAjustesPronosticos(uid);

  return (
    <div className="ajustes">
      <section className="ajustes__bloque" aria-labelledby="preferencias-titulo">
        <h2 id="preferencias-titulo">Preferencias del módulo</h2>
        {estado === 'error' && (
          <p className="aviso-error" role="alert">
            No se han podido cargar los ajustes.
          </p>
        )}
        {estado === 'cargando' && <div className="esqueleto__fila" role="status" aria-label="Cargando los ajustes" />}
        {estado === 'listo' && <Formulario inicial={datos} />}
      </section>
      <ImportarTabla />
      <EstadoEjecucion />
    </div>
  );
}
