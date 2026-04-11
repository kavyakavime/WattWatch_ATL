import L from 'leaflet'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import { useCarbonIntensity } from '../../context/useCarbonIntensity'
import './AtlantaMap.css'

const MAP_CENTER = [33.5, -84.2]
const DEFAULT_ZOOM = 9
const FIT_PADDING = 60

const TILE_URL =
  'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noreferrer">Stadia Maps</a> ' +
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renewableFillColor(pct) {
  if (pct > 30) return '#00ff88'
  if (pct >= 15) return '#ffaa00'
  return '#ff4444'
}

function haloRgbaForFill(fill) {
  if (fill === '#00ff88') return 'rgba(0, 255, 136, 0.3)'
  if (fill === '#ffaa00') return 'rgba(255, 170, 0, 0.3)'
  return 'rgba(255, 68, 68, 0.3)'
}

/** Great-circle distance in miles */
function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function buildDataCenterIcon(dc) {
  const fill = renewableFillColor(Number(dc.renewable_pct))
  const haloBg = haloRgbaForFill(fill)
  const cw = 152
  const html = `
    <div class="atlanta-map__dc-marker-root" style="width:${cw}px">
      <div class="atlanta-map__dc-ring-wrap">
        <div class="atlanta-map__dc-halo" style="background:${haloBg}"></div>
        <div class="atlanta-map__dc-core" style="background-color:${fill}"></div>
      </div>
      <div class="atlanta-map__dc-name-pill">${escapeHtml(dc.name)}</div>
    </div>
  `

  return L.divIcon({
    className: 'atlanta-map__dc-leaflet-icon',
    html,
    iconSize: [cw, 52],
    iconAnchor: [cw / 2, 12],
    popupAnchor: [0, -10],
  })
}

const USER_RING = 26
const USER_ICON_W = 104
const USER_ICON_H = 54

function buildUserLocationIcon() {
  const html = `
    <div class="atlanta-map__user-marker-root" style="width:${USER_ICON_W}px">
      <div class="atlanta-map__user-ring-wrap">
        <div class="atlanta-map__user-halo"></div>
        <div class="atlanta-map__user-core"></div>
      </div>
      <div class="atlanta-map__user-label">You are here</div>
    </div>
  `
  return L.divIcon({
    className: 'atlanta-map__user-leaflet-icon',
    html,
    iconSize: [USER_ICON_W, USER_ICON_H],
    iconAnchor: [USER_ICON_W / 2, USER_RING / 2],
    popupAnchor: [0, -8],
  })
}

const userLocationIcon = buildUserLocationIcon()

function MapInvalidateSize() {
  const map = useMap()
  useEffect(() => {
    const t = window.setTimeout(() => {
      map.invalidateSize()
    }, 300)
    return () => window.clearTimeout(t)
  }, [map])
  return null
}

function FitBoundsOnData({ dcPositions, userPosition, padding }) {
  const map = useMap()

  useEffect(() => {
    if (!dcPositions?.length) return
    const pts = [...dcPositions]
    if (
      userPosition &&
      userPosition.length === 2 &&
      Number.isFinite(userPosition[0]) &&
      Number.isFinite(userPosition[1])
    ) {
      pts.push(userPosition)
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [padding, padding] })
  }, [map, dcPositions, userPosition, padding])

  return null
}

