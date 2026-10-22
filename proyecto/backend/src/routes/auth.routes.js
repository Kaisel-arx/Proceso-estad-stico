const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { obtener, ejecutar } = require('../db');
const { hashearPassword, verificarPassword, crearToken } = require('../auth');
const { enviarCodigo, VERIFICACION_POR_CORREO } = require('../mailer');
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

// Corta los endpoints del flujo por correo cuando esta desactivado. Se responde 404
// (y no 500) porque no es un fallo del servidor: la funcionalidad no existe en esta
// version. El codigo de cada ruta queda intacto para poder reactivarlo cambiando
// VERIFICACION_POR_CORREO en src/mailer.js.
function exigirFlujoPorCorreo(req, res, next) {
  if (VERIFICACION_POR_CORREO) return next();
  return res.status(404).json({
    error: 'La verificacion por codigo esta desactivada en esta version',
    requiereVerificacion: false,
  });
}

function responderSesion(res, usuario, status = 200) {
  const { id, usuario: nombre, email } = usuario;
  res.status(status).json({
    token: crearToken(usuario),
    usuario: { id, usuario: nombre, email },
  });
}

// ---------------------------------------------------------------------------
// Utilidades de codigo de verificacion / recuperacion (6 digitos)
//
// Ambos flujos comparten mecanica: codigo aleatorio uniforme, en la base solo
// su SHA-256, caducidad en expiracion_codigo, maximo de intentos y espera
// entre envios. El alta de cuenta usa codigo_verificacion y la recuperacion
// codigo_recuperacion; expiracion_codigo es unica y caduca al ultimo emitido
// (en la practica solo un flujo esta en vuelo por usuario).
// ---------------------------------------------------------------------------

const DIGITOS = 6;
const TTL_MINUTOS = 15; // dentro del rango 15-30 pedido para los codigos
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

function caducaEn(minutos) {
  return new Date(Date.now() + minutos * 60_000).toISOString().slice(0, 19).replace('T', ' ');
}

function esCodigoDe6Digitos(valor) {
  return new RegExp(`^\\d{${DIGITOS}}$`).test(String(valor ?? '').trim());
}

// Mensaje de fallo SMTP traducido a algo que el usuario final pueda entender.
// El detalle exacto (codigo y respuesta del servidor) ya lo imprime enviarCodigo
// en la consola del servidor.
function mensajeErrorCorreo(err) {
  if (err.code === 'EAUTH') {
    return 'El servidor de correo rechazo las credenciales. El administrador debe revisar la configuracion SMTP.';
  }
  if (err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
    return 'No se pudo conectar con el servidor de correo. Intentalo de nuevo en unos minutos.';
  }
  return 'No se pudo enviar el codigo. Verifica tu correo o intentalo mas tarde.';
}

const CODIGO_ENVIADO = (correo) =>
  `Hemos enviado un codigo de ${DIGITOS} digitos a ${correo}. Caduca en ${TTL_MINUTOS} minutos.`;

const MENSAJE_PENDIENTE =
  'Tu cuenta aun no esta verificada. Revisa tu correo e ingresa el codigo de verificacion.';

// ---------------------------------------------------------------------------
// Registro de usuarios y confirmacion por correo
//
// El interruptor VERIFICACION_POR_CORREO (definido en src/mailer.js) decide
// que flujo aplica:
//
//   false (actual) -> el alta crea la cuenta 'activo' y devuelve la sesion
//                     (token JWT) de inmediato. No hay codigo, no hay SMTP y el
//                     frontend entra al panel sin pasos intermedios.
//   true           -> el alta crea la cuenta 'pendiente' y manda un codigo de
//                     6 digitos por correo; POST /verificar-cuenta la activa.
//
// Con el flujo por correo activo, la respuesta del registro nunca trae token:
// hasta verificar el correo nadie puede iniciar sesion. Si el envio SMTP falla
// la cuenta se queda pendiente con su codigo guardado y se responde 500 con
// `cuentaCreada: true` para que la interfaz lleve al usuario a la pantalla de
// verificacion (donde puede reenviar) en vez de mostrar un error que haga
// pensar que el alta fallo.
// ---------------------------------------------------------------------------

