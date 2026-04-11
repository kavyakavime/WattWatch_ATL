import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../config.js'
import { useCarbonIntensity } from '../context/useCarbonIntensity'
import LiveGridActivity from '../components/LiveGridActivity.jsx'
import MapImpactPanels from '../components/MapImpactPanels.jsx'
import AtlantaMap from '../components/map/AtlantaMap'
import { LeaderboardPanel } from './LeaderboardPage.jsx'
import { pueTone, renewableTone } from './leaderboardUtils.js'
import './MapPage.css'

function formatMw(n) {
  return `${new Intl.NumberFormat('en-US').format(n)} MW`
}

const BASELINE_MW = 2185
const BASELINE_HOMES = 847_000

function formatHomesPowered(totalMw) {
  const mw = Number(totalMw) || 0
  const homes = Math.round(BASELINE_HOMES * (mw / BASELINE_MW))
  if (homes >= 1_000_000) {
    return `${(homes / 1_000_000).toFixed(2)}M homes`
  }
  return `${Math.round(homes / 1000)}K homes`
}

function intensityAccentClass(current) {
  if (current == null || Number.isNaN(Number(current))) return 'map-page__bar-stat--intensity-muted'
  const ci = Number(current)
  if (ci < 300) return 'map-page__bar-stat--intensity-green'
  if (ci <= 400) return 'map-page__bar-stat--intensity-amber'
  return 'map-page__bar-stat--intensity-red'
}

function mwTone(mw) {
  const m = Number(mw) || 0
  if (m > 200) return 'green'
  if (m >= 50) return 'amber'
  return 'red'
}

