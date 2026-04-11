import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../config.js'
import { useCarbonIntensity } from '../context/useCarbonIntensity'
import LiveGridActivity from '../components/LiveGridActivity.jsx'
import AtlantaMap from '../components/map/AtlantaMap'
import { LeaderboardPanel } from './LeaderboardPage.jsx'
import './MapPage.css'

function formatMw(n) {
  return `${new Intl.NumberFormat('en-US').format(n)} MW`
}

/** Prior dashboard baseline: 847K homes at 2,185 MW metro capacity */
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

function WattWatchScoreGauge({ score, color }) {
  const r = 86
  const cx = 100
  const cy = 100
  const arcLen = Math.PI * r
  const clamped = Math.max(0, Math.min(100, score))
  const dash = (clamped / 100) * arcLen
  return (
    <svg
      className="map-page__score-gauge-svg map-page__score-gauge-svg--banner"
      viewBox="0 0 200 108"
      aria-hidden="true"
    >
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${arcLen}`}
      />
    </svg>
  )
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

      <div className="map-page__grid">
        <section
          className="map-page__score-strip"
          aria-label="WattWatch grid health score"
        >
          <div className="map-page__score-strip-inner">
            <div className="map-page__score-strip-left">
              <p className="map-page__score-strip-kicker">WattWatch Score</p>
              {gridHealthScoreRounded != null ? (
                <p
                  className="map-page__score-strip-num"
                  style={{ color: gridHealthScoreColor }}
                >
                  {gridHealthScoreRounded}
                </p>
              ) : (
                <p className="map-page__score-strip-num map-page__score-strip-num--muted">
                  …
                </p>
              )}
            </div>
            <div className="map-page__score-strip-gauge">
              {gridHealthScoreRounded != null ? (
                <WattWatchScoreGauge
                  score={gridHealthScore ?? 0}
                  color={gridHealthScoreColor}
                />
              ) : (
                <div
                  className="map-page__score-strip-gauge-placeholder"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="map-page__score-strip-right">
              <p className="map-page__score-strip-label">
                Atlanta Grid Health Score — Right Now
              </p>
              {gridHealthScoreRounded != null ? (
                <>
                  <p className="map-page__score-strip-sub">
                    Based on live carbon intensity of{' '}
                    {new Intl.NumberFormat('en-US', {
                      maximumFractionDigits: 0,
                    }).format(current)}{' '}
                    {unit} from Georgia Power&apos;s grid
                  </p>
                  <p className="map-page__score-strip-compare">
                    <span>National average: 52</span>
                    <span aria-hidden="true"> | </span>
                    <span>Georgia today: {gridHealthScoreRounded}</span>
                    <span aria-hidden="true"> | </span>
                    <span>Best possible: 100</span>
                  </p>
                </>
              ) : (
                <p className="map-page__score-strip-sub">Loading grid score…</p>
              )}
            </div>
          </div>
        </section>

        <div className="map-page__col map-page__col--map">
          <div className="map-page__map-wrap">
            <AtlantaMap datacenters={datacenters} />
          </div>
          <section
            className="map-page__stats map-page__stats--embed"
            aria-label="Grid and capacity summary"
          >
            <div className="map-page__stat">
              <span className="map-page__stat-label">Total data center capacity</span>
              <span className="map-page__stat-value">{formatMw(totalMw || 2765)}</span>
            </div>
            <div className="map-page__stat">
              <span className="map-page__stat-label">
                Grid powered by natural gas right now
              </span>
              <span className="map-page__stat-value">40%</span>
            </div>
            <div className="map-page__stat">
              <span className="map-page__stat-label">Equivalent homes powered</span>
              <span className="map-page__stat-value">{homesPoweredDisplay}</span>
            </div>
            <div className="map-page__stat">
              <span className="map-page__stat-label">Grid intensity now</span>
              <span className="map-page__stat-value">{intensityDisplay}</span>
            </div>
          </section>
          <LiveGridActivity
            intensity={current}
            history={carbonHistory}
          />
        </div>

        <div className="map-page__col map-page__col--leaderboard">
          <div className="map-page__leaderboard-scroll">
            <LeaderboardPanel embedded />
          </div>
        </div>
      </div>
    </article>
  )
}
