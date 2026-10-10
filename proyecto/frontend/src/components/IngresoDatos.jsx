import { useEffect, useState } from 'react';
import { actualizarLote, guardarLote } from '../services/api';
import TablaFrecuencias from './TablaFrecuencias';

const CANTIDAD_RANDOM = 40;
const MIN_VALOR = 10;
const MAX_VALOR = 90;
const MAX_RECHAZADOS = 8;

function generarDatosAleatorios(cantidad = CANTIDAD_RANDOM) {
  return Array.from(
    { length: cantidad },
    () => Math.floor(Math.random() * (MAX_VALOR - MIN_VALOR + 1)) + MIN_VALOR
  );
}

/**
 * Convierte el texto ingresado en numeros.
 * A diferencia de la version anterior no descarta tokens en silencio:
 * Number('') es 0 y Number('abc') es NaN, asi que se separa lo valido de lo rechazable.
 */
function convertirTextoADatos(texto) {
  const tokens = texto.split(/[\s,;]+/).map((t) => t.trim()).filter((t) => t !== '');

  const valores = [];
  const rechazados = [];

  tokens.forEach((token) => {
    const numero = Number(token);
    if (Number.isFinite(numero)) {
      valores.push(numero);
    } else {
      rechazados.push(token);
    }
  });

  return { valores, rechazados };
}

