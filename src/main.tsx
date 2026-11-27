import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PrivateGate } from './ui/PrivateGate';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrivateGate><App /></PrivateGate>
  </React.StrictMode>,
);
