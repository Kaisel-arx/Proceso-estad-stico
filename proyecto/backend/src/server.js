const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDb } = require('./db');
const { requerirAutenticacion } = require('./middleware/auth');
const datosRoutes = require('./routes/datos.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Inicializa la base de datos y crea el esquema si no existe
initDb();

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

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});