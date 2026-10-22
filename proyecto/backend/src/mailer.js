require('dotenv').config();

// ---------------------------------------------------------------------------
// Interruptor del flujo de verificacion por correo.
//
// false (estado actual): el proyecto NO usa SMTP en ninguna peticion. El
//   registro crea la cuenta activa y entrega la sesion en el momento, y el
//   login no exige codigo. El codigo de verificacion y la recuperacion de
//   contrasena por correo quedan desactivados. El despliegue en
//   Railway/Vercel no depende asi de un servidor de correo ni de sus claves.
//
// true: vuelve el flujo por correo completo (codigo de 6 digitos para
//   verificar la cuenta y para recuperar la contrasena). Todo el codigo de
//   este modulo sigue intacto: reactivarlo es cambiar esta constante.
//
// Nota: el interruptor vive aqui porque este modulo es el dueno del envio de
// correo; las rutas de autenticacion lo importan para aplicar la misma regla.
// ---------------------------------------------------------------------------
const VERIFICACION_POR_CORREO = false;

/**
 * Envio de codigos de verificacion de cuenta y de recuperacion de contrasena
 * con Nodemailer.
 *
 * Variables de entorno (.env) — nombres canonicos:
 *   SMTP_HOST  servidor SMTP (p. ej. smtp.gmail.com). Si se omite pero hay
 *              credenciales, se usa Gmail como conveniencia.
 *   SMTP_PORT  587 (STARTTLS, por defecto) o 465 (TLS implicito)
 *   SMTP_USER  usuario; si esta vacio el transporte va sin autenticacion
 *   SMTP_PASS  CONTRASENA DE APLICACION de 16 caracteres (App Password) si el
 *              proveedor la exige — Gmail y Outlook la exigen. Nunca la
 *              contrasena personal de la cuenta: Google la rechaza.
 *   MAIL_FROM  remitente mostrado, p. ej. "StatLab <no-responder@statlab.dev>"
 *
 * Alias aceptados (para quien venga de otra plantilla): EMAIL_USER y
 * EMAIL_PASS se leen como respaldo de SMTP_USER y SMTP_PASS respectivamente.
 *
 * Sin ningun correo configurado el modulo no truena: imprime el codigo en la
 * consola del servidor para poder desarrollar el flujo entero sin servidor de
 * correo. Tambien cae en ese modo si falta la clave (SMTP_PASS vacio): un envio
 * con contrasena vacia solo puede acabar en EAUTH, y es preferible imprimir el
 * codigo a rechazar el registro entero. Que ocurre asi se avisa una sola vez.
 */

// Gmail directo: si faltan HOST/PORT pero hay credenciales, se apunta a Google.
// smtp.gmail.com:587 con STARTTLS es la configuracion estandard y segura; 465
// (TLS implicito) tambien funciona si se configura SMTP_PORT=465.
const GMAIL = { host: 'smtp.gmail.com', port: 587, secure: false };

// Limites de tiempo del envio. Los timeouts del transporte cubren cada fase
// (conexion, saludo, socket), pero no acotan el envio completo: una fase lenta
// sumada a otra puede dejar la peticion esperando mas de lo previsto. El plazo
// global de abajo es la red de seguridad: sendMail siempre termina antes de
// este tiempo, con error claro, aunque el proveedor se quede colgado.
const TIMEOUT_CONEXION_MS = 8_000;
const TIMEOUT_SALUDO_MS = 8_000;
const TIMEOUT_SOCKET_MS = 15_000;
const PLAZO_ENVIO_MS = 12_000;
const ESPERA_REINTENTO_MS = 1_500;

// Fallos de red de los que tiene sentido reintentar: el servidor de correo
// esta vivo pero la conexion no se pudo establecer (DNS lento, corte
// momentaneo, socket caido). Un EAUTH (credenciales) o un 550 (buzon lleno)
// NO se reintentan: volver a insistir solo gastaria el plazo del usuario.
const ERRORES_REINTENTABLES = new Set([
  'EDNS',
  'EAI_AGAIN',
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
]);

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// Una App Password de Google son 16 caracteres alfanumericos (p. ej.
// "abcd efgh ijkl mnop", sin espacios al copiarla). Comprobar "16 digitos"
// daria un falso positivo con cualquier clave real, asi que se valida la forma:
// 16 caracteres sin espacios. Solo es una pista en el log: la validacion real
// la hace el propio SMTP al autenticar.
function pareceAppPassword(clave) {
  return /^[a-z]{16}$/i.test(String(clave || '').replace(/\s+/g, ''));
}