router.post(
  '/registro',
  envolver(async (req, res) => {
    const { usuario, email, password } = req.body || {};

    const error = validarRegistro({ usuario, email, password });
    if (error) return res.status(400).json({ error });

    const nombre = usuario.trim();
    const correo = email.trim().toLowerCase();

    const existente = await obtener(
      'SELECT usuario, email, estado_cuenta FROM usuarios WHERE usuario = ? OR email = ?',
      [nombre, correo]
    );

    if (existente) {
      const campo = existente.usuario === nombre ? 'usuario' : 'correo electronico';
      // La cuenta existe pero nunca se verifico: el problema no es el registro
      // sino el codigo que nunca llego. Un 409 seco dejaria al usuario atascado
      // sin forma de seguir, asi que se devuelve el mismo aviso que usa el
      // login para llevar a la pantalla de verificacion (donde puede reenviar).
      // Sin verificacion por correo no hay codigo que reenviar: la cuenta
      // pendiente (de un alta anterior con el flujo viejo) se activa al entrar.
      if (VERIFICACION_POR_CORREO && existente.estado_cuenta === 'pendiente' && existente.email === correo) {
        return res.status(409).json({
          error:
            'Esa cuenta ya esta creada pero aun no esta verificada. Revisa tu correo e ingresa ' +
            'el codigo de 6 digitos, o pide un reenvio.',
          pendienteVerificacion: true,
          email: existente.email,
        });
      }
      return res.status(409).json({ error: `Ese ${campo} ya esta registrado` });
    }

    const hash = await hashearPassword(password);

    // --- Alta directa: la cuenta nace activa y se abre sesion al momento ---
    if (!VERIFICACION_POR_CORREO) {
      try {
        await ejecutar(
          `INSERT INTO usuarios (usuario, email, password_hash, estado_cuenta)
           VALUES (?, ?, ?, 'activo')`,
          [nombre, correo, hash]
        );
      } catch (err) {
        // Carrera entre la comprobacion de arriba y el INSERT: las claves unicas
        // de MySQL cierran el hueco y se responde 409 igual que en el caso normal.
        if (err.errno === 1062) {
          const campo = /uq_usuarios_usuario/.test(err.message) ? 'usuario' : 'correo electronico';
          return res.status(409).json({ error: `Ese ${campo} ya esta registrado` });
        }
        throw err;
      }

      const cuenta = await obtener('SELECT id, usuario, email FROM usuarios WHERE email = ?', [correo]);
      return responderSesion(res, cuenta, 201);
    }

    // --- Alta con codigo de verificacion por correo ---
    const codigo = generarCodigo();

    try {
      await ejecutar(
        `INSERT INTO usuarios
           (usuario, email, password_hash, estado_cuenta, codigo_verificacion, expiracion_codigo)
         VALUES (?, ?, ?, 'pendiente', ?, ?)`,
        [nombre, correo, hash, hashearCodigo(codigo), caducaEn(TTL_MINUTOS)]
      );
    } catch (err) {
      if (err.errno === 1062) {
        const campo = /uq_usuarios_usuario/.test(err.message) ? 'usuario' : 'correo electronico';
        return res.status(409).json({ error: `Ese ${campo} ya esta registrado` });
      }
      throw err;
    }

    let envio;
    try {
      envio = await enviarCodigo(correo, codigo, 'verificacion', TTL_MINUTOS);
    } catch (err) {
      // La cuenta y su codigo (hash) ya quedaron guardados: un reenvio desde la
      // pantalla de verificacion genera uno nuevo. cuentaCreada le dice al
      // frontend que no debe ofrecer "crear cuenta" de nuevo.
      return res.status(500).json({ error: mensajeErrorCorreo(err), cuentaCreada: true });
    }

    res.status(201).json({
      mensaje: `Cuenta creada. ${CODIGO_ENVIADO(correo)}`,
      email: correo,
      requiereVerificacion: true,
      expiraEnMinutos: TTL_MINUTOS,
      // 'consola' = no hay SMTP configurado y el codigo quedo impreso en el log
      // del servidor. El frontend lo muestra como aviso de modo desarrollo.
      modo: envio.modo,
    });
  })
);

