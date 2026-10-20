import { useEffect, useState } from 'react';
import { eliminarLote, obtenerLotePorId, obtenerLotes } from '../services/api';

// El backend devuelve los TIMESTAMP en UTC sin zona horaria ("YYYY-MM-DD HH:MM:SS"): sin
// marcarlo como Z la fecha se interpretaria como hora local y saldria desplazada.
function formatearFecha(texto) {
  if (!texto) return '';
  const sinEspacio = texto.includes('T') ? texto : texto.replace(' ', 'T');
  const conZona = /Z|[+-]\d{2}:?\d{2}$/.test(sinEspacio) ? sinEspacio : `${sinEspacio}Z`;
  const fecha = new Date(conZona);
  if (Number.isNaN(fecha.getTime())) return texto;
  return fecha.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Historial de trabajos del usuario. Cada fila abre el lote completo desde el
 * backend y entrega el objeto a App, que lo pasa a IngresoDatos: al entrar con
 * los datos originales en el textarea, la tabla y las graficas se recalculan solas.
 */
function HistorialTrabajos({ onCargar, onVolver }) {
  const [lotes, setLotes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoId, setCargandoId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    obtenerLotes()
      .then((filas) => vivo && setLotes(filas))
      .catch((err) => vivo && setError(err.message))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, []);

  const cargar = async (lote) => {
    setCargandoId(lote.id);
    setError(null);
    try {
      onCargar(await obtenerLotePorId(lote.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargandoId(null);
    }
  };

  const borrar = async (lote) => {
    const seguro = window.confirm(`¿Eliminar "${lote.nombre}"? Esta acción no se puede deshacer.`);
    if (!seguro) return;
    setError(null);
    try {
      await eliminarLote(lote.id);
      setLotes((previos) => previos.filter((l) => l.id !== lote.id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section>
      <div className="vista-cabecera">
        <h1 className="vista-titulo">Historial de trabajos</h1>
        <button type="button" className="btn btn-secundario btn-compacto" onClick={onVolver}>
          Volver al menú
        </button>
      </div>

      {error && <p className="alerta alerta-error">{error}</p>}
      {cargando && <p style={{ color: 'var(--texto-suave)', fontSize: '0.9rem' }}>Cargando historial…</p>}

      {!cargando && !error && lotes.length === 0 && (
        <p className="vacio">Todavía no has guardado ningún trabajo. Crea una nueva hoja para empezar.</p>
      )}

      {lotes.length > 0 && (
        <ul className="historial-lista">
          {lotes.map((lote) => (
            <li key={lote.id} className="historial-fila">
              <button
                type="button"
                className="historial-item"
                onClick={() => cargar(lote)}
                disabled={cargandoId !== null}
                title="Abrir este trabajo"
              >
                <span>
                  <span className="historial-nombre">{lote.nombre}</span>
                  <span className="historial-meta">{formatearFecha(lote.creado_en)}</span>
                </span>
                <span className="chip chip-calido">
                  {cargandoId === lote.id
                    ? 'Abriendo…'
                    : `${lote.cantidad} ${lote.cantidad === 1 ? 'dato' : 'datos'}`}
                </span>
              </button>
              <button
                type="button"
                className="btn btn-peligro"
                style={{ borderRadius: 0, border: 'none', borderLeft: '1px solid var(--borde)' }}
                onClick={() => borrar(lote)}
                title={`Eliminar ${lote.nombre}`}
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default HistorialTrabajos;
