import { useEffect, useMemo, useState } from 'react';
import { actualizarLote, guardarLote } from '../services/api';
import { calcularTablaFrecuencias } from '../stats/frecuencias';
import Workspace from './workspace/Workspace';
import Tarjeta from './ui/Tarjeta';

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

// Los estadisticos basicos (n, Xmin, Xmax, rango) los calcula y muestra
// ParametrosGenerales dentro del workspace, asi que aqui no se duplica ese
// calculo: solo se construye la tabla una vez por lote de valores y se pasa
// a <Workspace>.
//
// La prop `lote` viene del historial: al entrar con los datos originales en
// el textarea el mismo ciclo de render que ya existia recalcula la tabla y
// las graficas, sin codigo de recarga adicional. Si hay lote, guardar
// actualiza ese registro en vez de duplicarlo.
function IngresoDatos({ lote = null }) {
  const [texto, setTexto] = useState('');
  const [datos, setDatos] = useState([]);
  const [rechazados, setRechazados] = useState([]);
  const [nombreProyecto, setNombreProyecto] = useState('');
  const [loteId, setLoteId] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  // Zona de entrada: abierta por omision; al cargar un trabajo del historial
  // se cierra para mostrar de inmediato el dashboard.
  const [zonaAbierta, setZonaAbierta] = useState(true);

  useEffect(() => {
    if (lote) {
      const valores = Array.isArray(lote.datos) ? lote.datos : [];
      setTexto(valores.join(', '));
      setDatos(valores);
      setLoteId(lote.id);
      setNombreProyecto(lote.nombre || '');
      setZonaAbierta(false);
    } else {
      setTexto('');
      setDatos([]);
      setLoteId(null);
      setNombreProyecto('');
      setZonaAbierta(true);
    }
    setRechazados([]);
    setMensaje(null);
    setError(null);
  }, [lote]);

  // La tabla de frecuencias se recalcula solo cuando cambian los valores:
  // con el cursor en la tabla o en las graficas no se vuelve a ejecutar el
  // motor.
  const tabla = useMemo(
    () => (datos.length > 0 ? calcularTablaFrecuencias(datos) : null),
    [datos]
  );

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

  // Bloque de captura de datos, disenado compacto: nombre y textarea en una
  // sola fila horizontal, acciones fluidas debajo. Se incrusta en la franja
  // superior del bento del workspace (o va solo en la vista inicial).
  const bloqueEntrada = (
    <Tarjeta
      titulo={lote ? 'Trabajo cargado' : 'Ingreso de datos'}
      meta={datos.length > 0 ? `n = ${datos.length}` : 'Sin datos'}
      acciones={
        <button
          type="button"
          className="btn btn-herramienta btn-compacto"
          onClick={() => setZonaAbierta((abierta) => !abierta)}
          aria-expanded={zonaAbierta}
          aria-controls="zona-datos-cuerpo"
        >
          {zonaAbierta ? 'Ocultar datos' : 'Editar datos'}
        </button>
      }
    >
      <div id="zona-datos-cuerpo" className="zona-datos-cuerpo" hidden={!zonaAbierta}>
        <div className="entrada-rejilla">
          <label className="campo">
            <span className="campo-etiqueta">Nombre del proyecto</span>
            <input
              className="entrada"
              type="text"
              value={nombreProyecto}
              onChange={(e) => setNombreProyecto(e.target.value)}
              placeholder="Ej: Examen parcial, Práctica 3 ..."
            />
          </label>

          <label className="campo">
            <span className="campo-etiqueta">
              Datos separados por comas, espacios o saltos de línea · se calcula automáticamente
            </span>
            <textarea
              className="entrada entrada-mono"
              rows={2}
              placeholder="Ej: 45, 67, 23, 89, 12, 58 ..."
              value={texto}
              onChange={handleCambioTexto}
            />
          </label>
        </div>

        <div className="entrada-acciones">
          <button type="button" className="btn btn-secundario btn-compacto" onClick={handleGenerarAleatorios}>
            Generar datos aleatorios
          </button>
          <button type="button" className="btn btn-primario btn-compacto" onClick={handleGuardar} disabled={!puedeGuardar}>
            {guardando
              ? 'Guardando...'
              : loteId
                ? 'Guardar cambios'
                : 'Guardar trabajo'}
          </button>
          {loteId && <span className="campo-nota">Se actualizará el trabajo #{loteId}</span>}
        </div>

        {rechazados.length > 0 && (
          <p className="alerta alerta-aviso">
            <strong>{rechazados.length}</strong> valor(es) no se interpretaron como número y se
            ignoraron: {rechazados.slice(0, MAX_RECHAZADOS).join(', ')}
            {rechazados.length > MAX_RECHAZADOS && ` y ${rechazados.length - MAX_RECHAZADOS} más`}
          </p>
        )}

        {datos.length === 1 && (
          <p className="alerta alerta-aviso">
            Se requiere al menos 2 valores numéricos para calcular la distribución.
          </p>
        )}

        {error && <p className="alerta alerta-error">{error}</p>}
        {mensaje && <p className="alerta alerta-exito">{mensaje}</p>}
      </div>
    </Tarjeta>
  );

  // Sin datos todavia: la entrada va sola, centrada. Con datos, la entrada
  // viaja al workspace y encabeza la columna izquierda.
  if (!tabla) {
    return (
      <section className="workspace-entrada-inicial">
        {bloqueEntrada}
      </section>
    );
  }

  return (
    <Workspace
      tabla={tabla}
      valores={datos}
      nombreProyecto={nombreProyecto}
      bloqueEntrada={bloqueEntrada}
    />
  );
}

export default IngresoDatos;
