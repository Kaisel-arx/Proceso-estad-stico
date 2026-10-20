const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { obtener, ejecutar } = require('../db');
const { hashearPassword, verificarPassword, crearToken } = require('../auth');
const { enviarCodigoRecuperacion } = require('../mailer');
const { requerirAutenticacion } = require('../middleware/auth');

// Reglas de creacion de cuenta. Se validan aqui y no solo en el frontend porque el
// backend es la unica fuente de verdad: cualquier cliente puede llamar a la API.
const USUARIO_RE = /^[a-zA-Z0-9._-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MINIMO = 6;

function validarRegistro({ usuario, email, password }) {
  if (typeof usuario !== 'string' || !USUARIO_RE.test(usuario.trim())) {
    return 'El usuario debe tener de 3 a 30 caracteres: letras, numeros, punto, guion o guion bajo';
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return 'El correo electronico no tiene un formato valido';
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MINIMO) {
    return `La contrasena debe tener al menos ${PASSWORD_MINIMO} caracteres`;
  }
  return null;
}

// Envuelve handlers async: Express 4 no captura las promesas rechazadas y sin esto un
// error inesperado dejaria la peticion colgada en vez de responder con 500.
const envolver = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function responderSesion(res, usuario, status = 200, alcance = null) {
  const { id, usuario: nombre, email } = usuario;
  res.status(status).json({
    token: crearToken(usuario, alcance),
    usuario: { id, usuario: nombre, email },
  });
}

// POST /api/auth/registro -> crea la cuenta y devuelve el token listo para usar
router.post(
  '/registro',
  envolver(async (req, res) => {
    const { usuario, email, password } = req.body || {};

    const error = validarRegistro({ usuario, email, password });
    if (error) return res.status(400).json({ error });

    const nombre = usuario.trim();
    const correo = email.trim().toLowerCase();

    const existente = await obtener(
      'SELECT usuario, email FROM usuarios WHERE usuario = ? OR email = ?',
      [nombre, correo]
    );

    if (existente) {
      const campo = existente.usuario === nombre ? 'usuario' : 'correo electronico';
      return res.status(409).json({ error: `Ese ${campo} ya esta registrado` });
    }

    const hash = await hashearPassword(password);

    let id;
    try {
      const creado = await ejecutar(
        'INSERT INTO usuarios (usuario, email, password_hash) VALUES (?, ?, ?)',
        [nombre, correo, hash]
      );
      id = creado.insertId;
    } catch (err) {
      // Carrera entre la comprobacion de arriba y el INSERT: las claves unicas de
      // MySQL (uq_usuarios_usuario / uq_usuarios_email) cierran el hueco y ahi se
      // responde 409 igual que en el caso normal.
      if (err.errno === 1062) {
        const campo = /uq_usuarios_usuario/.test(err.message) ? 'usuario' : 'correo electronico';
        return res.status(409).json({ error: `Ese ${campo} ya esta registrado` });
      }
      throw err;
    }

    responderSesion(res, { id, usuario: nombre, email: correo }, 201);
  })
);

// POST /api/auth/login -> acepta usuario o correo en un solo campo
router.post(
  '/login',
  envolver(async (req, res) => {
    const { identificador, password } = req.body || {};

    if (typeof identificador !== 'string' || typeof password !== 'string' || !identificador.trim()) {
      return res.status(400).json({ error: 'Indica tu usuario o correo y tu contrasena' });
    }

    const valor = identificador.trim();
    const fila = await obtener('SELECT * FROM usuarios WHERE usuario = ? OR email = ?', [
      valor,
      valor.toLowerCase(),
    ]);

    // Mensaje unico para "no existe" y para "contrasena incorrecta": distinguirlos
    // permitiria comprobar que cuentas existen sin autenticarse.
    const valido = fila && (await verificarPassword(password, fila.password_hash));
    if (!valido) {
      return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
    }

    responderSesion(res, fila);
  })
);

// GET /api/auth/me -> revalida el token y devuelve la sesion vigente
router.get('/me', requerirAutenticacion, (req, res) => {
  res.json({ usuario: req.usuario });
});

// ---------------------------------------------------------------------------
// Recuperacion de contrasena
//
// Flujo: /forgot-password manda un codigo de 6 digitos al correo registrado,
// /verify-code lo comprueba (un solo uso, caduca en 10 minutos) y devuelve la
// sesion, y /restablecer-password, opcional, cambia la clave con esa sesion.
//
// En la base solo se guarda el SHA-256 del codigo: si la tabla se filtra no se
// puede recuperar el codigo a partir del hash. El endpoint distingue 404
// (correo no registrado) de 500 (fallo del servidor de correo) para que la
// interfaz pueda mostrar un mensaje accionable en cada caso. Nota de seguridad:
// el 404 permite averiguar que correos estan registrados; en un despliegue
// publico convendria volver a la respuesta unica "Si existe una cuenta...".
// ---------------------------------------------------------------------------

const DIGITOS = 6;
const TTL_MINUTOS = 10;
const ESPERA_REENVIO_MS = 60_000;
const MAX_INTENTOS = 5;

// Un codigo malo solo se puede probar 5 veces, y entre envios al mismo correo
// tiene que pasar un minuto. Es estado en memoria: si el proyecto se escala a
// varios procesos tocaria moverlo a Redis o a la propia base.
const limites = new Map();

function limiteDe(correo) {
  let limite = limites.get(correo);
  if (!limite) {
    limite = { ultimoEnvio: 0, intentos: 0 };
    limites.set(correo, limite);
  }
  return limite;
}

// El Map solo crece: cada 15 minutos se tiran las entradas sin actividad en la
// ultima hora. .unref() evita que el temporizador mantenga vivo el proceso.
setInterval(() => {
  const corte = Date.now() - 60 * 60_000;
  for (const [correo, limite] of limites) {
    if (limite.ultimoEnvio < corte) limites.delete(correo);
  }
}, 15 * 60_000).unref();

// crypto.randomInt es uniforme en todo el rango, sin el sesgo de Math.random() % n.
function generarCodigo() {
  return String(crypto.randomInt(0, 10 ** DIGITOS)).padStart(DIGITOS, '0');
}

function hashearCodigo(codigo) {
  return crypto.createHash('sha256').update(codigo).digest('hex');
}

// Comparacion en tiempo constante: sin ella, medir la respuesta byte a byte
// permitiria ir adivinando el hash almacenado.
function coincideHash(codigo, hashGuardado) {
  const a = Buffer.from(codigo, 'utf8');
  const b = Buffer.from(String(hashGuardado), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// dateStrings + timezone 'Z' devuelven el DATETIME como "YYYY-MM-DD HH:MM:SS" en
// UTC, la misma forma en la que aqui se escribio, asi que basta con parsearlo.
function expiradoEn(valor) {
  const ms = Date.parse(String(valor).replace(' ', 'T') + 'Z');
  return Number.isNaN(ms) || ms <= Date.now();
}

const MENSAJE_RECUPERACION =
  'Si existe una cuenta con ese correo, recibiras un codigo de verificacion en unos minutos.';

// POST /api/auth/forgot-password -> genera el codigo y lo manda al correo
router.post(
  '/forgot-password',
  envolver(async (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Introduce un correo electronico valido' });
    }
    const correo = email.trim().toLowerCase();

    const limite = limiteDe(correo);
    // El limite de reenvio solo se consume cuando hay cuenta y se va a intentar
    // un envio: un correo inexistente (404) o un error del SMTP no deben dejar
    // al usuario esperando un minuto sin haber recibido nada.
    if (Date.now() - limite.ultimoEnvio < ESPERA_REENVIO_MS) {
      return res.status(429).json({ error: 'Espera un minuto antes de pedir otro codigo' });
    }

    const fila = await obtener('SELECT id FROM usuarios WHERE email = ?', [correo]);
    if (!fila) {
      return res
        .status(404)
        .json({ error: 'Este correo no esta registrado. Revisa la direccion o crea una cuenta.' });
    }

    limite.ultimoEnvio = Date.now();
    limite.intentos = 0;

    const codigo = generarCodigo();
    // Date siempre en UTC: la columna DATETIME y la lectura de expiradoEn() usan
    // la misma referencia, asi que el calculo no depende de la zona del servidor.
    const caduca = new Date(Date.now() + TTL_MINUTOS * 60_000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    await ejecutar('UPDATE usuarios SET reset_token = ?, token_expiration = ? WHERE id = ?', [
      hashearCodigo(codigo),
      caduca,
      fila.id,
    ]);

    try {
      await enviarCodigoRecuperacion(correo, codigo);
    } catch (err) {
      // El detalle exacto (mensaje, codigo y respuesta SMTP) ya lo imprimio
      // enviarCodigoRecuperacion en la consola del servidor; aqui solo se
      // traduce el fallo a un mensaje accionable para el cliente y se limpia
      // el codigo para que no quede un token vivo sin enviar. El 500 solo se
      // emite si el envio falla y no congela la peticion: los timeouts del
      // transporte (mailer.js) garantizan que sendMail siempre termina.
      await ejecutar('UPDATE usuarios SET reset_token = NULL, token_expiration = NULL WHERE id = ?', [
        fila.id,
      ]);

      let mensajeCliente = 'No se pudo enviar el codigo. Verifica tu correo o intentalo mas tarde.';
      if (err.code === 'EAUTH') {
        mensajeCliente =
          'El servidor de correo rechazo las credenciales. El administrador debe revisar la configuracion SMTP.';
      } else if (err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
        mensajeCliente = 'No se pudo conectar con el servidor de correo. Intentalo de nuevo en unos minutos.';
      }
      return res.status(500).json({ error: mensajeCliente });
    }

    res.json({ mensaje: MENSAJE_RECUPERACION, expiraEnMinutos: TTL_MINUTOS });
  })
);

// POST /api/auth/verify-code -> valida el codigo y abre sesion
router.post(
  '/verify-code',
  envolver(async (req, res) => {
    const { email, codigo } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Introduce un correo electronico valido' });
    }
    const correo = email.trim().toLowerCase();
    const intento = String(codigo ?? '').trim();
    if (!new RegExp(`^\\d{${DIGITOS}}$`).test(intento)) {
      return res.status(400).json({ error: `El codigo debe tener ${DIGITOS} digitos` });
    }

    const limite = limiteDe(correo);
    if (limite.intentos >= MAX_INTENTOS) {
      return res
        .status(429)
        .json({ error: 'Demasiados intentos fallidos: pide un codigo nuevo' });
    }

    const fila = await obtener('SELECT * FROM usuarios WHERE email = ?', [correo]);
    const guardado = fila && fila.reset_token && fila.token_expiration ? fila : null;
    // En la base esta el SHA-256 del codigo, asi que se hashea tambien el intento
    // antes de comparar.
    const coincide = guardado && coincideHash(hashearCodigo(intento), guardado.reset_token);
    const vigente = coincide && !expiradoEn(guardado.token_expiration);

    if (!vigente) {
      // Fallar cuesta un intento exista o no la cuenta: la respuesta tiene que
      // ser identica en los dos casos para no revelar correos registrados.
      limite.intentos += 1;
      if (coincide) {
        return res.status(400).json({ error: 'El codigo ha caducado: pide uno nuevo' });
      }
      return res.status(400).json({ error: 'Codigo incorrecto o caducado' });
    }

    // Un solo uso: consumido el codigo se borra antes de abrir la sesion.
    limite.intentos = 0;
    await ejecutar('UPDATE usuarios SET reset_token = NULL, token_expiration = NULL WHERE id = ?', [
      fila.id,
    ]);

    // El alcance 'recuperacion' es lo unico que autoriza a cambiar la clave sin
    // pedir la actual en el paso siguiente.
    responderSesion(res, fila, 200, 'recuperacion');
  })
);

// POST /api/auth/restablecer-password -> cambia la clave con la sesion de recuperacion
router.post(
  '/restablecer-password',
  requerirAutenticacion,
  envolver(async (req, res) => {
    if (!req.payload || req.payload.alcance !== 'recuperacion') {
      return res
        .status(403)
        .json({ error: 'Este paso solo esta disponible desde el flujo de recuperacion de contrasena' });
    }

    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length < PASSWORD_MINIMO) {
      return res
        .status(400)
        .json({ error: `La contrasena debe tener al menos ${PASSWORD_MINIMO} caracteres` });
    }

    const hash = await hashearPassword(password);
    await ejecutar(
      'UPDATE usuarios SET password_hash = ?, reset_token = NULL, token_expiration = NULL WHERE id = ?',
      [hash, req.usuario.id]
    );

    const fila = await obtener('SELECT * FROM usuarios WHERE id = ?', [req.usuario.id]);
    // Sesion nueva sin alcance: la clave ya no esta en manos de quien tuviera el
    // token de recuperacion y el siguiente JWT no vuelve a autorizar este cambio.
    responderSesion(res, fila);
  })
);

module.exports = router;
