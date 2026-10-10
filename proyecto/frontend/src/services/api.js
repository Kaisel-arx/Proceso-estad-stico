const API_URL = 'http://localhost:3001/api';
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
 */
async function pedir(ruta, { metodo = 'GET', cuerpo, sinToken = false } = {}) {
  const headers = {};
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';

  const token = sinToken ? null : obtenerToken();
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
