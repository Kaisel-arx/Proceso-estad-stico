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
│   │   ├── db.js                  # Pool MySQL + esquema (DDL) y migraciones
│   │   ├── auth.js                # Hash de contraseñas (bcrypt) y tokens (JWT)
│   │   ├── mailer.js              # Nodemailer: envío de códigos OTP (en pausa)
│   │   ├── middleware/auth.js     # Exige sesión válida
│   │   └── routes/
│   │       ├── auth.routes.js     # Registro, login y flujo OTP (en pausa)
│   │       └── datos.routes.js    # Endpoints para lotes de datos
│   ├── .env.example               # Plantilla de variables (DB_HOST, SMTP_HOST, ...)
│   ├── .gitignore
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx
    │   ├── context/AuthContext.jsx  # Sesión (token en localStorage + revalidación)
    │   ├── components/
    │   │   ├── Login.jsx           # Acceso y registro (acceso directo)
    │   │   ├── VerificarCorreo.jsx # Pantalla del código de 6 dígitos (en pausa)
    │   │   ├── RecuperarContrasena.jsx # Recuperación en dos pasos (en pausa)
    │   │   ├── Mensajes.jsx        # Banner y spinner compartidos
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

- `usuarios`: cuentas (`usuario`, `email` únicos, hash de contraseña) y el estado
  del flujo por correo (columnas conservadas para la reversión, hoy sin uso):
  `estado_cuenta` (`pendiente` al registrarse con el flujo por correo,
  `activo` al verificar; con el flujo en pausa el alta nace directamente
  `activo`), `codigo_verificacion` (SHA‑256 del código de 6 dígitos del
  alta), `codigo_recuperacion` (SHA‑256 del código de recuperación) y
  `expiracion_codigo` (caducidad, 15 minutos). El código **nunca** se guarda en
  claro: solo su hash.
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
| POST   | /api/auth/registro | `{ usuario, email, password }`: crea la cuenta `activo` y abre sesión al momento |
| POST   | /api/auth/login  | `{ identificador, password }`: inicia sesión (usuario o correo) |
| GET    | /api/auth/me     | Revalida el token y devuelve la sesión vigente          |

### Alta en un solo paso (verificación por correo en pausa)

El acceso es directo: `registro` crea la cuenta en estado `activo` y devuelve la
sesión (`token` + `usuario`), así que quien se registra entra al panel sin
pasos intermedios. `login` se comporta igual, con usuario o con correo.

El interruptor está en el código, no en las variables de entorno:
`VERIFICACION_POR_CORREO` en `backend/src/mailer.js` (actualmente `false`).
Con `false`, los cuatro endpoints del flujo por correo —
`verificar-cuenta`, `reenviar-verificacion`, `forgot-password` y
`restablecer-password` — responden **404**, y el frontend no muestra las
pantallas de código ni de recuperación.

El código de esos cuatro endpoints sigue intacto: para reactivar el flujo
basta con poner `VERIFICACION_POR_CORREO` en `true`, restaurar en
`backend/src/server.js` la llamada a `diagnosticarCorreo()` y volver a
importar `VerificarCorreo` y `RecuperarContrasena` en
`frontend/src/components/Login.jsx`.

Lo que sí se conserva, para la reversión:

- La tabla `usuarios` sigue con `estado_cuenta` (`pendiente`/`activo`),
  `codigo_verificacion`, `codigo_recuperacion` y `expiracion_codigo`. Una
  cuenta que quedó `pendiente` con el flujo anterior se activa sola al iniciar
  sesión.
- `api.js` sigue exportando `verificarCuenta`, `reenviarVerificacion`,
  `solicitarCodigoRecuperacion` y `restablecerContrasena`, y los componentes
  `VerificarCorreo.jsx` y `RecuperarContrasena.jsx` siguen en el repositorio.
- Los códigos de 6 dígitos se generan con `crypto.randomInt` (uniforme, sin el
  sesgo de `Math.random() % n`), caducan en 15 minutos, son de un solo uso y
  guardan solo su SHA‑256.

El envío usaba Nodemailer con `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS` y `MAIL_FROM` en `.env`; con el flujo en pausa esas variables son
opcionales y la aplicación no necesita SMTP para funcionar.

## Próximos pasos
- Construcción de la tabla de frecuencias sobre `valor` (agrupación en intervalos).
- Cálculo de medidas de tendencia central y dispersión.
- Persistir también los resultados calculados.