function resolverConfig() {
  const host = (process.env.SMTP_HOST || '').trim();
  const usuario = (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
  const clave = (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
  const puerto = Number(process.env.SMTP_PORT) || 587;

  // Sin host y sin credenciales: modo consola (desarrollo).
  if (!host && !usuario) {
    return { host: '', port: puerto, secure: puerto === 465, auth: undefined, modo: 'consola' };
  }

  // Hay usuario pero falta la clave: la configuracion esta incompleta. Un envio
  // con contrasena vacia solo puede acabar en EAUTH (o en un rechazo por
  // credenciales vacias), asi que el modulo cae al modo consola: el codigo se
  // imprime en el log y el flujo se puede completar sin bloquear al usuario.
  // El arranque avisa del motivo exacto para que se corrija el .env.
  if (usuario && !clave) {
    return {
      host: '',
      port: puerto,
      secure: puerto === 465,
      auth: undefined,
      modo: 'consola',
      motivo: 'falta SMTP_PASS (la App Password de 16 caracteres)',
    };
  }

  // Sin host explicito pero con credenciales: se infiere Gmail.
  const hostFinal = host || GMAIL.host;
  const puertoFinal = host ? puerto : GMAIL.port;

  return {
    host: hostFinal,
    port: puertoFinal,
    // 465 = TLS implicito; cualquier otro puerto (tipicamente 587) = STARTTLS.
    secure: puertoFinal === 465,
    auth: usuario ? { user: usuario, pass: clave } : undefined,
    modo: 'smtp',
    // Para los mensajes de error: que proveedor se esta usando realmente.
    proveedor: host ? hostFinal : 'gmail (inferido)',
    autenticado: Boolean(usuario),
  };
}

const CONFIG = resolverConfig();

let transporte = null;
let avisoSinSmtp = false;

function obtenerTransporte() {
  // Con el flujo por correo desactivado no se abre ningun transporte SMTP: el
  // modulo se queda en modo consola y las rutas que lo usarian ya responden
  // 404 antes de llegar aqui.
  if (!VERIFICACION_POR_CORREO) return null;
  if (CONFIG.modo !== 'smtp') return null;
  if (!transporte) {
    // Nodemailer se carga aqui y no al inicio del modulo: con el flujo por
    // correo desactivado la libreria no llega a cargarse nunca, asi que el
    // servidor arranca igual aunque la dependencia no este disponible.
    const nodemailer = require('nodemailer');
    const { modo, proveedor, autenticado, motivo, ...opciones } = CONFIG;
    // Timeouts explicitos: sin ellos un servidor SMTP caido o un firewall que
    // puerta el 587 dejaria sendMail colgado indefinidamente y la peticion del
    // cliente congelada hasta que el proceso se reinicie. Con estos limites
    // sendMail siempre termina (y con error claro) en 20 segundos como maximo.
    transporte = nodemailer.createTransport({
      ...opciones,
      connectionTimeout: TIMEOUT_CONEXION_MS,
      greetingTimeout: TIMEOUT_SALUDO_MS,
      socketTimeout: TIMEOUT_SOCKET_MS,
    });
  }
  return transporte;
}

/**
 * Envuelve una promesa SMTP en un plazo maximo. Sin esto, una fase del envio
 * que no respeta los timeouts del transporte (por ejemplo, una respuesta del
 * servidor que llega a medias) podria dejar la peticion del cliente colgada
 * indefinidamente. Al vencer el plazo se lanza un error ETIMEDOUT, que la ruta
 * traduce a un mensaje accionable. El envio original sigue su curso hacia el
 * servidor: como el codigo ya se ha guardado en la base, si el correo llegara
 * mas tarde seria valido de todas formas.
 */
async function conPlazo(promesa, ms, etiqueta) {
  let temporizador;
  const plazo = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => {
      const err = new Error(`El envio de correo (${etiqueta}) supero el plazo de ${ms} ms`);
      err.code = 'ETIMEDOUT';
      rechazar(err);
    }, ms);
  });

  try {
    return await Promise.race([promesa, plazo]);
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Diagnostico de la configuracion de correo, pensado para el arranque del
 * servidor: imprime que modo quedo activo y, si hay SMTP, valida la
 * autenticacion con verify(). Un fallo de verify (clave personal de Gmail en
 * vez de App Password, puerto mal, DNS caido...) se imprime aqui con el error
 * exacto de Nodemailer, antes de que alguien pida un codigo y no sepa por que
 * no llega el correo.
 */
async function diagnosticarCorreo() {
  // Sin flujo por correo no hay SMTP que diagnosticar: el arranque se anuncia
  // en una linea y el servidor queda listo para escuchar.
  if (!VERIFICACION_POR_CORREO) {
    console.log('Correo: desactivado (verificacion por codigo en pausa, sin SMTP).');
    return;
  }

  if (CONFIG.modo === 'consola') {
    const causa = CONFIG.motivo
      ? ` (${CONFIG.motivo})`
      : ' (SMTP_HOST/SMTP_USER vacios)';
    console.warn(
      `⚠️  Correo NO configurado${causa}: los codigos de verificacion y recuperacion se ` +
        'imprimen en la consola del servidor en vez de enviarse. Configura SMTP_HOST, SMTP_USER ' +
        'y SMTP_PASS (App Password de 16 caracteres si usas Gmail) en .env.'
    );
    return;
  }

  console.log(
    `Correo: SMTP ${CONFIG.proveedor}:${CONFIG.port}` +
      `${CONFIG.autenticado ? ` (autenticado como ${CONFIG.auth.user})` : ' (sin autenticacion)'}`
  );

  try {
    // verify() con plazo propio y reintento ante fallos de red transitorios:
    // un corte de DNS de dos segundos no debe marcar el arranque como fallido
    // cuando las credenciales son correctas (el envio si reintenta igual).
    await verificarConReintentos(obtenerTransporte());
    console.log('Correo: conexion SMTP verificada ✔');
  } catch (err) {
    // El error completo (respuesta del servidor incluida) es lo unico que
    // permite distinguir "clave mala" de "puerto bloqueado" o "DNS caido".
    console.error('Correo: la verificacion SMTP fallo ✘');
    console.error('  mensaje :', err.message);
    if (err.code) console.error('  codigo  :', err.code);
    if (err.response) console.error('  respuesta:', err.response);
    if (CONFIG.auth && CONFIG.auth.user && !pareceAppPassword(CONFIG.auth.pass)) {
      console.error(
        '  pista   : SMTP_PASS no parece una App Password de 16 caracteres. Gmail y Outlook ' +
          'rechazan la contrasena personal de la cuenta; genera una en ' +
          'https://myaccount.google.com/apppasswords'
      );
    }
  }
}

/**
 * Valida la autenticacion SMTP con verify(), reintentando los fallos de red
 * transitorios. verify() comprueba usuario y clave de verdad, asi que un fallo
 * aqui significa que la configuracion no sirve (no un problema de red).
 */
async function verificarConReintentos(transporteActual) {
  const maxIntentos = 2;
  let ultimoError = null;

  for (let intento = 1; intento <= maxIntentos; intento += 1) {
    try {
      return await conPlazo(transporteActual.verify(), PLAZO_ENVIO_MS, 'verify');
    } catch (err) {
      ultimoError = err;
      const reintentable = ERRORES_REINTENTABLES.has(err.code);
      if (!reintentable || intento === maxIntentos) throw err;
      console.warn(
        `  reintento ${intento + 1}/${maxIntentos} de la verificacion SMTP en ${ESPERA_REINTENTO_MS} ms (${err.code})`
      );
      await esperar(ESPERA_REINTENTO_MS);
    }
  }

  throw ultimoError;
}

// Contenido de cada correo. La caducidad se recibe como parametro para que el
// texto coincida siempre con el TTL que decide la ruta (15 minutos por defecto).
const PLANTILLAS = {
  verificacion: (codigo, minutos) => ({
    etiqueta: 'VERIFICACION',
    asunto: 'StatLab: codigo para verificar tu cuenta',
    cuerpo: [
      'Hola,',
      '',
      'Recibiste este correo porque alguien creo una cuenta en StatLab con esta direccion.',
      '',
      `Tu codigo de verificacion es: ${codigo}`,
      '',
      `Caduca en ${minutos} minutos.`,
      'Si no fuiste tu, ignora este mensaje: la cuenta seguira pendiente y nadie podra entrar.',
    ].join('\n'),
  }),
  recuperacion: (codigo, minutos) => ({
    etiqueta: 'RECUPERACION',
    asunto: 'StatLab: codigo para recuperar tu contrasena',
    cuerpo: [
      'Hola,',
      '',
      'Recibimos una solicitud para recuperar la contrasena de tu cuenta en StatLab.',
      '',
      `Tu codigo de verificacion es: ${codigo}`,
      '',
      `Caduca en ${minutos} minutos y solo puede usarse una vez.`,
      'Si no pediste este codigo, ignora este mensaje: tu contrasena no cambia.',
    ].join('\n'),
  }),
};

/**
 * Envia un codigo de 6 digitos al correo del usuario.
 *
 * `tipo` = 'verificacion' (alta de cuenta) o 'recuperacion' (clave olvidada);
 * `minutos` es la caducidad que anuncia el correo (la que valida la ruta).
 *
 * Devuelve { enviado, modo }: `modo: 'consola'` significa que no hay SMTP y el
 * codigo quedo impreso en el log del servidor. Un fallo real del SMTP se
 * registra con el error exacto en consola y se propaga como excepcion para que
 * la ruta responda JSON con un mensaje accionable (los timeouts del transporte
 * garantizan que sendMail termina, asi que la peticion nunca se congela).
 */
async function enviarCodigo(email, codigo, tipo, minutos) {
  // Con el flujo por correo desactivado no se envia nada. Las rutas que llaman
  // a esta funcion ya devuelven 404, asi que esta linea es solo una red de
  // seguridad: si alguien llama al modulo directamente, no se abre conexion SMTP.
  if (!VERIFICACION_POR_CORREO) {
    return { enviado: false, modo: 'desactivado' };
  }

  const plantilla = (PLANTILLAS[tipo] || PLANTILLAS.recuperacion)(codigo, minutos);
  const transporteActual = obtenerTransporte();

  if (!transporteActual) {
    if (!avisoSinSmtp) {
      console.warn(
        '⚠️  Correo NO configurado: los codigos de verificacion y recuperacion se imprimen ' +
          'en la consola del servidor en vez de enviarse por correo.'
      );
      avisoSinSmtp = true;
    }
    console.log(`[${plantilla.etiqueta}] Codigo de 6 digitos para ${email}: ${codigo}`);
    return { enviado: false, modo: 'consola' };
  }

  const from = process.env.MAIL_FROM || CONFIG.auth?.user || 'StatLab <no-responder@statlab.local>';

  const opciones = {
    from,
    to: email,
    subject: plantilla.asunto,
    text: plantilla.cuerpo,
  };

  // Un envio con reintento: los fallos de red (DNS lento, socket caido) son
  // transitorios y un segundo intento suele bastar. El reintento nunca deja la
  // peticion colgada: cada intento tiene su propio plazo y, tras el ultimo,
  // el error se propaga para que la ruta responda JSON.
  const maxIntentos = 2;
  let ultimoError = null;

  for (let intento = 1; intento <= maxIntentos; intento += 1) {
    try {
      const info = await conPlazo(
        transporteActual.sendMail(opciones),
        PLAZO_ENVIO_MS,
        plantilla.etiqueta.toLowerCase()
      );
      console.log(`Correo enviado a ${email} (${info.messageId || 'sin messageId'})`);
      return { enviado: true, modo: 'smtp' };
    } catch (err) {
      ultimoError = err;

      // Captura explicita: el error exacto del SMTP (autorizacion, conexion,
      // limite del proveedor) va a la consola del servidor tal cual llega.
      console.error(`Fallo al enviar el correo de ${plantilla.etiqueta.toLowerCase()} a ${email}:`);
      console.error('  mensaje  :', err.message);
      if (err.code) console.error('  codigo   :', err.code);
      if (err.command) console.error('  comando  :', err.command);
      if (err.response) console.error('  respuesta:', err.response);
      if (err.code === 'EAUTH') {
        console.error(
          '  pista    : fallo de autenticacion. Con Gmail/Outlook usa una App Password de 16 ' +
            'caracteres (no la contrasena personal) en SMTP_PASS.'
        );
      }

      // Solo se reintenta si el fallo es de red: un EAUTH (credenciales malas)
      // o un rechazo del proveedor no cambian con un segundo intento.
      const reintentable = ERRORES_REINTENTABLES.has(err.code);
      if (!reintentable || intento === maxIntentos) break;

      console.warn(
        `  reintento ${intento + 1}/${maxIntentos} en ${ESPERA_REINTENTO_MS} ms (fallo transitorio: ${err.code})`
      );
      await esperar(ESPERA_REINTENTO_MS);
    }
  }

  throw ultimoError;
}

module.exports = { enviarCodigo, diagnosticarCorreo, VERIFICACION_POR_CORREO };
