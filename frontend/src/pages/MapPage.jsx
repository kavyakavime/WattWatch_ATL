import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../config.js'
import { useCarbonIntensity } from '../context/useCarbonIntensity'
import AtlantaMap from '../components/map/AtlantaMap'
import './MapPage.css'

function formatMw(n) {
  return `${new Intl.NumberFormat('en-US').format(n)} MW`
}

export default function MapPage() {
  const { loading: carbonLoading, current, unit } = useCarbonIntensity()
  const [datacenters, setDatacenters] = useState([])
  const [dcError, setDcError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/atlanta-datacenters`)
      .then((r) => {
        if (!r.ok) throw new Error('datacenters')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setDatacenters(Array.isArray(data) ? data : [])
        setDcError(null)
      })
      .catch(() => {
        if (cancelled) return
        setDcError('Could not load data centers')
        setDatacenters([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const totalMw = useMemo(
    () =>
      datacenters.reduce((sum, dc) => sum + Number(dc.capacity_mw || 0), 0),
    [datacenters],
  )

  const intensityDisplay =
    !carbonLoading && current != null
      ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(current)} ${unit}`
      : carbonLoading
        ? '…'
        : '—'

  return (
    <article className="map-page">
      <header className="map-page__header">
        <h1 className="map-page__title">Atlanta Energy Map</h1>
        <p className="map-page__lede">
          Live grid carbon intensity and hyperscale load across the metro —
          circle size reflects nameplate MW; color reflects reported renewable
          share.
        </p>
      </header>

      {dcError && (
        <p className="map-page__banner" role="alert">
          {dcError}
        </p>
      )}

      <AtlantaMap datacenters={datacenters} />

      <section className="map-page__stats" aria-label="Grid and capacity summary">
        <div className="map-page__stat">
          <span className="map-page__stat-label">Total data center capacity</span>
          <span className="map-page__stat-value">{formatMw(totalMw || 2185)}</span>
        </div>
        <div className="map-page__stat">
          <span className="map-page__stat-label">
            Grid powered by natural gas right now
          </span>
          <span className="map-page__stat-value">40%</span>
        </div>
        <div className="map-page__stat">
          <span className="map-page__stat-label">Equivalent homes powered</span>
          <span className="map-page__stat-value">847K homes</span>
        </div>
        <div className="map-page__stat">
          <span className="map-page__stat-label">Grid intensity now</span>
          <span className="map-page__stat-value">{intensityDisplay}</span>
        </div>
      </section>
    </article>
  )
}
