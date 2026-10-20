// URL base de la API: en produccion (Vercel) la define VITE_API_URL en el
// dashboard de variables de entorno apuntando al backend (Railway), p. ej.
// https://statlab-api.up.railway.app/api. En desarrollo local se usa el
// servidor de Vite como respaldo.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const CLAVE_TOKEN = 'token';

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

  const res = await fetch(`${API_URL}${ruta}`, {
    method: metodo,
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });

  const datos = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(datos?.error || `Error ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return datos;
}

// --- Autenticacion ---

export function registrar(datos) {
  return pedir('/auth/registro', { metodo: 'POST', cuerpo: datos, sinToken: true });
}

export function iniciarSesion(datos) {
  return pedir('/auth/login', { metodo: 'POST', cuerpo: datos, sinToken: true });
}

// --- Recuperacion de contrasena ---

// Paso 1: pide que se envie el codigo al correo registrado.
export function solicitarCodigoRecuperacion(email) {
  return pedir('/auth/forgot-password', { metodo: 'POST', cuerpo: { email }, sinToken: true });
}

// Paso 2: valida el codigo y devuelve la sesion completa { token, usuario }.
export function verificarCodigoRecuperacion(datos) {
  return pedir('/auth/verify-code', { metodo: 'POST', cuerpo: datos, sinToken: true });
}

// Paso 3 (opcional): cambia la clave con la sesion que acaba de entregar el codigo
// y devuelve otra sesion nueva, ya sin el alcance de recuperacion.
export function restablecerContrasena(password, token) {
  return pedir('/auth/restablecer-password', { metodo: 'POST', cuerpo: { password }, token });
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
