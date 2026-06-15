import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom';
import '@/css/reset.css'
import '@/css/board.css'
import App from './App.jsx'

createRoot(document.getElementById('wrap')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);