router.post(
  '/verificar-cuenta',
  exigirFlujoPorCorreo,
  envolver(async (req, res) => {
    const { email, codigo } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Introduce un correo electronico valido' });
    }
    const correo = email.trim().toLowerCase();
    if (!esCodigoDe6Digitos(codigo)) {
      return res.status(400).json({ error: `El codigo debe tener ${DIGITOS} digitos` });
    }
    const intento = String(codigo).trim();

    const limite = limiteDe(correo);
    if (limite.intentos >= MAX_INTENTOS) {
      return res
        .status(429)
        .json({ error: 'Demasiados intentos fallidos: pide un codigo nuevo' });
    }

    const fila = await obtener('SELECT * FROM usuarios WHERE email = ?', [correo]);

    // Respuesta identica con y sin cuenta para no revelar correos registrados.
    if (!fila) {
      limite.intentos += 1;
      return res.status(400).json({ error: 'Codigo incorrecto o caducado' });
    }

    // Ya activa (doble clic, codigo usado en otra pestaña...): aviso accionable,
    // no un error generico, para que la interfaz ofrezca volver al login.
    if (fila.estado_cuenta === 'activo') {
      return res.status(400).json({
        error: 'Tu cuenta ya esta verificada: ya puedes iniciar sesion.',
        yaVerificada: true,
      });
    }

    // En la base esta el SHA-256 del codigo, asi que se hashea tambien el intento.
    const guardado = fila.codigo_verificacion && fila.expiracion_codigo ? fila : null;
    const coincide = guardado && coincideHash(hashearCodigo(intento), guardado.codigo_verificacion);
    const vigente = coincide && !expiradoEn(guardado.expiracion_codigo);

    if (!vigente) {
      // Fallar cuesta un intento: el mensaje distingue "caducado" de "malo"
      // solo cuando el hash si coincide, para no filtrar informacion util.
      limite.intentos += 1;
      if (coincide) {
        return res.status(400).json({ error: 'El codigo ha caducado: pide uno nuevo' });
      }
      return res.status(400).json({ error: 'Codigo incorrecto o caducado' });
    }

    // Un solo uso: activa la cuenta y borra el codigo. expiracion_codigo solo
    // se limpia si ademas no hay un codigo de recuperacion pendiente (comparte
    // la columna).
    limite.intentos = 0;
    await ejecutar(
      `UPDATE usuarios
          SET estado_cuenta = 'activo',
              codigo_verificacion = NULL,
              expiracion_codigo = IF(codigo_recuperacion IS NULL, NULL, expiracion_codigo)
        WHERE id = ?`,
      [fila.id]
    );

    // La cuenta ya es 'activo': la sesion devuelta sirve para entrar al momento.
    responderSesion(res, fila);
  })
);