export default function MapPage() {
  const { loading: carbonLoading, current, unit, history: carbonHistory } =
    useCarbonIntensity()
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

  const topDatacenters = useMemo(() => {
    return [...datacenters]
      .sort(
        (a, b) =>
          Number(b.capacity_mw || 0) - Number(a.capacity_mw || 0),
      )
      .slice(0, 5)
  }, [datacenters])

  const homesPoweredDisplay = useMemo(
    () => formatHomesPowered(totalMw || 2765),
    [totalMw],
  )

  const intensityDisplay =
    !carbonLoading && current != null
      ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(current)} ${unit}`
      : carbonLoading
        ? '…'
        : '—'

  const gridHealthScore = useMemo(() => {
    if (current == null || Number.isNaN(Number(current))) return null
    const ci = Number(current)
    return Math.max(0, 100 - (ci - 200) / 4)
  }, [current])

  const gridHealthScoreColor = useMemo(() => {
    if (gridHealthScore == null) return '#888'
    if (gridHealthScore >= 60) return '#00ff88'
    if (gridHealthScore >= 40) return '#ffaa00'
    return '#ff4444'
  }, [gridHealthScore])

  const gridHealthScoreRounded =
    gridHealthScore != null ? Math.round(gridHealthScore) : null

  const intensityBarClass = intensityAccentClass(current)

  const scoreSubtext =
    gridHealthScoreRounded != null && current != null
      ? `Live carbon intensity ${new Intl.NumberFormat('en-US', {
          maximumFractionDigits: 0,
        }).format(current)} ${unit} · National avg score 52`
      : 'Loading grid metrics…'

  return (
    <article className="map-page map-page--mission">
      <div className="map-page__mission-grid">
        <aside className="map-page__rail map-page__rail--left">
          {dcError && (
            <p className="map-page__rail-alert" role="alert">
              {dcError}
            </p>
          )}

          <p className="map-page__section-label map-page__section-label--grid-health">
            GRID HEALTH
          </p>

          <div className="map-page__score-card" aria-label="poweredBy Atl grid health score">
            <p className="map-page__score-card-label">POWEREDBY ATL SCORE</p>
            {gridHealthScoreRounded != null ? (
              <p
                className="map-page__score-card-num"
                style={{ color: gridHealthScoreColor }}
              >
                {gridHealthScoreRounded}
              </p>
            ) : (
              <p className="map-page__score-card-num map-page__score-card-num--muted">
                …
              </p>
            )}
            <p className="map-page__score-card-sub">{scoreSubtext}</p>
          </div>

          <p className="map-page__section-label">TOP DATA CENTERS</p>

          <ul className="map-page__dc-mini-list">
            {topDatacenters.map((dc, i) => {
              const ren = Number(dc.renewable_pct) || 0
              const renTone = renewableTone(ren)
              const pueT = pueTone(Number(dc.pue) || 0)
              const mwT = mwTone(dc.capacity_mw)
              return (
                <li
                  key={`${dc.name}-${dc.county}-${i}`}
                  className="map-page__dc-mini-card"
                >
                  <span
                    className={`map-page__dc-mini-dot map-page__dc-mini-dot--${renTone}`}
                    aria-hidden="true"
                  />
                  <div className="map-page__dc-mini-head">
                    <span className="map-page__dc-mini-name">{dc.name}</span>
                    <span className="map-page__dc-mini-county">{dc.county}</span>
                  </div>
                  <div className="map-page__dc-mini-pills">
                    <span className="map-page__dc-pill">
                      <span className="map-page__dc-pill-label">MW</span>
                      <span
                        className={`map-page__dc-pill-value map-page__dc-pill-value--${mwT}`}
                      >
                        {new Intl.NumberFormat('en-US').format(
                          Number(dc.capacity_mw) || 0,
                        )}
                      </span>
                    </span>
                    <span className="map-page__dc-pill">
                      <span className="map-page__dc-pill-label">PUE</span>
                      <span
                        className={`map-page__dc-pill-value map-page__dc-pill-value--${pueT}`}
                      >
                        {dc.pue}
                      </span>
                    </span>
                    <span className="map-page__dc-pill">
                      <span className="map-page__dc-pill-label">Renew%</span>
                      <span
                        className={`map-page__dc-pill-value map-page__dc-pill-value--${renTone}`}
                      >
                        {ren}%
                      </span>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>

          <p className="map-page__section-label">LIVE ACTIVITY</p>
          <LiveGridActivity
            intensity={current}
            history={carbonHistory}
            compact
            maxVisible={5}
          />
        </aside>

        <div className="map-page__center">
          <div className="map-page__map-stage">
            <AtlantaMap datacenters={datacenters} />
          </div>
          <div
            className="map-page__bottom-bar"
            aria-label="Grid and capacity summary"
          >
            <div className="map-page__bar-stat">
              <span className="map-page__bar-stat-label">Total capacity</span>
              <span className="map-page__bar-stat-value map-page__bar-stat-value--green">
                {formatMw(totalMw || 2765)}
              </span>
            </div>
            <div className="map-page__bar-stat">
              <span className="map-page__bar-stat-label">Grid natural gas</span>
              <span className="map-page__bar-stat-value map-page__bar-stat-value--amber">
                40%
              </span>
            </div>
            <div className="map-page__bar-stat">
              <span className="map-page__bar-stat-label">Homes powered</span>
              <span className="map-page__bar-stat-value map-page__bar-stat-value--blue">
                {homesPoweredDisplay}
              </span>
            </div>
            <div className={`map-page__bar-stat ${intensityBarClass}`}>
              <span className="map-page__bar-stat-label">Grid intensity</span>
              <span className="map-page__bar-stat-value">{intensityDisplay}</span>
            </div>
          </div>
        </div>

        <aside className="map-page__rail map-page__rail--right">
          <MapImpactPanels />
        </aside>
      </div>

      <section
        className="map-page__leaderboard-below"
        aria-label="Atlanta data center transparency table"
      >
        <div className="map-page__leaderboard-below-card ds-card">
          <LeaderboardPanel dashboardEmbed />
        </div>
      </section>
    </article>
  )
}
