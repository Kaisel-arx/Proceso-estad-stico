// URL base de la API: en produccion (Vercel) la define VITE_API_URL en el
// dashboard de variables de entorno apuntando al backend (Railway), p. ej.
// https://statlab-api.up.railway.app/api. En desarrollo local se usa el
// servidor de Vite como respaldo.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const CLAVE_TOKEN = 'token';

// Plazo maximo de cada peticion. El backend siempre responde (los envios de
// correo tienen timeouts propios), pero un corte de red o un servidor parado
// dejaria el boton en "Un momento..." para siempre: el AbortController corta la
// espera y el usuario recibe un mensaje en vez de una pantalla colgada.
const TIEMPO_MAXIMO_MS = 30_000;

// La sesion vive en localStorage: el token viaja en Authorization en cada peticion
// y sobrevive a recargar la pagina. No se guarda ningun dato sensible ahi, solo el JWT.
export function obtenerToken() {
  return localStorage.getItem(CLAVE_TOKEN);
}

export function guardarToken(token) {
  localStorage.setItem(CLAVE_TOKEN, token);
}

export function borrarToken() {
  localStorage.removeItem(CLAVE_TOKEN);
}

/**
 * Unica puerta a la API: agrega la cabecera de sesion, serializa el cuerpo y
 * convierte cualquier respuesta no-2xx en una excepcion con el mensaje del backend.
 * `token` permite usar una sesion que aun no se ha guardado (la verificacion del
 * codigo de recuperacion devuelve una sesion que se entrega en mano al contexto).
 */
async function pedir(ruta, { metodo = 'GET', cuerpo, sinToken = false, token: tokenExplicito } = {}) {
  const headers = {};
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';

  const token = tokenExplicito ?? (sinToken ? null : obtenerToken());
  if (token) headers.Authorization = `Bearer ${token}`;

  // Controlador de cancelacion: si la peticion no termina en TIEMPO_MAXIMO_MS
  // se aborta y se traduce el fallo a un mensaje accionable.
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

  let res;
  try {
    res = await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: controlador.signal,
    });
  } catch (err) {
    clearTimeout(temporizador);
    if (err.name === 'AbortError') {
      const error = new Error('La conexion tardo demasiado. Revisa tu red e intentalo de nuevo.');
      error.status = 0;
      throw error;
    }
    // Sin respuesta del servidor: no hay cuerpo que leer.
    const error = new Error('No se pudo conectar con el servidor. Intentalo de nuevo en unos minutos.');
    error.status = 0;
    throw error;
  }
  clearTimeout(temporizador);

  const datos = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(datos?.error || `Error ${res.status}`);
    error.status = res.status;
    // Flags del backend (cuentaCreada, pendienteVerificacion, yaVerificada...)
    // viajan en el cuerpo del error: las pantallas los usan para decidir a que
    // vista cambiar o que mensaje accionable mostrar.
    error.datos = datos;
    throw error;
  }
  return datos;
}

// --- Autenticacion ---

// Crea la cuenta y devuelve la sesion { token, usuario }: el alta es directa y
// quien se registra entra al panel sin pasos intermedios.
//
// Con el flujo de verificacion por codigo reactivado en el backend, el
// registro volveria a crear la cuenta 'pendiente' y a NO devolver token
// (entonces haria falta el paso de verificacion por correo).
export function registrar(datos) {
  return pedir('/auth/registro', { metodo: 'POST', cuerpo: datos, sinToken: true });
}

export function iniciarSesion(datos) {
  return pedir('/auth/login', { metodo: 'POST', cuerpo: datos, sinToken: true });
}

// --- Verificacion de cuenta (en pausa) ---
//
// Estas tres funciones quedan sin uso mientras el backend tenga desactivado el
// flujo por correo (VERIFICACION_POR_CORREO en backend/src/mailer.js): sus
// endpoints responden 404. Se conservan aqui, con los componentes VerificarCorreo
// y RecuperarContrasena, para poder reactivar el flujo sin reescribir nada.

// Verificacion de cuenta: con el codigo correcto la cuenta pasa a 'activo' y
// el backend devuelve la sesion para entrar al momento.
export function verificarCuenta(datos) {
  return pedir('/auth/verificar-cuenta', { metodo: 'POST', cuerpo: datos, sinToken: true });
}

// Emite un codigo de verificacion nuevo para una cuenta todavia pendiente.
export function reenviarVerificacion(email) {
  return pedir('/auth/reenviar-verificacion', { metodo: 'POST', cuerpo: { email }, sinToken: true });
}

// --- Recuperacion de contrasena (en pausa) ---

// Paso 1: pide que se envie el codigo al correo registrado.
export function solicitarCodigoRecuperacion(email) {
  return pedir('/auth/forgot-password', { metodo: 'POST', cuerpo: { email }, sinToken: true });
}

// Paso 2: valida el codigo, cambia la clave y devuelve la sesion { token, usuario }.
export function restablecerContrasena(datos) {
  return pedir('/auth/restablecer-password', { metodo: 'POST', cuerpo: datos, sinToken: true });
}

// Revalida el token guardado contra el servidor. Si expiro, tira 401 y el
// AuthContext limpia la sesion y vuelve a la pantalla de login.
export async function obtenerSesion() {
  const datos = await pedir('/auth/me');
  return datos.usuario;
}

// --- Lotes / historial ---

export function obtenerLotes() {
  return pedir('/lotes');
}

export function guardarLote(lote) {
  return pedir('/lotes', { metodo: 'POST', cuerpo: lote });
}

export function actualizarLote(id, lote) {
  return pedir(`/lotes/${id}`, { metodo: 'PUT', cuerpo: lote });
}

export function obtenerLotePorId(id) {
  return pedir(`/lotes/${id}`);
}

export function obtenerEstadisticos(loteId) {
  return pedir(`/lotes/${loteId}/stats`);
}

export function obtenerFrecuencias(loteId) {
  return pedir(`/lotes/${loteId}/frecuencias`);
}

export function eliminarLote(id) {
  return pedir(`/lotes/${id}`, { metodo: 'DELETE' });
}
