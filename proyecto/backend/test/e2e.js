const { spawn } = require('node:child_process');
const path = require('node:path');
const { construirFrecuencias } = require('../src/stats/frecuencias');
const { initDb, consultar, ejecutar, cerrar } = require('../src/db');

// Puerto propio del servidor que arranca la prueba. El 3001 lo usa el
// servidor de desarrollo y suele estar ocupado: si el hijo no puede escuchar
// ahi, muere con EADDRINUSE y el test se comunicaria con ESE servidor en vez
// del suyo, que ademas tiene otra base de datos y otro estado.
const PUERTO_TEST = Number(process.env.PORT_E2E) || 3199;

const BASE = `http://localhost:${PUERTO_TEST}/api`;
const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src', 'stats', 'frecuencias.js');

const DATOS = [12, 15, 15, 18, 22, 22, 22, 25, 28, 28, 30, 33, 33, 33, 36, 40, 40, 44, 45, 48, 50, 52, 55, 58, 60, 62, 65, 68, 70, 72, 75, 78, 80, 85, 88, 90, 5, 33, 40];

const TABLAS = ['lotes_datos', 'datos', 'estadisticos_basicos', 'tabla_frecuencias', 'estadisticos_avanzados'];

// Conteos de las cinco tablas, leidos con el pool de esta base.
async function contarEnTablas() {
  const entradas = await Promise.all(
    TABLAS.map(async (tabla) => {
      const filas = await consultar(`SELECT COUNT(*) AS total FROM ${tabla}`);
      return [tabla, Number(filas[0].total)];
    })
  );
  return Object.fromEntries(entradas);
}

let fallos = 0;
// Token de la sesion de prueba: se crea en el bloque 0 y pedir() lo adjunta a cada
// peticion, de modo que los demas bloques no tienen que acordarse del header.
let token = null;

function afirmar(condicion, mensaje) {
  if (condicion) {
    console.log(`  ok   ${mensaje}`);
  } else {
    console.log(`  FALLA ${mensaje}`);
    fallos++;
  }
}

