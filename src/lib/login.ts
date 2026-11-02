/**
 * Convierte lo escrito en "Usuario" en el email que espera Firebase Auth.
 * Devuelve null si falta el dato necesario para formarlo.
 */
export function aEmailDeLogin(usuario: string, dominio: string | undefined): string | null {
  const limpio = usuario.trim();
  if (!limpio) return null;
  if (limpio.includes('@')) return limpio;
  const dominioLimpio = dominio?.trim();
  return dominioLimpio ? `${limpio}@${dominioLimpio}` : null;
}

/** Mensaje en español para cada error de inicio de sesión de Firebase. */
export function mensajeDeError(codigo: string | undefined): string {
  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Usuario o contraseña incorrectos. Revísalos y vuelve a intentarlo.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
    case 'auth/network-request-failed':
      return 'No hay conexión con el servidor. Comprueba tu red y vuelve a intentarlo.';
    case 'auth/user-disabled':
      return 'Esta cuenta está desactivada en Firebase.';
    default:
      return 'No se ha podido iniciar sesión. Vuelve a intentarlo dentro de un momento.';
  }
}
