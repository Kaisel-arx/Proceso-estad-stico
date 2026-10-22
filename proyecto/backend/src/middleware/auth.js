const { verificarToken } = require('../auth');
const { obtener } = require('../db');

/**
 * Exige un token valido en la cabecera `Authorization: Bearer <token>`.
 * Si el token verifica, carga el usuario de MySQL (consulta async sobre el pool)
 * y lo deja en `req.usuario` para que los routers de abajo no tengan que repetirla.
 */
async function requerirAutenticacion(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const [esquema, token] = cabecera.split(' ');

  if (esquema !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Sesion requerida: falta el token de autenticacion' });
  }

  let payload;
  try {
    payload = verificarToken(token);
  } catch {
    return res.status(401).json({ error: 'Sesion invalida o expirada: vuelve a iniciar sesion' });
  }
  // El payload queda a mano para que un endpoint pueda exigir un alcance concreto
  // sin verificar el JWT otra vez.
  req.payload = payload;

  try {
    const usuario = await obtener('SELECT id, usuario, email FROM usuarios WHERE id = ?', [payload.sub]);
    if (!usuario) return res.status(401).json({ error: 'El usuario de esta sesion ya no existe' });
    req.usuario = usuario;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requerirAutenticacion };
