import { Cabecera } from '../components/Cabecera';

export function SeccionPendiente({ nombre, fase }: { nombre: string; fase: number }) {
  return (
    <>
      <Cabecera titulo={nombre} />
      <p className="vacio">Esta sección se construye en la fase {fase}.</p>
    </>
  );
}
