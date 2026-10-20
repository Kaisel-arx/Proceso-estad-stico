const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Envio de correos de recuperacion con Nodemailer.
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
 * correo. Que ocurre asi se avisa una sola vez.
 */

// Gmail directo: si faltan HOST/PORT pero hay credenciales, se apunta a Google.
// smtp.gmail.com:587 con STARTTLS es la configuracion estandard y segura; 465
// (TLS implicito) tambien funciona si se configura SMTP_PORT=465.
const GMAIL = { host: 'smtp.gmail.com', port: 587, secure: false };

function resolverConfig() {
  const host = (process.env.SMTP_HOST || '').trim();
  const usuario = (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
  const clave = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
  const puerto = Number(process.env.SMTP_PORT) || 587;

  // Sin host y sin credenciales: modo consola (desarrollo).
  if (!host && !usuario) {
    return { host: '', port: puerto, secure: puerto === 465, auth: undefined, modo: 'consola' };
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
  if (CONFIG.modo !== 'smtp') return null;
  if (!transporte) {
    const { modo, proveedor, autenticado, ...opciones } = CONFIG;
    // Timeouts explicitos: sin ellos un servidor SMTP caido o un firewall que
    // puerta el 587 dejaria sendMail colgado indefinidamente y la peticion del
    // cliente congelada hasta que el proceso se reinicie. Con estos limites
    // sendMail siempre termina (y con error claro) en 20 segundos como maximo.
    transporte = nodemailer.createTransport({
      ...opciones,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporte;
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
  if (CONFIG.modo === 'consola') {
    console.warn(
      '⚠️  Correo NO configurado (SMTP_HOST/SMTP_USER vacios): los codigos de recuperacion ' +
        'se imprimen en la consola del servidor en vez de enviarse. Configura SMTP_HOST, ' +
        'SMTP_USER y SMTP_PASS (App Password de 16 caracteres si usas Gmail) en .env.'
    );
    return;
  }

  console.log(
    `Correo: SMTP ${CONFIG.proveedor}:${CONFIG.port}` +
      `${CONFIG.autenticado ? ` (autenticado como ${CONFIG.auth.user})` : ' (sin autenticacion)'}`
  );

  try {
    await obtenerTransporte().verify();
    console.log('Correo: conexion SMTP verificada ✔');
  } catch (err) {
    // El error completo (respuesta del servidor incluida) es lo unico que
    // permite distinguir "clave mala" de "puerto bloqueado" o "DNS caido".
    console.error('Correo: la verificacion SMTP fallo ✘');
    console.error('  mensaje :', err.message);
    if (err.code) console.error('  codigo  :', err.code);
    if (err.response) console.error('  respuesta:', err.response);
    if (CONFIG.auth && CONFIG.auth.user && !/\d{16}/.test(CONFIG.auth.pass || '')) {
      console.error(
        '  pista   : SMTP_PASS no parece una App Password de 16 caracteres. Gmail y Outlook ' +
          'rechazan la contrasena personal de la cuenta; genera una en ' +
          'https://myaccount.google.com/apppasswords'
      );
    }
  }
}

/**
 * Envia el codigo de 6 digitos al correo del usuario.
 *
 * Devuelve { enviado, modo }: `modo: 'consola'` significa que no hay SMTP y el
 * codigo quedo impreso en el log del servidor. Un fallo real del SMTP se
 * registra con el error exacto en consola y se propaga como excepcion para que
 * la ruta responda 502.
 */
async function enviarCodigoRecuperacion(email, codigo) {
  const transporteActual = obtenerTransporte();

  if (!transporteActual) {
    if (!avisoSinSmtp) {
      console.warn(
        '⚠️  Correo NO configurado: los codigos de recuperacion se imprimen en la consola ' +
          'del servidor en vez de enviarse por correo.'
      );
      avisoSinSmtp = true;
    }
    console.log(`[RECUPERACION] Codigo de 6 digitos para ${email}: ${codigo}`);
    return { enviado: false, modo: 'consola' };
  }

  const asunto = 'StatLab: codigo para recuperar tu contrasena';
  const texto = [
    'Hola,',
    '',
    'Recibimos una solicitud para recuperar la contrasena de tu cuenta en StatLab.',
    '',
    `Tu codigo de verificacion es: ${codigo}`,
    '',
    'Caduca en 10 minutos y solo puede usarse una vez.',
    'Si no pediste este codigo, ignora este mensaje: tu contrasena no cambia.',
  ].join('\n');

  const from = process.env.MAIL_FROM || CONFIG.auth?.user || 'StatLab <no-responder@statlab.local>';

  try {
    const info = await transporteActual.sendMail({
      from,
      to: email,
      subject: asunto,
      text: texto,
    });
    console.log(`Correo enviado a ${email} (${info.messageId || 'sin messageId'})`);
    return { enviado: true, modo: 'smtp' };
  } catch (err) {
    // Captura explicita: el error exacto del SMTP (autorizacion, conexion,
    // limite del proveedor) va a la consola del servidor tal cual llega.
    console.error(`Fallo al enviar el correo de recuperacion a ${email}:`);
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
    throw err;
  }
}

module.exports = { enviarCodigoRecuperacion, diagnosticarCorreo };
