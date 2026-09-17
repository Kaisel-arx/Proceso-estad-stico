import IngresoDatos from './components/IngresoDatos';

function App() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Tabla estadística (UMG)</h1>
      <p>Muestras numéricas.</p>
      <IngresoDatos />
    </div>
  );
}

export default App;