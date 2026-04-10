import L from 'leaflet'
import { useMemo } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import './AtlantaMap.css'

const ATL_CENTER = [33.749, -84.388]
const ZOOM = 10
const TILE_URL =
  'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noreferrer">Stadia Maps</a> ' +
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'

function renewableFillColor(pct) {
  if (pct > 30) return '#00ff88'
  if (pct >= 15) return '#ffaa00'
  return '#ff4444'
}

export default function AtlantaMap({ datacenters }) {
  const retinaSuffix = useMemo(
    () => (typeof window !== 'undefined' && L.Browser.retina ? '@2x' : ''),
    [],
  )

  return (
    <div className="atlanta-map__shell">
      <MapContainer
        center={ATL_CENTER}
        zoom={ZOOM}
        className="atlanta-map__leaflet"
        scrollWheelZoom
        aria-label="Atlanta data centers map"
      >
        <TileLayer
          attribution={TILE_ATTRIBUTION}
          url={TILE_URL}
          maxZoom={20}
          r={retinaSuffix}
        />
        {datacenters.map((dc) => {
          const pct = Number(dc.renewable_pct)
          const mw = Number(dc.capacity_mw)
          const fill = renewableFillColor(pct)
          const radius = Math.max(4, mw / 20)
          return (
            <CircleMarker
              key={dc.name}
              center={[dc.lat, dc.lon]}
              radius={radius}
              pathOptions={{
                color: fill,
                fillColor: fill,
                fillOpacity: 0.45,
                weight: 2,
              }}
            >
              <Popup>
                <div className="atlanta-map__popup">
                  <strong>{dc.name}</strong>
                  <div>County: {dc.county}</div>
                  <div>Estimated MW: {mw}</div>
                  <div>PUE: {dc.pue}</div>
                  <div>Renewable: {pct}%</div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
      <div className="atlanta-map__legend" role="group" aria-label="Renewable energy legend">
        <div className="atlanta-map__legend-title">Renewable share</div>
        <div className="atlanta-map__legend-row">
          <span className="atlanta-map__legend-swatch atlanta-map__legend-swatch--high" />
          <span>&gt;30%</span>
        </div>
        <div className="atlanta-map__legend-row">
          <span className="atlanta-map__legend-swatch atlanta-map__legend-swatch--mid" />
          <span>15–30%</span>
        </div>
        <div className="atlanta-map__legend-row">
          <span className="atlanta-map__legend-swatch atlanta-map__legend-swatch--low" />
          <span>&lt;15%</span>
        </div>
      </div>
    </div>
  )
}