async function pedir(ruta, opciones = {}) {
  const headers = { ...(opciones.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${ruta}`, { ...opciones, headers });
  const cuerpo = await res.json();
  return { status: res.status, cuerpo };
}

// Lee directo de MySQL, sin pasar por la API, para verificar el snapshot persistido
function todos(sql, params) {
  return consultar(sql, params);
}

async function esperarServidor(intentos = 40) {
  // La raiz responde siempre; /api/lotes ahora exige sesion y devolveria 401, que no
  // sirve como senal de que el servidor ya levanto.
  const raiz = BASE.replace(/\/api$/, '');
  for (let i = 0; i < intentos; i++) {
    // Si el hijo murio no hay nada que esperar: seguir insistiendo solo gastaria
    // el tiempo de la prueba y ocultaria el error que lo Provoco.
    if (hijoMuerto) {
      throw new Error(
        `El servidor de la prueba termino al arrancar (codigo ${hijoMuerto.codigo}).\n` +
          `${salidaError.trim() || '(sin salida de error)'}`
      );
    }
    try {
      const res = await fetch(raiz);
      if (res.ok) return true;
    } catch {
      /* aun no levanta */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// Salida del servidor hijo: se guarda integra para poder leer los codigos de 6
// digitos que imprime en la consola cuando no hay SMTP configurado.
let salidaServidor = '';

// Errores del servidor hijo (EADDRINUSE, MySQL caido...). Se guardan aparte
// para poder ensenar que fallo cuando el hijo muere antes de levantar.
let salidaError = '';

// Si el hijo muere, el test no debe quedarse esperando una respuesta que nunca
// llegara: con un puerto ocupado el proceso muere al instante con EADDRINUSE
// y la peticion siguiente hanguearia hasta que el tiempo se agotara.
let hijoMuerto = null;

// Variables de entorno del servidor de la prueba: puerto propio (para no
// chocar con el de desarrollo) y SMTP vacio, aunque con el flujo por correo
// desactivado el servidor ya no lo usa.
const ENTORNO_SIN_CORREO = {
  ...process.env,
  PORT: String(PUERTO_TEST),
  SMTP_HOST: '',
  SMTP_PORT: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  EMAIL_USER: '',
  EMAIL_PASS: '',
};

(async () => {
  const servidor = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: ENTORNO_SIN_CORREO,
  });

  servidor.stdout.on('data', (trozo) => {
    salidaServidor += trozo.toString();
  });
  servidor.stderr.on('data', (trozo) => {
    salidaError += trozo.toString();
  });

  // El hijo puede morir nada mas arrancar (puerto ocupado, base de datos
  // inaccesible). Sin esto, la prueba seguiria esperando un codigo de 6 digitos
  // que jamas se emitira y el fallo apareceria como "codigo null" en lugar del
  // error real que lo Provoco.
  servidor.on('exit', (codigo, senal) => {
    hijoMuerto = { codigo, senal };
  });

  // Fuera del try: la limpieza final (bloque finally) los necesita aunque la
  // prueba falle a media y salte a la excepcion.
  const sufijo = Date.now();
  const credenciales = {
    usuario: `e2e${sufijo}`,
    email: `e2e${sufijo}@prueba.test`,
    password: 'secreto123',
  };

  try {
    // Conexion propia del test a MySQL: sirve para leer la base directamente en los
    // bloques 4b y 8, sin depender del proceso del servidor.
    await initDb();

    if (!(await esperarServidor())) {
      console.log('El servidor no levanto');
      process.exit(1);
    }

    console.log('\n0) Autenticacion: alta directa, login y sesion obligatoria');
    const anonimo = await fetch(`${BASE}/lotes`);
    afirmar(anonimo.status === 401, `GET /lotes sin token -> 401 (llego ${anonimo.status})`);

    const json = { 'Content-Type': 'application/json' };

    const registro = await pedir('/auth/registro', {
      method: 'POST',
      headers: json,
      body: JSON.stringify(credenciales),
    });
    afirmar(registro.status === 201, `registro -> 201 (llego ${registro.status})`);
    afirmar(typeof registro.cuerpo.token === 'string', 'el registro devuelve token (acceso directo)');
    afirmar(registro.cuerpo.usuario?.usuario === credenciales.usuario, 'el registro devuelve el usuario');
    afirmar(registro.cuerpo.requiereVerificacion === undefined, 'el registro no pide verificacion');

    // La cuenta nace 'activo': no hay codigo de por medio.
    const alta = await todos('SELECT estado_cuenta FROM usuarios WHERE email = ?', [
      credenciales.email,
    ]);
    afirmar(alta[0].estado_cuenta === 'activo', 'la cuenta nace en estado activo');
    const codigoLimpio = await todos(
      'SELECT codigo_verificacion FROM usuarios WHERE email = ?',
      [credenciales.email]
    );
    afirmar(codigoLimpio[0].codigo_verificacion === null, 'no se guarda ningun codigo de verificacion');

    const duplicado = await pedir('/auth/registro', {
      method: 'POST',
      headers: json,
      body: JSON.stringify(credenciales),
    });
    afirmar(duplicado.status === 409, `registro repetido -> 409 (llego ${duplicado.status})`);

    const loginMalo = await pedir('/auth/login', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ identificador: credenciales.usuario, password: 'otra-clave' }),
    });
    afirmar(loginMalo.status === 401, `clave incorrecta -> 401 (llego ${loginMalo.status})`);

    // El login entrega el token de inmediato: no hay paso de verificacion.
    const login = await pedir('/auth/login', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ identificador: credenciales.email, password: credenciales.password }),
    });
    afirmar(login.status === 200, `login con correo -> 200 (llego ${login.status})`);
    token = login.cuerpo.token;
    afirmar(typeof token === 'string' && token.length > 0, 'el login devuelve token');

    const me = await pedir('/auth/me');
    afirmar(me.status === 200, `/auth/me -> 200 (llego ${me.status})`);
    afirmar(me.cuerpo.usuario?.usuario === credenciales.usuario, 'la sesion identifica al usuario');

    console.log('\n0b) Los endpoints de codigo estan desactivados');
    const verificar = await pedir('/auth/verificar-cuenta', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ email: credenciales.email, codigo: '123456' }),
    });
    afirmar(verificar.status === 404, `verificar-cuenta -> 404 (llego ${verificar.status})`);

    const reenviar = await pedir('/auth/reenviar-verificacion', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ email: credenciales.email }),
    });
    afirmar(reenviar.status === 404, `reenviar-verificacion -> 404 (llego ${reenviar.status})`);

    const olvidar = await pedir('/auth/forgot-password', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ email: credenciales.email }),
    });
    afirmar(olvidar.status === 404, `forgot-password -> 404 (llego ${olvidar.status})`);

    const restablecer = await pedir('/auth/restablecer-password', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ email: credenciales.email, codigo: '123456', password: 'nueva-clave-456' }),
    });
    afirmar(restablecer.status === 404, `restablecer-password -> 404 (llego ${restablecer.status})`);

    console.log('\n1) POST de un lote valido');
    const post = await pedir('/lotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Lote E2E', descripcion: 'prueba automatica', datos: DATOS }),
    });
    afirmar(post.status === 201, `responde 201 (llego ${post.status})`);
    afirmar(post.cuerpo.id > 0, `devuelve id (${post.cuerpo.id})`);
    afirmar(post.cuerpo.cantidad === DATOS.length, `cantidad ${post.cuerpo.cantidad} = n`);

    console.log('\n2) La respuesta del POST coincide con el calculo del frontend');
    const front = await import(`file:///${FRONTEND.replace(/\\/g, '/')}`);
    const esperado = front.calcularTablaFrecuencias(DATOS);
    const f = post.cuerpo.frecuencias;
    afirmar(f.n === esperado.n, `n ${f.n}`);
    afirmar(f.k === esperado.k, `k ${f.k}`);
    afirmar(f.amplitud === esperado.amplitud, `amplitud ${f.amplitud}`);
    afirmar(f.media === esperado.media, `media ${f.media}`);
    afirmar(f.q1 === esperado.q1, `Q1 ${f.q1}`);
    afirmar(f.mediana === esperado.mediana, `mediana ${f.mediana}`);
    afirmar(f.q3 === esperado.q3, `Q3 ${f.q3}`);
    afirmar(f.p17 === esperado.p17, `P17 ${f.p17}`);
    afirmar(f.mediaPonderada === esperado.mediaPonderada, `mediaPonderada ${f.mediaPonderada}`);
    afirmar(f.posicionMediana === esperado.posicionMediana, `posicionMediana ${f.posicionMediana}`);
    afirmar(f.moda === esperado.moda, `moda ${f.moda}`);
    afirmar(f.desviacionMuestral === esperado.desviacionMuestral, `s ${f.desviacionMuestral}`);
    afirmar(f.filas.length === esperado.filas.length, `${f.filas.length} filas`);
    afirmar(
      JSON.stringify(f.filas) === JSON.stringify(esperado.filas),
      'las filas coinciden campo por campo'
    );

    console.log('\n3) Las columnas auxiliares se devuelven calculadas');
    const primera = f.filas[0];
    afirmar(primera.producto !== undefined, 'f*xm presente');
    afirmar(primera.relativaProducto !== undefined, '(fr)(xm) presente');
    afirmar(primera.desviacion !== undefined, '(xm-x)^2 presente');
    afirmar(primera.desviacionPonderada !== undefined, '(xm-x)^2*f presente');
    const sumaProducto = f.filas.reduce((s, x) => s + x.producto, 0);
    afirmar(Math.abs(sumaProducto - f.sumaProducto) < 1e-9, 'Σ f*xm = suma de la columna');

    console.log('\n4) GET devuelve lo persistido con las mismas medidas');
    const get = await pedir(`/lotes/${post.cuerpo.id}`);
    afirmar(get.status === 200, `responde 200 (llego ${get.status})`);
    afirmar(get.cuerpo.nombre === 'Lote E2E', `nombre ${get.cuerpo.nombre}`);
    afirmar(get.cuerpo.descripcion === 'prueba automatica', 'descripcion persistida');
    afirmar(
      Math.abs(get.cuerpo.datos.reduce((s, x) => s + x, 0) - DATOS.reduce((s, x) => s + x, 0)) < 1e-9,
      'los datos crudos se guardaron completos'
    );
    afirmar(get.cuerpo.frecuencias.q1 === f.q1, 'Q1 sobrevive el viaje a la base');
    afirmar(get.cuerpo.frecuencias.p17 === f.p17, 'P17 sobrevive el viaje a la base');
    afirmar(
      JSON.stringify(get.cuerpo.frecuencias.filas) === JSON.stringify(f.filas),
      'la tabla de frecuencias se reconstruye identica al leer'
    );

    console.log('\n4b) Las columnas auxiliares quedan escritas en MySQL y se releen');
    const soloFrec = await pedir(`/lotes/${post.cuerpo.id}/frecuencias`);
    afirmar(soloFrec.status === 200, `/frecuencias -> 200 (llego ${soloFrec.status})`);
    afirmar(soloFrec.cuerpo.filas.length === f.filas.length, 'mismo numero de filas');
    afirmar(
      JSON.stringify(soloFrec.cuerpo.filas) === JSON.stringify(f.filas),
      'el endpoint dedicado devuelve las mismas filas, auxiliares incluidas'
    );
    const filaGuardada = soloFrec.cuerpo.filas[0];
    afirmar(filaGuardada.producto !== undefined, 'f*xm releido de la base');
    afirmar(filaGuardada.relativaProducto !== undefined, '(fr)(xm) releido de la base');
    afirmar(filaGuardada.desviacion !== undefined, '(xm-x)^2 releido de la base');
    afirmar(filaGuardada.desviacionPonderada !== undefined, '(xm-x)^2*f releido de la base');
    afirmar(filaGuardada.limiteInferiorReal !== undefined, 'Li releido de la base');
    afirmar(filaGuardada.limiteSuperiorReal !== undefined, 'Ls releido de la base');
    afirmar(filaGuardada.suavizada !== undefined, 'fs releido de la base');

    // El endpoint dedicado recalcula desde los datos crudos, asi que se lee la tabla
    // directamente de MySQL para comprobar que el snapshot guardado no quedo a medias.
    const guardadas = await todos(
      'SELECT * FROM tabla_frecuencias WHERE lote_id = ? ORDER BY id',
      [post.cuerpo.id]
    );
    afirmar(guardadas.length === f.filas.length, 'la base guardo todas las filas');
    for (const fila of f.filas) {
      const g = guardadas.find((x) => x.clase === fila.clase);
      afirmar(g !== undefined, `fila clase ${fila.clase} persistida`);
      afirmar(g.limite_inferior_real === fila.limiteInferiorReal, `Li persistido en clase ${fila.clase}`);
      afirmar(g.limite_superior_real === fila.limiteSuperiorReal, `Ls persistido en clase ${fila.clase}`);
      afirmar(g.suavizada === fila.suavizada, `fs persistido en clase ${fila.clase}`);
      afirmar(g.relativa_producto === fila.relativaProducto, `(fr)(xm) persistido en clase ${fila.clase}`);
    }
    afirmar(get.cuerpo.estadisticosAvanzados !== null, 'estadisticos_avanzados persistido');
    afirmar(
      get.cuerpo.estadisticosAvanzados.q1 === f.q1 &&
        get.cuerpo.estadisticosAvanzados.p17 === f.p17,
      'Q1 y P17 guardados en estadisticos_avanzados'
    );
    afirmar(
      get.cuerpo.estadisticosAvanzados.mediaPonderada === f.mediaPonderada &&
        get.cuerpo.estadisticosAvanzados.posicionMediana === f.posicionMediana &&
        get.cuerpo.estadisticosAvanzados.moda === f.moda,
      'mediaPonderada, posicionMediana y moda guardadas y releidas'
    );
    afirmar(
      get.cuerpo.estadisticosAvanzados.posicionMediana === f.n / 2,
      `posicionMediana releida = ${get.cuerpo.estadisticosAvanzados.posicionMediana} = n/2`
    );

    console.log('\n4c) Los endpoints usan los mismos nombres de campo entre si');
    afirmar(!Array.isArray(get.cuerpo.estadisticos), 'estadisticos es un objeto, no un arreglo');
    afirmar(!Array.isArray(get.cuerpo.estadisticosAvanzados), 'estadisticosAvanzados es un objeto');
    afirmar(get.cuerpo.estadisticos.n === f.n, `estadisticos.n = ${get.cuerpo.estadisticos.n}`);
    afirmar(get.cuerpo.estadisticos.xMin === f.xMin, `estadisticos.xMin = ${get.cuerpo.estadisticos.xMin}`);
    afirmar(get.cuerpo.estadisticos.xMax === f.xMax, `estadisticos.xMax = ${get.cuerpo.estadisticos.xMax}`);
    afirmar(get.cuerpo.estadisticos.rango === f.rango, `estadisticos.rango = ${get.cuerpo.estadisticos.rango}`);
    afirmar(get.cuerpo.estadisticos.x_min === undefined, 'no quedan nombres en snake_case');

    const solo = await pedir(`/lotes/${post.cuerpo.id}/stats`);
    afirmar(solo.status === 200, `/stats -> 200 (llego ${solo.status})`);
    for (const clave of ['n', 'xMin', 'xMax', 'rango', 'media', 'mediaPonderada', 'posicionMediana', 'moda', 'q1', 'mediana', 'q3', 'p17', 'desviacionMuestral']) {
      afirmar(solo.cuerpo[clave] !== undefined, `/stats expone ${clave}`);
    }
    afirmar(
      JSON.stringify(solo.cuerpo) ===
        JSON.stringify({ ...get.cuerpo.estadisticos, ...get.cuerpo.estadisticosAvanzados }),
      '/stats coincide con lo que devuelve /lotes/:id'
    );

    console.log('\n5) El listado incluye el lote nuevo');
    const lista = await pedir('/lotes');
    afirmar(Array.isArray(lista.cuerpo), '/lotes devuelve un arreglo');
    afirmar(lista.cuerpo.some((l) => l.id === post.cuerpo.id), 'aparece en /lotes');

    console.log('\n5b) El historial es privado: otro usuario no ve estos lotes');
    const registroB = await pedir('/auth/registro', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        usuario: `e2eB${sufijo}`,
        email: `e2eB${sufijo}@prueba.test`,
        password: 'secreto123',
      }),
    });
    afirmar(registroB.status === 201, `segundo usuario creado (${registroB.status})`);
    afirmar(typeof registroB.cuerpo.token === 'string', 'el segundo usuario recibe su sesion');
    const cabeceraB = { Authorization: `Bearer ${registroB.cuerpo.token}` };

    const ajeno = await fetch(`${BASE}/lotes/${post.cuerpo.id}`, { headers: cabeceraB });
    afirmar(ajeno.status === 404, `lote ajeno -> 404 (llego ${ajeno.status})`);

    const listaB = await (await fetch(`${BASE}/lotes`, { headers: cabeceraB })).json();
    afirmar(Array.isArray(listaB) && listaB.length === 0, 'el segundo usuario arranca con historial vacio');

    console.log('\n5c) PUT actualiza un lote propio y recalcula todo');
    const editado = await pedir(`/lotes/${post.cuerpo.id}`, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({
        nombre: 'Lote E2E v2',
        descripcion: 'editado por PUT',
        datos: DATOS.slice(0, 20),
      }),
    });
    afirmar(editado.status === 200, `PUT -> 200 (llego ${editado.status})`);
    afirmar(editado.cuerpo.nombre === 'Lote E2E v2', 'el nombre se actualiza');
    afirmar(editado.cuerpo.cantidad === 20, `cantidad ${editado.cuerpo.cantidad} = 20`);
    afirmar(editado.cuerpo.estadisticos.n === 20, 'los estadisticos se recalculan');

    const releido = await pedir(`/lotes/${post.cuerpo.id}`);
    afirmar(releido.cuerpo.nombre === 'Lote E2E v2', 'el cambio queda persistido');
    afirmar(releido.cuerpo.datos.length === 20, 'los datos crudos se reemplazan');

    const ajenoPut = await fetch(`${BASE}/lotes/${post.cuerpo.id}`, {
      method: 'PUT',
      headers: { ...cabeceraB, ...json },
      body: JSON.stringify({ nombre: 'robado', datos: DATOS }),
    });
    afirmar(ajenoPut.status === 404, `PUT sobre lote ajeno -> 404 (llego ${ajenoPut.status})`);

    // Restaura el lote original: los pasos siguientes comparan contra el calculo inicial.
    const restaurado = await pedir(`/lotes/${post.cuerpo.id}`, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ nombre: 'Lote E2E', descripcion: 'prueba automatica', datos: DATOS }),
    });
    afirmar(restaurado.status === 200, `restauracion -> 200 (llego ${restaurado.status})`);
    afirmar(
      JSON.stringify(restaurado.cuerpo.frecuencias.filas) === JSON.stringify(f.filas),
      'tras restaurar, la tabla vuelve a coincidir con el calculo original'
    );

    console.log('\n6) Rechazos con 400 y mensajes precisos');
    const sinNombre = await pedir('/lotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datos: [1, 2] }),
    });
    afirmar(sinNombre.status === 400, `sin nombre -> 400 (llego ${sinNombre.status})`);
    afirmar(/nombre/.test(sinNombre.cuerpo.error), `mensaje: ${sinNombre.cuerpo.error}`);

    const conLetras = await pedir('/lotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'x', datos: [10, 'abc', 30, 'xyz'] }),
    });
    afirmar(conLetras.status === 400, `con letras -> 400 (llego ${conLetras.status})`);
    afirmar(/posicion\(es\) 1, 3/.test(conLetras.cuerpo.error), `mensaje: ${conLetras.cuerpo.error}`);

    const pocos = await pedir('/lotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'x', datos: [7] }),
    });
    afirmar(pocos.status === 400, `un solo valor -> 400 (llego ${pocos.status})`);
    afirmar(/al menos 2/.test(pocos.cuerpo.error), `mensaje: ${pocos.cuerpo.error}`);

    const cuerpoRoto = await pedir('/lotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'x', datos: 'no soy arreglo' }),
    });
    afirmar(cuerpoRoto.status === 400, `datos no-arreglo -> 400 (llego ${cuerpoRoto.status})`);

    console.log('\n7) 404 para un lote inexistente');
    const inexistente = await pedir('/lotes/999999');
    afirmar(inexistente.status === 404, `-> 404 (llego ${inexistente.status})`);

    console.log('\n8) Limpieza: el borrado no debe dejar filas huerfanas');
    const antes = await contarEnTablas();
    const borrar = await pedir(`/lotes/${post.cuerpo.id}`, { method: 'DELETE' });
    afirmar(borrar.status === 200, `DELETE -> 200 (llego ${borrar.status})`);
    const despues = await pedir(`/lotes/${post.cuerpo.id}`);
    afirmar(despues.status === 404, 'el lote ya no existe');
    afirmar(
      (await pedir('/lotes')).cuerpo.every((l) => l.id !== post.cuerpo.id),
      'el lote desaparece del listado'
    );
    const despues2 = await contarEnTablas();
    const esperadoBorrado = {
      lotes_datos: 1,
      datos: DATOS.length,
      estadisticos_basicos: 1,
      tabla_frecuencias: f.filas.length,
      estadisticos_avanzados: 1,
    };
    for (const tabla of Object.keys(esperadoBorrado)) {
      afirmar(
        despues2[tabla] === antes[tabla] - esperadoBorrado[tabla],
        `${tabla}: ${antes[tabla]} -> ${despues2[tabla]} (se esperaban -${esperadoBorrado[tabla]})`
      );
    }

    const borrarFantasma = await pedir('/lotes/999999', { method: 'DELETE' });
    afirmar(borrarFantasma.status === 404, `borrar inexistente -> 404 (llego ${borrarFantasma.status})`);
  } catch (err) {
    // Un fallo a media no debe arrastrar al resto de la prueba sin decir nada:
    // se imprime el error real, la salida del servidor hijo y se cuenta como
    // fallo, para que el motivo no se pierda.
    console.error(`\nError inesperado en la prueba: ${err.message}`);
    if (salidaServidor.trim()) console.error(`\nSalida del servidor:\n${salidaServidor.trim()}`);
    if (salidaError.trim()) console.error(`\nErrores del servidor:\n${salidaError.trim()}`);
    fallos++;
  } finally {
    // Limpieza final: sin esto cada corrida dejaria dos usuarios de prueba en la
    // base. Va en el finally para que tambien se limpien si la prueba falla a
    // media (un usuario a medias dejaba basura en la base).
    try {
      await ejecutar('DELETE FROM usuarios WHERE usuario IN (?, ?)', [
        credenciales.usuario,
        `e2eB${sufijo}`,
      ]);
    } catch (err) {
      console.error(`No se pudieron borrar los usuarios de prueba: ${err.message}`);
    }
    servidor.kill();
    await cerrar();
  }

  console.log(fallos === 0 ? '\nE2E OK: todas las comprobaciones pasaron' : `\nE2E con ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
})();