function DataCenterPopupBody({ dc, distanceMiles }) {
  const pct = Math.min(100, Math.max(0, Number(dc.renewable_pct) || 0))
  return (
    <div className="atlanta-map__popup-card">
      <div className="atlanta-map__popup-title">{dc.name}</div>
      <dl className="atlanta-map__popup-grid">
        <dt>County</dt>
        <dd>{dc.county}</dd>
        <dt>Capacity (MW)</dt>
        <dd>{dc.capacity_mw}</dd>
        <dt>PUE</dt>
        <dd>{dc.pue}</dd>
        <dt>Renewable %</dt>
        <dd>{dc.renewable_pct}%</dd>
      </dl>
      {distanceMiles != null && (
        <p className="atlanta-map__popup-distance">
          {distanceMiles.toFixed(1)} miles from you
        </p>
      )}
      <div className="atlanta-map__popup-score" aria-hidden="true">
        <div
          className="atlanta-map__popup-score-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function AtlantaMap({ datacenters }) {
  const mapRef = useRef(null)
  const { loading: carbonLoading, current, unit } = useCarbonIntensity()
  const [updatedAt, setUpdatedAt] = useState(null)
  const [userLatLng, setUserLatLng] = useState(null)

  useEffect(() => {
    if (carbonLoading || current == null) return
    const t = window.setTimeout(() => setUpdatedAt(new Date()), 0)
    return () => window.clearTimeout(t)
  }, [carbonLoading, current])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLatLng([pos.coords.latitude, pos.coords.longitude])
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    )
  }, [])

  const dcPositions = useMemo(
    () =>
      datacenters.map((dc) => [Number(dc.lat), Number(dc.lon)]).filter(
        (p) => Number.isFinite(p[0]) && Number.isFinite(p[1]),
      ),
    [datacenters],
  )

  const nearestLine = useMemo(() => {
    if (!userLatLng || !datacenters.length) return null
    const [ulat, ulon] = userLatLng
    let best = datacenters[0]
    let bestD = Infinity
    for (const dc of datacenters) {
      const d = haversineMiles(ulat, ulon, Number(dc.lat), Number(dc.lon))
      if (d < bestD) {
        bestD = d
        best = dc
      }
    }
    return {
      positions: [
        userLatLng,
        [Number(best.lat), Number(best.lon)],
      ],
    }
  }, [userLatLng, datacenters])

  const distanceByDcName = useMemo(() => {
    if (!userLatLng) return {}
    const [ulat, ulon] = userLatLng
    const out = {}
    for (const dc of datacenters) {
      out[dc.name] = haversineMiles(
        ulat,
        ulon,
        Number(dc.lat),
        Number(dc.lon),
      )
    }
    return out
  }, [userLatLng, datacenters])

  const fitAllMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map || dcPositions.length === 0) return
    const pts = [...dcPositions]
    if (
      userLatLng &&
      Number.isFinite(userLatLng[0]) &&
      Number.isFinite(userLatLng[1])
    ) {
      pts.push(userLatLng)
    }
    map.fitBounds(L.latLngBounds(pts), {
      padding: [FIT_PADDING, FIT_PADDING],
    })
  }, [dcPositions, userLatLng])

  const goToMyLocation = useCallback(() => {
    const map = mapRef.current
    if (!map || !userLatLng) return
    map.setView(userLatLng, Math.max(map.getZoom(), 12), { animate: true })
  }, [userLatLng])

  const retinaSuffix = useMemo(
    () => (typeof window !== 'undefined' && L.Browser.retina ? '@2x' : ''),
    [],
  )

  const gridLine =
    !carbonLoading && current != null
      ? `Live Grid: ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(current)} ${unit}`
      : carbonLoading
        ? 'Live Grid: …'
        : 'Live Grid: —'

  const updatedLine =
    updatedAt != null
      ? `Updated: ${updatedAt.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
        })}`
      : 'Updated: —'

  return (
    <div className="atlanta-map__shell">
      <div className="atlanta-map__controls" role="toolbar" aria-label="Map controls">
        <button type="button" className="atlanta-map__ctrl-btn" onClick={fitAllMarkers}>
          Fit all
        </button>
        <button
          type="button"
          className="atlanta-map__ctrl-btn"
          onClick={goToMyLocation}
          disabled={!userLatLng}
          title={userLatLng ? 'Center on your location' : 'Location not available'}
        >
          My location
        </button>
      </div>

      <MapContainer
        ref={mapRef}
        center={MAP_CENTER}
        zoom={DEFAULT_ZOOM}
        minZoom={8}
        maxZoom={16}
        className="atlanta-map__leaflet"
        scrollWheelZoom
        aria-label="Atlanta data centers map"
      >
        <MapInvalidateSize />
        {dcPositions.length > 0 && (
          <FitBoundsOnData
            dcPositions={dcPositions}
            userPosition={userLatLng}
            padding={FIT_PADDING}
          />
        )}
        <TileLayer
          attribution={TILE_ATTRIBUTION}
          url={TILE_URL}
          maxZoom={16}
          r={retinaSuffix}
        />
        {nearestLine && (
          <Polyline
            positions={nearestLine.positions}
            pathOptions={{
              color: '#2196f3',
              weight: 1.5,
              opacity: 0.9,
              dashArray: '6 6',
            }}
          />
        )}
        {datacenters.map((dc) => (
          <Marker
            key={dc.name}
            position={[dc.lat, dc.lon]}
            icon={buildDataCenterIcon(dc)}
          >
            <Popup>
              <DataCenterPopupBody
                dc={dc}
                distanceMiles={distanceByDcName[dc.name]}
              />
            </Popup>
          </Marker>
        ))}
        {userLatLng && (
          <Marker
            position={userLatLng}
            icon={userLocationIcon}
            zIndexOffset={2500}
          >
            <Popup>
              <div className="atlanta-map__popup-card">
                <div className="atlanta-map__popup-title atlanta-map__popup-title--blue">
                  Your location
                </div>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      <div className="atlanta-map__grid-info" aria-live="polite">
        <div className="atlanta-map__grid-info-line">{gridLine}</div>
        <div className="atlanta-map__grid-info-meta">{updatedLine}</div>
      </div>

      <div
        className="atlanta-map__legend"
        role="group"
        aria-label="Renewable energy legend"
      >
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
