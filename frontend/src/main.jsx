import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'
import { CarbonIntensityProvider } from './context/CarbonIntensityProvider.jsx'
import { CommunityCostProvider } from './context/CommunityCostProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <CommunityCostProvider>
        <CarbonIntensityProvider>
          <App />
        </CarbonIntensityProvider>
      </CommunityCostProvider>
    </BrowserRouter>
  </StrictMode>,
)
