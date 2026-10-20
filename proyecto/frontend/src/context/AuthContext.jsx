import { createContext, useContext, useEffect, useState } from 'react';
import { borrarToken, obtenerSesion, obtenerToken, guardarToken } from '../services/api';

const AuthContexto = createContext(null);

/**
 * Sesion del usuario. Al montar, si hay un token guardado se revalida contra
 * /auth/me: asi una sesion expirada devuelve al login en el arranque en vez de
 * dejar la interfaz pidiendo lotes con un token viejo.
 */
export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        if (!obtenerToken()) return;
        const sesion = await obtenerSesion();
        if (vivo) setUsuario(sesion);
      } catch {
        borrarToken();
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  // Tanto el login como el registro devuelven la misma forma { token, usuario }.
  const iniciarSesion = (sesion) => {
    guardarToken(sesion.token);
    setUsuario(sesion.usuario);
  };

  const cerrarSesion = () => {
    borrarToken();
    setUsuario(null);
  };

  return (
    <AuthContexto.Provider value={{ usuario, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContexto.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContexto);
}
