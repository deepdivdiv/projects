import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom';
import '@/css/scss/reset.scss'
import '@/css/scss/board.scss'
import App from './App.jsx'

createRoot(document.getElementById('wrap')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);