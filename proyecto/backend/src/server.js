const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDb } = require('./db');
const datosRoutes = require('./routes/datos.routes');

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

app.use('/api/lotes', datosRoutes);

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});