// Los estadisticos basicos (n, Xmin, Xmax, rango) los calcula y muestra TablaFrecuencias,
// asi que aqui no se duplica ese calculo.
//
// La prop `lote` viene del historial: al entrar con los datos originales en el textarea
// el mismo ciclo de render que ya existia recalcula la tabla y las graficas, sin codigo
// de recarga adicional. Si hay lote, guardar actualiza ese registro en vez de duplicarlo.
function IngresoDatos({ lote = null }) {
  const [texto, setTexto] = useState('');
  const [datos, setDatos] = useState([]);
  const [rechazados, setRechazados] = useState([]);
  const [nombreProyecto, setNombreProyecto] = useState('');
  const [loteId, setLoteId] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (lote) {
      const valores = Array.isArray(lote.datos) ? lote.datos : [];
      setTexto(valores.join(', '));
      setDatos(valores);
      setLoteId(lote.id);
      setNombreProyecto(lote.nombre || '');
    } else {
      setTexto('');
      setDatos([]);
      setLoteId(null);
      setNombreProyecto('');
    }
    setRechazados([]);
    setMensaje(null);
    setError(null);
  }, [lote]);

  const aplicarDatos = (valores, rechazadosTokens) => {
    setDatos(valores);
    setRechazados(rechazadosTokens);
    setMensaje(null);
    setError(null);
  };

  const handleCambioTexto = (e) => {
    const valor = e.target.value;
    setTexto(valor);
    const { valores, rechazados: descartados } = convertirTextoADatos(valor);
    aplicarDatos(valores, descartados);
  };

  const handleGenerarAleatorios = () => {
    const muestra = generarDatosAleatorios();
    setTexto(muestra.join(', '));
    aplicarDatos(muestra, []);
  };

  const handleGuardar = async () => {
    if (datos.length < 2) {
      setError(`Se necesitan al menos 2 valores numericos. Ahora hay ${datos.length}.`);
      setMensaje(null);
      return;
    }

    const nombre = nombreProyecto.trim() || `Proyecto ${new Date().toLocaleString('es-ES')}`;
    const cuerpo = {
      nombre,
      descripcion: 'Datos crudos ingresados manualmente',
      datos,
    };

    setGuardando(true);
    try {
      if (loteId) {
        await actualizarLote(loteId, cuerpo);
        setMensaje(`Trabajo "${nombre}" actualizado (${datos.length} valores).`);
      } else {
        const resultado = await guardarLote(cuerpo);
        // Pasa a modo edicion: un segundo guardado actualiza en vez de duplicar.
        setLoteId(resultado.id);
        setMensaje(`Trabajo "${nombre}" guardado (${resultado.cantidad} valores).`);
      }
      setError(null);
    } catch (err) {
      setError(err.message);
      setMensaje(null);
    } finally {
      setGuardando(false);
    }
  };

  const puedeGuardar = datos.length >= 2 && !guardando;

  return (
    <section>
      <h2 style={{ margin: '0 0 0.35rem 0', color: 'var(--texto)' }}>
        {lote ? 'Trabajo cargado' : 'Ingreso de datos'}
      </h2>
      <p style={{ margin: '0 0 1rem 0', color: 'var(--texto-tenue)' }}>
        Escribe los numeros separados por comas, espacios o saltos de linea. La
        distribucion de frecuencias se calcula automaticamente.
      </p>

      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        <span
          style={{
            display: 'block',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--texto-tenue)',
            marginBottom: '0.25rem',
          }}
        >
          Nombre del proyecto
        </span>
        <input
          type="text"
          value={nombreProyecto}
          onChange={(e) => setNombreProyecto(e.target.value)}
          placeholder="Ej: Examen parcial, Practica 3 ..."
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '0.5rem 0.6rem',
            fontSize: '0.9rem',
            color: 'var(--texto)',
            background: 'var(--superficie-2)',
            border: '1px solid var(--borde-fuerte)',
            borderRadius: 8,
          }}
        />
      </label>

      <textarea
        rows={6}
        placeholder="Ej: 45, 67, 23, 89, 12, 58 ..."
        value={texto}
        onChange={handleCambioTexto}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: 'monospace',
          padding: '0.55rem 0.6rem',
          fontSize: '0.9rem',
          color: 'var(--texto)',
          background: 'var(--superficie-2)',
          border: '1px solid var(--borde-fuerte)',
          borderRadius: 8,
          resize: 'vertical',
        }}
      />

      <div style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0', flexWrap: 'wrap' }}>
        <button type="button" onClick={handleGenerarAleatorios}>
          Generar datos aleatorios
        </button>
        <button type="button" onClick={handleGuardar} disabled={!puedeGuardar}>
          {guardando
            ? 'Guardando...'
            : loteId
              ? 'Guardar cambios'
              : 'Guardar trabajo (API)'}
        </button>
        {loteId && <span style={{ alignSelf: 'center', fontSize: '0.75rem', color: 'var(--texto-suave)' }}>
          Se actualizará el trabajo #{loteId}
        </span>}
      </div>

      {rechazados.length > 0 && (
        <p
          style={{
            background: 'var(--alerta-fondo)',
            border: '1px solid var(--alerta-borde)',
            borderRadius: 8,
            padding: '0.5rem 0.75rem',
            margin: '0 0 0.75rem 0',
            fontSize: '0.85rem',
            color: 'var(--alerta-texto)',
          }}
        >
          <strong>{rechazados.length}</strong> valor(es) no se interpretaron como numero y se
          ignoraron: {rechazados.slice(0, MAX_RECHAZADOS).join(', ')}
          {rechazados.length > MAX_RECHAZADOS && ` y ${rechazados.length - MAX_RECHAZADOS} mas`}
        </p>
      )}

      {datos.length === 1 && (
        <p style={{ color: 'var(--aviso)', margin: '0 0 0.75rem 0' }}>
          Se requiere al menos 2 valores numericos para calcular la distribucion.
        </p>
      )}

      {error && <p style={{ color: 'var(--error)', margin: '0 0 0.75rem 0' }}>{error}</p>}
      {mensaje && <p style={{ color: 'var(--exito)', margin: '0 0 0.75rem 0' }}>{mensaje}</p>}

      {/* Tabla de frecuencias: datos iniciales y tabla viven en una sola tarjeta */}
      {datos.length > 0 && <TablaFrecuencias valores={datos} />}
    </section>
  );
}

export default IngresoDatos;
