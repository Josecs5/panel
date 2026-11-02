import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BorrarConConfirmacion } from '../components/BorrarConConfirmacion';
import { Cabecera } from '../components/Cabecera';
import { borrarElemento, guardarElemento, useColeccion } from '../lib/datos';
import {
  aPrompt,
  filtrarPrompts,
  listaDesdeTexto,
  todasLasEtiquetas,
  type DatosPrompt,
  type Prompt,
} from '../lib/prompts';
import { useSesion } from '../lib/sesion';

const NUEVO = 'nuevo';
const VACIO: DatosPrompt = { titulo: '', herramienta: '', etiquetas: [], texto: '' };

function BotonCopiar({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<'inicial' | 'copiado' | 'error'>('inicial');
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado('copiado');
    } catch {
      setEstado('error');
    }
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setEstado('inicial'), 2500);
  }

  return (
    <button type="button" className="boton boton--principal boton--peq" onClick={copiar} aria-live="polite">
      {estado === 'inicial' && 'Copiar'}
      {estado === 'copiado' && 'Copiado'}
      {estado === 'error' && 'No se pudo copiar'}
    </button>
  );
}

function Formulario({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial: DatosPrompt;
  onGuardar: (datos: DatosPrompt) => void;
  onCancelar: () => void;
}) {
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [herramienta, setHerramienta] = useState(inicial.herramienta);
  const [etiquetas, setEtiquetas] = useState(inicial.etiquetas.join(', '));
  const [texto, setTexto] = useState(inicial.texto);

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    onGuardar({
      titulo: titulo.trim(),
      herramienta: herramienta.trim(),
      etiquetas: listaDesdeTexto(etiquetas),
      texto,
    });
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <label className="campo formulario__ancho">
        <span>Título</span>
        <input required autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </label>
      <label className="campo">
        <span>Herramienta</span>
        <input value={herramienta} onChange={(e) => setHerramienta(e.target.value)} />
      </label>
      <label className="campo">
        <span>Etiquetas</span>
        <input value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} />
        <small className="campo__ayuda">Separadas por comas.</small>
      </label>
      <label className="campo formulario__ancho">
        <span>Texto</span>
        <textarea required rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </label>
      <div className="formulario__acciones formulario__ancho">
        <button className="boton boton--principal">Guardar</button>
        <button type="button" className="boton boton--secundario" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Fila({
  prompt: p,
  onEditar,
  onBorrar,
}: {
  prompt: Prompt;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  return (
    <li className="prompt">
      <div className="prompt__cabecera">
        <div className="plazo__cuerpo">
          <p className="plazo__titulo">{p.titulo}</p>
          <p className="plazo__meta">
            {p.herramienta && <span>{p.herramienta}</span>}
            {p.etiquetas.map((e) => (
              <span key={e} className="prompt__etiqueta">
                {e}
              </span>
            ))}
          </p>
        </div>
        <div className="plazo__acciones">
          <BotonCopiar texto={p.texto} />
          <button
            type="button"
            className="boton boton--secundario"
            aria-label={`Editar ${p.titulo}`}
            onClick={onEditar}
          >
            Editar
          </button>
          <BorrarConConfirmacion onBorrar={onBorrar} />
        </div>
      </div>
      <details className="prompt__texto">
        <summary>{p.texto.split('\n')[0]}</summary>
        <p>{p.texto}</p>
      </details>
    </li>
  );
}

export function Prompts() {
  const uid = useSesion().usuario!.uid;
  const { estado, datos } = useColeccion(uid, 'prompts', aPrompt);
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [etiqueta, setEtiqueta] = useState<string | null>(null);

  const etiquetas = todasLasEtiquetas(datos);
  const visibles = filtrarPrompts(datos, busqueda, etiqueta);

  // Si se borra la última ficha con esa etiqueta, el filtro deja de tener sentido.
  useEffect(() => {
    if (estado === 'listo' && etiqueta && !etiquetas.includes(etiqueta)) setEtiqueta(null);
  }, [estado, etiqueta, etiquetas]);

  function guardar(prompt: DatosPrompt, id?: string) {
    setError(null);
    setEditando(null);
    guardarElemento(uid, 'prompts', prompt, id).catch(() =>
      setError('No se ha podido guardar el prompt. Vuelve a intentarlo.'),
    );
  }

  function borrar(id: string) {
    setError(null);
    borrarElemento(uid, 'prompts', id).catch(() =>
      setError('No se ha podido borrar el prompt. Vuelve a intentarlo.'),
    );
  }

  return (
    <>
      <Cabecera
        titulo="Prompts"
        accion={
          <button type="button" className="boton boton--principal" onClick={() => setEditando(NUEVO)}>
            Añadir prompt
          </button>
        }
      />

      {error && (
        <p className="aviso-error aviso-error--pagina" role="alert">
          {error}
        </p>
      )}
      {estado === 'error' && (
        <p className="aviso-error aviso-error--pagina" role="alert">
          No se han podido cargar los prompts. Comprueba tu conexión y recarga la página.
        </p>
      )}

      {editando === NUEVO && (
        <div className="plazo-formulario plazo-formulario--alta">
          <Formulario inicial={VACIO} onGuardar={(d) => guardar(d)} onCancelar={() => setEditando(null)} />
        </div>
      )}

      {datos.length > 0 && (
        <div className="filtros filtros--prompts">
          <label className="campo campo--enLinea filtros__busqueda">
            <span>Buscar</span>
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </label>
          {etiquetas.length > 0 && (
            <div className="etiquetas" role="group" aria-label="Filtrar por etiqueta">
              <button
                type="button"
                className="etiqueta"
                aria-pressed={etiqueta === null}
                onClick={() => setEtiqueta(null)}
              >
                Todas
              </button>
              {etiquetas.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="etiqueta"
                  aria-pressed={etiqueta === e}
                  onClick={() => setEtiqueta(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {estado === 'cargando' && (
        <div className="esqueleto" role="status" aria-label="Cargando los prompts">
          <div className="esqueleto__fila" />
          <div className="esqueleto__fila" />
        </div>
      )}
      {estado === 'listo' && datos.length === 0 && (
        <p className="vacio">Todavía no hay prompts. Guarda el primero con el botón de arriba.</p>
      )}
      {datos.length > 0 && visibles.length === 0 && (
        <p className="vacio">Ningún prompt coincide con la búsqueda.</p>
      )}

      {visibles.length > 0 && (
        <ul className="lista-plazos">
          {visibles.map((p) =>
            editando === p.id ? (
              <li key={p.id} className="plazo-formulario">
                <Formulario inicial={p} onGuardar={(d) => guardar(d, p.id)} onCancelar={() => setEditando(null)} />
              </li>
            ) : (
              <Fila key={p.id} prompt={p} onEditar={() => setEditando(p.id)} onBorrar={() => borrar(p.id)} />
            ),
          )}
        </ul>
      )}
    </>
  );
}
