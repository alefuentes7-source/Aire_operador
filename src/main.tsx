import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './lib/auth'
import { SimulatedDateProvider } from './lib/simulatedDate'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SimulatedDateProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </SimulatedDateProvider>
  </React.StrictMode>,
)
