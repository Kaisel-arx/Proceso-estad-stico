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
│   │   ├── db.js                  # Pool MySQL + esquema (DDL) inicial
│   │   └── routes/
│   │       └── datos.routes.js    # Endpoints para lotes de datos
│   ├── .env.example               # Plantilla de variables (DB_HOST, DB_USER, ...)
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

## 🗄️ Base de datos MySQL

El backend se conecta a un servidor MySQL externo (`mysql2`, pool de conexiones con
reintentos). Copia `.env.example` a `.env` y completa `DB_HOST`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME` (y `DB_PORT` si no es 3306); si la base no existe se crea
en el primer arranque.

Seis tablas, creadas automáticamente al iniciar el backend:

- `usuarios`: cuentas (`usuario`, `email` únicos, hash de contraseña) y, para la
  recuperación de contraseña, `reset_token` (SHA‑256 del código de 6 dígitos) y
  `token_expiration` (caducidad, 10 minutos).
- `lotes_datos`: un lote/muestra y sus metadatos (`nombre`, `descripcion`,
  `cantidad`, `usuario_id` FK → `usuarios`).
- `datos`: cada valor crudo del lote (`lote_id` FK, `valor`).
- `estadisticos_basicos` / `estadisticos_avanzados`: medidas guardadas por lote.
- `tabla_frecuencias`: snapshot de la tabla de frecuencias por lote.

Las tablas hijas tienen `ON DELETE CASCADE` sobre `lote_id`.

## 🚀 Comandos

### Backend
```bash
cd backend
copy .env.example .env   # y completa tus credenciales de MySQL
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
| POST   | /api/auth/forgot-password | `{ email }`: genera el código y lo manda por correo |
| POST   | /api/auth/verify-code      | `{ email, codigo }`: valida el código y abre sesión  |
| POST   | /api/auth/restablecer-password | `{ password }` (sesión de recuperación): cambia la clave |

### Recuperación de contraseña

Desde el enlace "¿Has olvidado tu contraseña?" del login: el backend manda un
código de 6 dígitos (un solo uso, caduca en 10 minutos, guardado hasheado),
`verify-code` devuelve la sesión para entrar directamente y, opcionalmente, se
cambia la contraseña con `restablecer-password`.

El envío usa Nodemailer con `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y
`MAIL_FROM` en `.env`; **sin `SMTP_HOST` los códigos se imprimen en la consola
del servidor** (solo sirve para desarrollo). Todas las respuestas del flujo son
iguales exista o no la cuenta, para no descubrir correos registrados.

## Próximos pasos
- Construcción de la tabla de frecuencias sobre `valor` (agrupación en intervalos).
- Cálculo de medidas de tendencia central y dispersión.
- Persistir también los resultados calculados.