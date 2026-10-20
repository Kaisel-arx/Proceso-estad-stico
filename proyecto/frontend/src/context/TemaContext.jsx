import { createContext, useContext, useEffect, useState } from 'react';

const CLAVE = 'tema';
const TemaContexto = createContext(null);

/**
 * Tema de la aplicacion. El estado vive aqui y se refleja en el atributo
 * data-tema de <html>, que es lo que enciende las variables de tema.css.
 * Arranca en oscuro, que es el tono principal de la paleta de StatLab, y se
 * persiste en localStorage para que la preferencia sobreviva a un recargado.
 */
export function TemaProvider({ children }) {
  const [tema, setTema] = useState(() => localStorage.getItem(CLAVE) || 'oscuro');

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    localStorage.setItem(CLAVE, tema);
  }, [tema]);

  const alternar = () => setTema((actual) => (actual === 'claro' ? 'oscuro' : 'claro'));

  return (
    <TemaContexto.Provider value={{ tema, esOscuro: tema === 'oscuro', alternar }}>
      {children}
    </TemaContexto.Provider>
  );
}

export function useTema() {
  return useContext(TemaContexto);
}
