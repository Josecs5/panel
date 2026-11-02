const FECHA = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  dateStyle: 'full',
});

export function SeccionPendiente({ nombre, fase }: { nombre: string; fase: number }) {
  return (
    <>
      <header className="pagina__cabecera">
        <h1>{nombre}</h1>
        <time className="texto-suave">{FECHA.format(new Date())}</time>
      </header>
      <p className="pagina__vacia">Esta sección se construye en la fase {fase}.</p>
    </>
  );
}