router.post(
  '/reenviar-verificacion',
  exigirFlujoPorCorreo,
  envolver(async (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Introduce un correo electronico valido' });
    }
    const correo = email.trim().toLowerCase();

    const limite = limiteDe(correo);
    if (Date.now() - limite.ultimoEnvio < ESPERA_REENVIO_MS) {
      return res.status(429).json({ error: 'Espera un minuto antes de pedir otro codigo' });
    }

    const fila = await obtener('SELECT id, estado_cuenta FROM usuarios WHERE email = ?', [correo]);
    if (!fila) {
      return res
        .status(404)
        .json({ error: 'Este correo no esta registrado. Revisa la direccion o crea una cuenta.' });
    }
    if (fila.estado_cuenta === 'activo') {
      return res.status(400).json({
        error: 'Tu cuenta ya esta verificada: ya puedes iniciar sesion.',
        yaVerificada: true,
      });
    }

    limite.ultimoEnvio = Date.now();
    limite.intentos = 0;

    const codigo = generarCodigo();
    await ejecutar('UPDATE usuarios SET codigo_verificacion = ?, expiracion_codigo = ? WHERE id = ?', [
      hashearCodigo(codigo),
      caducaEn(TTL_MINUTOS),
      fila.id,
    ]);

    let envio;
    try {
      envio = await enviarCodigo(correo, codigo, 'verificacion', TTL_MINUTOS);
    } catch (err) {
      // El codigo nuevo (hash) queda guardado aunque el correo falle: un nuevo
      // reenvio lo reemplaza. Solo se informa del fallo con mensaje claro.
      return res.status(500).json({ error: mensajeErrorCorreo(err) });
    }

    res.json({
      mensaje: CODIGO_ENVIADO(correo),
      expiraEnMinutos: TTL_MINUTOS,
      modo: envio.modo,
    });
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

    // Solo despues de validar la clave: sin password correcto nadie se entera
    // de que la cuenta esta pendiente. `email` viene solo en esta respuesta
    // (quien sabe la clave ya conocia la direccion) para que el frontend abra
    // la pantalla de verificacion con el correo precargado.
    //
    // Sin verificacion por correo no hay estado pendiente que bloquear: una
    // cuenta creada con el flujo antiguo (quedo 'pendiente' esperando un codigo
    // que nunca llego) se activa aqui y entra con normalidad.
    if (fila.estado_cuenta === 'pendiente') {
      if (!VERIFICACION_POR_CORREO) {
        await ejecutar("UPDATE usuarios SET estado_cuenta = 'activo' WHERE id = ?", [fila.id]);
        fila.estado_cuenta = 'activo';
      } else {
        return res.status(403).json({
          error: MENSAJE_PENDIENTE,
          pendienteVerificacion: true,
          email: fila.email,
        });
      }
    }

    responderSesion(res, fila);
  })
);

// GET /api/auth/me -> revalida el token y devuelve la sesion vigente
router.get('/me', requerirAutenticacion, (req, res) => {
  res.json({ usuario: req.usuario });
});

// ---------------------------------------------------------------------------
// Recuperacion de contrasena ("¿Has olvidado tu contraseña?")
//
// Flujo en dos pasos:
//   1. /forgot-password  manda un codigo de 6 digitos al correo registrado.
//   2. /restablecer-password  { email, codigo, password } valida el codigo,
//      cambia la clave y limpia el codigo usado; devuelve la sesion.
//
// En la base solo se guarda el SHA-256 del codigo: si la tabla se filtra no se
// puede recuperar el codigo a partir del hash. El endpoint distingue 404
// (correo no registrado) de 500 (fallo del servidor de correo) para que la
// interfaz pueda mostrar un mensaje accionable en cada caso. Nota de seguridad:
// el 404 permite averiguar que correos estan registrados; en un despliegue
// publico convendria volver a la respuesta unica "Si existe una cuenta...".
// ---------------------------------------------------------------------------

