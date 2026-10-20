const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Rondas de bcrypt: 10 es el equilibrio habitual entre seguridad y tiempo de respuesta
// (~80ms por hash). Cada rondas extra duplica el costo, asi que no se sube sin motivo.
const RONDAS = 10;

// En produccion JWT_SECRET debe venir del entorno. El secreto de desarrollo solo existe
// para que el proyecto arranque sin configurar nada, y avisa una vez para que no pase
// inadvertido: con un secreto conocido cualquiera podria firmar tokens validos.
let avisoSegreto = false;
function secreto() {
  const secretoAmbiente = process.env.JWT_SECRET;
  if (secretoAmbiente) return secretoAmbiente;
  if (!avisoSegreto) {
    console.warn('⚠️  JWT_SECRET no definido: se usa un secreto de desarrollo. Define una variable de entorno en produccion.');
    avisoSegreto = true;
  }
  return 'tabla-estadistica-dev-secret';
}

function hashearPassword(password) {
  return bcrypt.hash(password, RONDAS);
}

function verificarPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// El token vive 7 dias. El payload lleva el id en `sub` (convencion JWT) y el nombre de
// usuario solo para mostrarlo sin volver a consultar la base en cada peticion.
// `alcance` es opcional y marca tokens emitidos por el flujo de recuperacion de
// contrasena: dan sesion normal, pero ademas autorizan a restablecer la clave sin
// volver a pedirla (ver /api/auth/restablecer-password).
function crearToken(usuario, alcance = null) {
  const payload = { sub: usuario.id, usuario: usuario.usuario };
  if (alcance) payload.alcance = alcance;
  return jwt.sign(payload, secreto(), { expiresIn: '7d' });
}

function verificarToken(token) {
  return jwt.verify(token, secreto());
}

module.exports = { hashearPassword, verificarPassword, crearToken, verificarToken };
