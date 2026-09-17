# Proyecto: Tabla Estadística (UMG) — Fase Inicial (10%)

Aplicación web de estadística: captura, almacenamiento y (en fases posteriores)
construcción de tablas de frecuencias. Esta base inicial cubre exclusivamente la
**recepción y estructuración de datos crudos**, sin cálculos avanzados.

## 📁 Estructura del repositorio

```
proyecto/
├── backend/
│   ├── src/
│   │   ├── server.js              # Punto de entrada de Express
│   │   ├── db.js                  # Conexión SQLite + esquema inicial
│   │   └── routes/
│   │       └── datos.routes.js    # Endpoints para lotes de datos
│   ├── database/                  # Aquí se genera el archivo .sqlite (ignorado en git)
│   ├── .env.example
│   ├── .gitignore
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx
    │   ├── components/
    │   │   └── IngresoDatos.jsx    # Textarea + datos aleatorios + visualización
    │   └── services/
    │       └── api.js              # Funciones fetch centralizadas
    ├── index.html
    ├── vite.config.js
    ├── .gitignore
    └── package.json
```

## 🗄️ Esquema SQLite (fase 10%)

Se crea automáticamente al iniciar el backend. Dos tablas relacionadas:

- `lotes_datos`: un lote/muestra y sus metadatos (`id`, `nombre`, `descripcion`,
  `cantidad`, `creado_en`).
- `datos`: cada valor crudo del lote (`id`, `lote_id` FK, `valor`).

No hay tablas de frecuencias todavía.

## 🚀 Comandos

### Backend
```bash
cd backend
npm install
npm run dev        # nodemon, puerto 3001
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # Vite, puerto 5173
```

## 🔌 Endpoints disponibles

| Método | Ruta            | Descripción                                            |
|--------|-----------------|--------------------------------------------------------|
| GET    | /api/lotes       | Lista todos los lotes (metadatos)                      |
| GET    | /api/lotes/:id   | Obtiene un lote con sus datos crudos                   |
| POST   | /api/lotes       | Recibe datos crudos: `{ nombre, descripcion, datos: [...] }` |

## Próximos pasos
- Construcción de la tabla de frecuencias sobre `valor` (agrupación en intervalos).
- Cálculo de medidas de tendencia central y dispersión.
- Persistir también los resultados calculados.