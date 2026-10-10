import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './components/Login';
import MenuPrincipal from './components/MenuPrincipal';
import HistorialTrabajos from './components/HistorialTrabajos';
import IngresoDatos from './components/IngresoDatos';

const estilos = {
  app: { minHeight: '100vh', background: 'var(--bg)' },
  principal: { maxWidth: 980, margin: '0 auto', padding: '2rem 1.25rem 4rem' },
  arranque: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--texto-tenue)',
  },
};

/**
 * Enruta la aplicacion entre las tres vistas segun la sesion:
 * sin usuario -> Login; con usuario -> menu, historial o trabajo.
 * El lote abierto vive aqui para que HistorialTrabajos pueda pasarlo a IngresoDatos.
 */
function App() {
  const { usuario, cargando } = useAuth();
  const [vista, setVista] = useState('menu');
  const [lote, setLote] = useState(null);

  if (cargando) return <p style={estilos.arranque}>Cargando sesión…</p>;
  if (!usuario) return <Login />;

  const irMenu = () => setVista('menu');
  const irHistorial = () => setVista('historial');

  const abrirNuevo = () => {
    setLote(null);
    setVista('trabajo');
  };

  const abrirLote = (loteCargado) => {
    setLote(loteCargado);
    setVista('trabajo');
  };

  // La key reinicia el estado interno de IngresoDatos al cambiar de lote o de
  // "nuevo": asi no quedan avisos, colores ni medidas de la vista anterior.
  const claveTrabajo = lote ? `lote-${lote.id}` : 'nuevo';

  return (
    <div style={estilos.app}>
      <Navbar vista={vista} onMenu={irMenu} onHistorial={irHistorial} onNuevo={abrirNuevo} />

      <main style={estilos.principal}>
        {vista === 'menu' && <MenuPrincipal onNuevo={abrirNuevo} onHistorial={irHistorial} />}
        {vista === 'historial' && <HistorialTrabajos onCargar={abrirLote} onVolver={irMenu} />}
        {vista === 'trabajo' && <IngresoDatos key={claveTrabajo} lote={lote} />}
      </main>
    </div>
  );
}

export default App;
