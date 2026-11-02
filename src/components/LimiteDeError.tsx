import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };

/** Si una sección falla, el menú sigue funcionando y se puede cambiar de sección. */
export class LimiteDeError extends Component<Props, { fallo: boolean }> {
  state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <p className="aviso-error" role="alert">
        Algo ha fallado al mostrar esta sección. Recarga la página para volver a intentarlo.
      </p>
    );
  }
}
