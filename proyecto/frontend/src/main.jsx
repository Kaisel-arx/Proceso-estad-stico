import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { TemaProvider } from './context/TemaContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import './styles/tema.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TemaProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </TemaProvider>
  </React.StrictMode>
);
