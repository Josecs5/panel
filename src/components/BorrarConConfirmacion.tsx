import { useState } from 'react';

/** El borrado se confirma en la propia fila, sin abrir un diálogo. */
export function BorrarConConfirmacion({
  onBorrar,
  aviso,
}: {
  onBorrar: () => void;
  /** Consecuencia que conviene conocer antes de confirmar. */
  aviso?: string;
}) {
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button type="button" className="boton boton--secundario" onClick={() => setConfirmando(true)}>
        Borrar
      </button>
    );
  }
  return (
    <span className="confirmar" role="group" aria-label="Confirmar el borrado">
      {aviso && <span className="confirmar__aviso">{aviso}</span>}
      <button type="button" className="boton boton--peligro" onClick={onBorrar} autoFocus>
        Sí, borrar
      </button>
      <button type="button" className="boton boton--secundario" onClick={() => setConfirmando(false)}>
        Cancelar
      </button>
    </span>
  );
}
