import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Cabecera } from '../components/Cabecera';
import type { Ajustes as TipoAjustes } from '../lib/ajustes';
import { leerCopia, resumirCopia, type Copia } from '../lib/copia';
import { exportarDatos, guardarAjustes, importarDatos, useAjustes } from '../lib/datos';
import { hoyEnMadrid, horaEnMadrid } from '../lib/fechas';
import { listaDesdeTexto } from '../lib/prompts';
import { useSesion } from '../lib/sesion';

export function Ajustes() {
  const uid = useSesion().usuario!.uid;
  const { estado, datos } = useAjustes(uid);

  return (
    <>
      <Cabecera titulo="Ajustes" />
      <div className="ajustes">
        <section aria-labelledby="ajustes-preferencias">
          <h2 id="ajustes-preferencias">Preferencias</h2>
          {estado === 'error' && (
            <p className="aviso-error" role="alert">
              No se han podido cargar tus ajustes. Comprueba tu conexión y recarga la página.
            </p>
          )}
          {estado === 'cargando' && (
            <p className="texto-suave" role="status">
              Cargando tus ajustes…
            </p>
          )}
          {estado === 'listo' && <FormularioAjustes uid={uid} inicial={datos} />}
        </section>
        <CopiaDeSeguridad uid={uid} />
      </div>
    </>
  );
}

const aNumero = (texto: string) => (texto.trim() === '' ? null : Number(texto));
const aTexto = (numero: number | null) => (numero === null ? '' : String(numero));

function FormularioAjustes({ uid, inicial }: { uid: string; inicial: TipoAjustes }) {
  const [finnhubKey, setFinnhubKey] = useState(inicial.finnhubKey);
  const [salario, setSalario] = useState(aTexto(inicial.salarioMinimo));
  const [aportacion, setAportacion] = useState(aTexto(inicial.aportacionPorFondo));
  const [dia, setDia] = useState(aTexto(inicial.diaCobro));
  const [municipios, setMunicipios] = useState(inicial.municipios.join(', '));
  const [areas, setAreas] = useState(inicial.areas.join(', '));
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ error: boolean; texto: string } | null>(null);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setResultado(null);
    try {
      await guardarAjustes(uid, {
        finnhubKey: finnhubKey.trim(),
        salarioMinimo: aNumero(salario),
        aportacionPorFondo: aNumero(aportacion) ?? 250,
        diaCobro: aNumero(dia),
        municipios: listaDesdeTexto(municipios),
        areas: listaDesdeTexto(areas),
      });
      setResultado({ error: false, texto: `Guardado a las ${horaEnMadrid()}.` });
    } catch {
      setResultado({ error: true, texto: 'No se han podido guardar. Vuelve a intentarlo.' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="formulario" onSubmit={guardar}>
      <label className="campo formulario__ancho">
        <span>Clave de Finnhub</span>
        <input
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          value={finnhubKey}
          onChange={(e) => setFinnhubKey(e.target.value)}
        />
        <small className="campo__ayuda">Solo se guarda en tu cuenta. Sin ella no hay precios en vivo.</small>
      </label>
      <label className="campo">
        <span>Salario mínimo (€)</span>
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={salario}
          onChange={(e) => setSalario(e.target.value)}
        />
      </label>
      <label className="campo">
        <span>Aportación por fondo (€)</span>
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          required
          value={aportacion}
          onChange={(e) => setAportacion(e.target.value)}
        />
      </label>
      <label className="campo">
        <span>Día habitual de cobro</span>
        <input
          type="number"
          min="1"
          max="31"
          step="1"
          inputMode="numeric"
          value={dia}
          onChange={(e) => setDia(e.target.value)}
        />
      </label>
      <label className="campo formulario__ancho">
        <span>Municipios de Vivienda</span>
        <input value={municipios} onChange={(e) => setMunicipios(e.target.value)} />
        <small className="campo__ayuda">Separados por comas. Se usan en el formulario y los filtros de Vivienda.</small>
      </label>
      <label className="campo formulario__ancho">
        <span>Áreas de Candidaturas</span>
        <input value={areas} onChange={(e) => setAreas(e.target.value)} />
        <small className="campo__ayuda">Separadas por comas. "Otro" siempre está disponible.</small>
      </label>
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

function descargarJson(contenido: unknown, nombre: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(contenido, null, 2)], { type: 'application/json' }),
  );
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

type Mensaje = { error: boolean; texto: string };

function CopiaDeSeguridad({ uid }: { uid: string }) {
  const [ocupado, setOcupado] = useState<'exportando' | 'importando' | null>(null);
  const [pendiente, setPendiente] = useState<Copia | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);

  async function exportar() {
    setOcupado('exportando');
    setMensaje(null);
    try {
      descargarJson(await exportarDatos(uid), `panel-copia-${hoyEnMadrid()}.json`);
      setMensaje({ error: false, texto: 'Copia descargada.' });
    } catch {
      setMensaje({ error: true, texto: 'No se ha podido crear la copia. Vuelve a intentarlo.' });
    } finally {
      setOcupado(null);
    }
  }

  async function elegirArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = ''; // Para poder volver a elegir el mismo archivo.
    if (!archivo) return;
    setMensaje(null);
    setPendiente(null);
    const resultado = leerCopia(await archivo.text());
    if (resultado.ok) setPendiente(resultado.copia);
    else setMensaje({ error: true, texto: resultado.error });
  }

  async function importar() {
    if (!pendiente) return;
    setOcupado('importando');
    setMensaje(null);
    try {
      await importarDatos(uid, pendiente);
      setMensaje({ error: false, texto: `Importado: ${resumirCopia(pendiente)}.` });
      setPendiente(null);
    } catch {
      setMensaje({ error: true, texto: 'No se ha podido importar. Vuelve a intentarlo.' });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section aria-labelledby="ajustes-copia">
      <h2 id="ajustes-copia">Copia de seguridad</h2>
      <p className="texto-suave ajustes__explicacion">
        La copia incluye todos tus datos y tu clave de Finnhub: guárdala en un sitio privado.
      </p>
      <div className="formulario__acciones">
        <button type="button" className="boton boton--principal" disabled={ocupado !== null} onClick={exportar}>
          {ocupado === 'exportando' ? 'Exportando…' : 'Exportar a JSON'}
        </button>
        <label className="boton boton--secundario boton--archivo">
          Importar JSON
          <input
            type="file"
            accept="application/json,.json"
            className="oculto"
            disabled={ocupado !== null}
            onChange={elegirArchivo}
          />
        </label>
      </div>
      {pendiente && (
        <div className="importar">
          <p>
            Vas a importar <strong>{resumirCopia(pendiente)}</strong>. Lo que tenga el mismo id se
            sustituye; no se borra nada más.
          </p>
          <div className="formulario__acciones">
            <button type="button" className="boton boton--principal" disabled={ocupado !== null} onClick={importar}>
              {ocupado === 'importando' ? 'Importando…' : 'Confirmar la importación'}
            </button>
            <button
              type="button"
              className="boton boton--secundario"
              disabled={ocupado !== null}
              onClick={() => setPendiente(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {mensaje && (
        <p className={mensaje.error ? 'aviso-error ajustes__mensaje' : 'texto-suave ajustes__mensaje'} role="status">
          {mensaje.texto}
        </p>
      )}
    </section>
  );
}
