import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './components/Login';
import MenuPrincipal from './components/MenuPrincipal';
import HistorialTrabajos from './components/HistorialTrabajos';
import IngresoDatos from './components/IngresoDatos';

/**
 * Enruta la aplicacion entre las tres vistas segun la sesion:
 * sin usuario -> Login; con usuario -> menu, historial o trabajo.
 * El lote abierto vive aqui para que HistorialTrabajos pueda pasarlo a IngresoDatos.
 */
function App() {
  const { usuario, cargando } = useAuth();
  const [vista, setVista] = useState('menu');
  const [lote, setLote] = useState(null);

  if (cargando)
    return (
      <p className="arranque">
        <span className="punto-carga" aria-hidden="true" />
        Cargando sesión…
      </p>
    );
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
    <div className="aplicacion">
      <Navbar vista={vista} onMenu={irMenu} onHistorial={irHistorial} onNuevo={abrirNuevo} />

      {/* El area de trabajo es un dashboard de ancho completo: el main toma
          todo el ancho disponible en esa vista. */}
      <main className={`aplicacion-principal${vista === 'trabajo' ? ' aplicacion-principal--amplia' : ''}`}>
        {vista === 'menu' && <MenuPrincipal onNuevo={abrirNuevo} onHistorial={irHistorial} />}
        {vista === 'historial' && <HistorialTrabajos onCargar={abrirLote} onVolver={irMenu} />}
        {vista === 'trabajo' && <IngresoDatos key={claveTrabajo} lote={lote} />}
      </main>
    </div>
  );
}

export default App;