router.post(
  '/forgot-password',
  exigirFlujoPorCorreo,
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

    const fila = await obtener('SELECT id, estado_cuenta FROM usuarios WHERE email = ?', [correo]);
    if (!fila) {
      return res
        .status(404)
        .json({ error: 'Este correo no esta registrado. Revisa la direccion o crea una cuenta.' });
    }

    // Cuenta pendiente: lo que necesita es verificar, no recuperar la clave.
    if (fila.estado_cuenta === 'pendiente') {
      return res.status(400).json({
        error: MENSAJE_PENDIENTE,
        pendienteVerificacion: true,
        email: correo,
      });
    }

    limite.ultimoEnvio = Date.now();
    limite.intentos = 0;

    const codigo = generarCodigo();
    // Date siempre en UTC: la columna DATETIME y la lectura de expiradoEn() usan
    // la misma referencia, asi que el calculo no depende de la zona del servidor.
    await ejecutar('UPDATE usuarios SET codigo_recuperacion = ?, expiracion_codigo = ? WHERE id = ?', [
      hashearCodigo(codigo),
      caducaEn(TTL_MINUTOS),
      fila.id,
    ]);

    let envio;
    try {
      envio = await enviarCodigo(correo, codigo, 'recuperacion', TTL_MINUTOS);
    } catch (err) {
      // El detalle exacto (mensaje, codigo y respuesta SMTP) ya lo imprime
      // enviarCodigo en la consola del servidor; aqui solo se traduce el fallo a
      // un mensaje accionable para el cliente y se limpia el codigo para que no
      // quede un token vivo sin enviar. El 500 solo se emite si el envio falla y
      // no congela la peticion: los timeouts del transporte (mailer.js)
      // garantizan que sendMail siempre termina. codigo_verificacion no se toca
      // por si hay ademas un alta de cuenta pendiente.
      await ejecutar('UPDATE usuarios SET codigo_recuperacion = NULL WHERE id = ?', [fila.id]);

      return res.status(500).json({ error: mensajeErrorCorreo(err) });
    }

    res.json({
      mensaje: CODIGO_ENVIADO(correo),
      expiraEnMinutos: TTL_MINUTOS,
      modo: envio.modo,
    });
  })
);

// POST /api/auth/restablecer-password -> { email, codigo, password }
router.post(
  '/restablecer-password',
  exigirFlujoPorCorreo,
  envolver(async (req, res) => {
    const { email, codigo, password } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Introduce un correo electronico valido' });
    }
    const correo = email.trim().toLowerCase();
    if (!esCodigoDe6Digitos(codigo)) {
      return res.status(400).json({ error: `El codigo debe tener ${DIGITOS} digitos` });
    }
    const intento = String(codigo).trim();
    if (typeof password !== 'string' || password.length < PASSWORD_MINIMO) {
      return res
        .status(400)
        .json({ error: `La contrasena debe tener al menos ${PASSWORD_MINIMO} caracteres` });
    }

    const limite = limiteDe(correo);
    if (limite.intentos >= MAX_INTENTOS) {
      return res
        .status(429)
        .json({ error: 'Demasiados intentos fallidos: pide un codigo nuevo' });
    }

    const fila = await obtener('SELECT * FROM usuarios WHERE email = ?', [correo]);
    const guardado = fila && fila.codigo_recuperacion && fila.expiracion_codigo ? fila : null;
    // En la base esta el SHA-256 del codigo, asi que se hashea tambien el intento.
    const coincide = guardado && coincideHash(hashearCodigo(intento), guardado.codigo_recuperacion);
    const vigente = coincide && !expiradoEn(guardado.expiracion_codigo);

    if (!vigente) {
      limite.intentos += 1;
      if (coincide) {
        return res.status(400).json({ error: 'El codigo ha caducado: pide uno nuevo' });
      }
      return res.status(400).json({ error: 'Codigo incorrecto o caducado' });
    }

    const hash = await hashearPassword(password);
    // Un solo uso: la clave nueva entra y el codigo desaparece en la misma
    // sentencia. expiracion_codigo solo se limpia si no hay un codigo de
    // verificacion pendiente compartiendo la columna.
    limite.intentos = 0;
    await ejecutar(
      `UPDATE usuarios
          SET password_hash = ?,
              codigo_recuperacion = NULL,
              expiracion_codigo = IF(codigo_verificacion IS NULL, NULL, expiracion_codigo)
        WHERE id = ?`,
      [hash, fila.id]
    );

    // Quien presento el codigo valido demostro control del correo: se le abre
    // sesion con la clave nueva para que no tenga que escribirla otra vez.
    const actualizada = await obtener('SELECT id, usuario, email FROM usuarios WHERE id = ?', [
      fila.id,
    ]);
    responderSesion(res, actualizada);
  })
);

module.exports = router;
