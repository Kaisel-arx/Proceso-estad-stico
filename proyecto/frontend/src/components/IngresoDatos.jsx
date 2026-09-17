import { useState } from 'react';
import { guardarLote } from '../services/api';

const CANTIDAD_RANDOM = 40;
const MIN_VALOR = 10;
const MAX_VALOR = 90;

function generarDatosAleatorios(cantidad = CANTIDAD_RANDOM) {
  return Array.from(
    { length: cantidad },
    () => Math.floor(Math.random() * (MAX_VALOR - MIN_VALOR + 1)) + MIN_VALOR
  );
}

function convertirTextoADatos(texto) {
  return texto
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t !== '')
    .map(Number)
    .filter((v) => !Number.isNaN(v));
}

// Calcula estadisticos basicos en tiempo de ejecucion (frontend)
function calcularEstadisticos(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const n = ordenados.length;
  if (n === 0) return null;
  const xMin = ordenados[0];
  const xMax = ordenados[n - 1];
  const rango = xMax - xMin;
  return { n, xMin, xMax, rango };
}

function IngresoDatos() {
  const [texto, setTexto] = useState('');
  const [datos, setDatos] = useState([]);
  const [datosOrdenados, setDatosOrdenados] = useState([]);
  const [estadisticos, setEstadisticos] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [error, setError] = useState(null);

  const handleCambioTexto = (e) => {
    const valor = e.target.value;
    setTexto(valor);
    const numeros = convertirTextoADatos(valor);
    setDatos(numeros);
    setDatosOrdenados([...numeros].sort((a, b) => a - b));
    setEstadisticos(calcularEstadisticos(numeros));
    setMensaje(null);
    setError(null);
  };

  const handleGenerarAleatorios = () => {
    const muestra = generarDatosAleatorios();
    setDatos(muestra);
    setDatosOrdenados([...muestra].sort((a, b) => a - b));
    setTexto(muestra.join(', '));
    setEstadisticos(calcularEstadisticos(muestra));
    setMensaje(null);
    setError(null);
  };

  const handleGuardar = async () => {
    if (datos.length === 0) {
      setError('Ingresa o genera datos antes de guardar.');
      return;
    }

    try {
      const resultado = await guardarLote({
        nombre: `Lote ${new Date().toLocaleString()}`,
        descripcion: 'Datos crudos ingresados manualmente',
        datos,
      });
      setMensaje(
        `Lote guardado (id: ${resultado.id}, ${resultado.cantidad} valores). ` +
          `Estadisticos: n=${resultado.estadisticos.n}, ` +
          `Xmin=${resultado.estadisticos.xMin}, ` +
          `Xmax=${resultado.estadisticos.xMax}, ` +
          `R=${resultado.estadisticos.rango}`
      );
      setError(null);
    } catch (err) {
      setError(err.message);
      setMensaje(null);
    }
  };

  return (
    <section>
      <h2>Ingreso de datos</h2>
      <p>
        Escribe los numeros separados por comas, espacios o saltos de linea. Los datos se
        ordenan y calculan automaticamente.
      </p>

      <textarea
        rows={6}
        placeholder="Ej: 45, 67, 23, 89, 12, 58 ..."
        value={texto}
        onChange={handleCambioTexto}
        style={{ width: '100%', fontFamily: 'monospace' }}
      />

      <div style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0' }}>
        <button type="button" onClick={handleGenerarAleatorios}>
          Generar datos aleatorios
        </button>
        <button type="button" onClick={handleGuardar} disabled={datos.length === 0}>
          Guardar lote (API)
        </button>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {mensaje && <p style={{ color: 'green' }}>{mensaje}</p>}

      {/* Datos ordenados */}
      <h3>Datos ordenados ({datosOrdenados.length} valores)</h3>
      {datosOrdenados.length > 0 ? (
        <ul
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.35rem',
            listStyle: 'none',
            padding: 0,
          }}
        >
          {datosOrdenados.map((valor, i) => (
            <li
              key={`ord-${i}-${valor}`}
              style={{
                background: '#eef2ff',
                border: '1px solid #c7d2fe',
                borderRadius: 6,
                padding: '0.15rem 0.5rem',
                fontFamily: 'monospace',
              }}
            >
              {valor}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: '#666' }}>Aun no hay datos para mostrar.</p>
      )}

      {/* Estadisticos basicos en tiempo real */}
      {estadisticos && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0' }}> Calculo Estadistico </h3>
          <table style={{ borderCollapse: 'collapse', fontFamily: 'monospace' }}>
            <tbody>
              <tr>
                <td style={{ padding: '0.2rem 1rem 0.2rem 0', fontWeight: 'bold' }}>n (total datos)</td>
                <td>{estadisticos.n}</td>
              </tr>
              <tr>
                <td style={{ padding: '0.2rem 1rem 0.2rem 0', fontWeight: 'bold' }}>Xmin</td>
                <td>{estadisticos.xMin}</td>
              </tr>
              <tr>
                <td style={{ padding: '0.2rem 1rem 0.2rem 0', fontWeight: 'bold' }}>Xmax</td>
                <td>{estadisticos.xMax}</td>
              </tr>
              <tr>
                <td style={{ padding: '0.2rem 1rem 0.2rem 0', fontWeight: 'bold' }}>R (Rango)</td>
                <td>{estadisticos.rango}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default IngresoDatos;