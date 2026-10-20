const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDb } = require('./db');
const { requerirAutenticacion } = require('./middleware/auth');
const { diagnosticarCorreo } = require('./mailer');
const datosRoutes = require('./routes/datos.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();
const PORT = process.env.PORT || 3001;

// Origenes permitidos por CORS: en produccion (Railway) CORS_ORIGIN lleva el
// dominio publico del frontend (Vercel), p. ej. https://statlab.vercel.app; se
// aceptan varios separados por coma y queda restringido a esa lista. Sin
// definir (pruebas, desarrollo local) se refleja cualquier origen para no
// bloquear el frontend, con un aviso en el arranque para que en produccion no
// pase inadvertido.
const ORIGENES_PERMITIDOS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const opcionesCors =
  ORIGENES_PERMITIDOS.length > 0
    ? {
        origin: ORIGENES_PERMITIDOS,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      }
    : { origin: true };

// Middlewares
app.use(cors(opcionesCors));
app.use(express.json());

// Rutas
app.get('/', (req, res) => {
  res.json({ mensaje: 'API funcionando correctamente 🚀' });
});

app.use('/api/auth', authRoutes);
// Todo lo de lotes cuelga de una sesion valida: el middleware deja el usuario en
// req.usuario y cada endpoint filtra por ese duenio.
app.use('/api/lotes', requerirAutenticacion, datosRoutes);

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// express.json() lanza cuando el cuerpo no es JSON valido; sin esto Express responderia
// con HTML y el cliente recibiria un error ilegible.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'El cuerpo de la peticion no es JSON valido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El cuerpo de la peticion es demasiado grande' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Con MySQL el arranque es asincrono: initDb conecta con reintentos, crea la base si
// falta y monta el esquema. Solo despues de eso se escuchan peticiones, para que
// ninguna consulta salga contra una base caida o un esquema sin montar.
async function iniciar() {
  try {
    await initDb();
  } catch (err) {
    console.error('No se pudo conectar a MySQL:', err.message);
    process.exit(1);
  }

  // Diagnostico de correo en el arranque: valida la autenticacion SMTP con
  // verify() e imprime el error exacto si la configuracion esta mal (clave
  // personal en vez de App Password, puerto caido...), de modo que un fallo
  // de envio se ve aqui y no se descubre cuando alguien pide un codigo.
  await diagnosticarCorreo();

  if (ORIGENES_PERMITIDOS.length > 0) {
    console.log(`CORS: origenes permitidos -> ${ORIGENES_PERMITIDOS.join(', ')}`);
  } else {
    console.warn(
      'CORS: CORS_ORIGIN no definido, se acepta cualquier origen. Define CORS_ORIGIN con el ' +
        'dominio del frontend en produccion para restringirlo.'
    );
  }

  // Sin host explicito Node escucha en todas las interfaces (0.0.0.0), que es
  // lo que Railway/Render esperan para enrutar el trafico externo.
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  });
}

iniciar();