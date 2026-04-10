import { useEffect, useState } from 'react'
import { API_BASE } from '../config.js'
import { CarbonIntensityContext } from './carbonIntensity.js'

export function CarbonIntensityProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [current, setCurrent] = useState(null)
  const [unit, setUnit] = useState('gCO2eq/kWh')
  const [history, setHistory] = useState([])

  useEffect(() => {
    let cancelled = false
    const url = `${API_BASE}/api/carbon-intensity`
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setCurrent(typeof data.current === 'number' ? data.current : null)
        setUnit(typeof data.unit === 'string' ? data.unit : 'gCO2eq/kWh')
        setHistory(Array.isArray(data.history) ? data.history : [])
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e)
        setCurrent(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = { loading, error, current, unit, history }
  return (
    <CarbonIntensityContext.Provider value={value}>
      {children}
    </CarbonIntensityContext.Provider>
  )
}
