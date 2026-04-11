import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../config.js'
import {
  computeGreenScore,
  pueTone,
  renewableTone,
  scoreBarTone,
} from './leaderboardUtils.js'
import './LeaderboardPage.css'

/** Weighted averages for full 16-facility list (fallback before API load) */
const STAT_CARDS_DEFAULT = {
  totalMw: 2765,
  avgRenewablePct: '24.5',
  avgPue: '1.37',
}

const GOOGLE_IOWA_ROW = {
  id: 'benchmark-google-iowa',
  kind: 'benchmark',
  name: 'Google Iowa ★ Best in Class',
  county: 'Council Bluffs, IA',
  capacity_mw: null,
  pue: 1.08,
  renewable_pct: 100,
  greenScore: 100,
  note: 'industry benchmark',
}

const GEORGIA_AVG_ROW = {
  id: 'benchmark-georgia-avg',
  kind: 'georgia',
  name: 'Georgia Average',
  county: 'State benchmark',
  capacity_mw: null,
  pue: 1.41,
  renewable_pct: 18,
  greenScore: 35,
}

function formatMw(n) {
  return `${new Intl.NumberFormat('en-US').format(n)} MW`
}

function buildReportText(facilityRows, statsCards, generatedAt) {
  const lines = [
    'WattWatch ATL — Atlanta Data Center Transparency Leaderboard',
    `Generated: ${generatedAt}`,
    '',
    'Summary (dashboard figures)',
    `  Total capacity: ${formatMw(statsCards.totalMw)} (16 facilities)`,
    `  Average renewable (MW-weighted): ${statsCards.avgRenewablePct}%`,
    `  Average PUE (MW-weighted): ${statsCards.avgPue}`,
    '',
    '[Industry benchmark] Google Iowa ★ Best in Class',
    '  industry benchmark — PUE 1.08, 100% renewable, Green Score 100',
    '',
    '[Benchmark] Georgia Average',
    `  PUE 1.41, 18% renewable, Green Score ${GEORGIA_AVG_ROW.greenScore}`,
    '',
    'Atlanta metro facilities (ranked by Green Score)',
    '',
  ]
  for (const r of facilityRows) {
    lines.push(
      `#${r.rank} ${r.name} (${r.county}) — ${formatMw(r.capacity_mw)}, PUE ${r.pue}, ${r.renewable_pct}% renewable, Green Score ${r.greenScore}`,
    )
  }
  lines.push('')
  lines.push('Green Score = PUE band points (max 40) + renewable% × 0.6 (max 60).')
  lines.push('Source: WattWatch ATL model — not an official government filing.')
  return lines.join('\n')
}

export function LeaderboardPanel({
  embedded = false,
  dashboardEmbed = false,
}) {
  const [centers, setCenters] = useState([])
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/atlanta-datacenters`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load data centers')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setCenters(Array.isArray(data) ? data : [])
        setLoadError(null)
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Load error')
          setCenters([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const ranked = useMemo(() => {
    const withScores = centers.map((dc, i) => ({
      ...dc,
      id: `${dc.name}-${i}`,
      kind: 'facility',
      greenScore: computeGreenScore(dc.pue, dc.renewable_pct),
    }))
    withScores.sort((a, b) => b.greenScore - a.greenScore)
    return withScores.map((dc, idx) => ({ ...dc, rank: idx + 1 }))
  }, [centers])

  const summaryStats = useMemo(() => {
    if (!centers.length) return STAT_CARDS_DEFAULT
    const totalMw = centers.reduce((s, d) => s + Number(d.capacity_mw || 0), 0)
    if (totalMw <= 0) return STAT_CARDS_DEFAULT
    let wRen = 0
    let wPue = 0
    for (const d of centers) {
      const m = Number(d.capacity_mw || 0)
      wRen += m * Number(d.renewable_pct || 0)
      wPue += m * Number(d.pue || 0)
    }
    return {
      totalMw,
      avgRenewablePct: (wRen / totalMw).toFixed(1),
      avgPue: (wPue / totalMw).toFixed(2),
    }
  }, [centers])

  const metroHomesMillions = useMemo(() => {
    const scaled = (4_000_000 * summaryStats.totalMw) / 2185
    return (scaled / 1_000_000).toFixed(1)
  }, [summaryStats.totalMw])

  const tableRows = useMemo(
    () => [GOOGLE_IOWA_ROW, GEORGIA_AVG_ROW, ...ranked],
    [ranked],
  )

  const rowsToRender = useMemo(() => {
    let fi = 0
    return tableRows.map((row) => {
      if (row.kind !== 'facility') {
        return { row, stripeClass: '' }
      }
      const stripeClass =
        fi % 2 === 0 ? 'lb-table__row--a' : 'lb-table__row--b'
      fi += 1
      return { row, stripeClass }
    })
  }, [tableRows])

  const downloadReport = useCallback(() => {
    const generatedAt = new Date().toISOString()
    const text = buildReportText(ranked, summaryStats, generatedAt)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'wattwatch-atl-leaderboard-report.txt'
    a.click()
    URL.revokeObjectURL(url)
  }, [ranked, summaryStats])

  const rootClass = [
    'lb-page',
    dashboardEmbed && 'lb-page--dashboard',
    embedded && !dashboardEmbed && 'lb-page--embedded',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article className={rootClass}>
      <header className="lb-page__header">
        <h1 className="lb-page__title">
          {dashboardEmbed
            ? 'Atlanta Data Center Transparency'
            : 'Atlanta Data Center Transparency Leaderboard'}
        </h1>
        <p className="lb-page__sub">
          {dashboardEmbed ? (
            <>
              Metro facilities ranked by green score — enough power for{' '}
              {metroHomesMillions}M homes equivalent.
            </>
          ) : (
            <>
              Atlanta is one of the fastest-growing data center markets in the US.
              These facilities collectively consume enough power for{' '}
              {metroHomesMillions} million Georgia homes. Transparency is the first
              step to accountability.
            </>
          )}
        </p>
      </header>

      {loadError && (
        <p className="lb-page__banner" role="alert">
          {loadError}
        </p>
      )}

      <section className="lb-page__stats" aria-label="Summary statistics">
        <div className="lb-page__stat">
          <span className="lb-page__stat-label">Total capacity</span>
          <span className="lb-page__stat-value">
            {formatMw(summaryStats.totalMw)}
          </span>
        </div>
        <div className="lb-page__stat">
          <span className="lb-page__stat-label">Avg renewable</span>
          <span className="lb-page__stat-value">
            {summaryStats.avgRenewablePct}%
          </span>
        </div>
        <div className="lb-page__stat">
          <span className="lb-page__stat-label">Avg PUE</span>
          <span className="lb-page__stat-value">{summaryStats.avgPue}</span>
        </div>
      </section>

      <div className="lb-page__toolbar">
        <button
          type="button"
          className="lb-page__download"
          onClick={downloadReport}
        >
          Download Report
        </button>
      </div>

      <div className="lb-page__table-wrap">
        <table className="lb-table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Name</th>
              <th scope="col">County</th>
              <th scope="col">MW</th>
              <th scope="col">PUE</th>
              <th scope="col">Renewable %</th>
              <th scope="col">Green Score</th>
            </tr>
          </thead>
          <tbody>
            {rowsToRender.map(({ row, stripeClass }) => {
              if (row.kind === 'benchmark') {
                return (
                  <tr
                    key={row.id}
                    className="lb-table__row lb-table__row--benchmark"
                  >
                    <td className="lb-table__cell lb-table__cell--dim">—</td>
                    <td className="lb-table__cell">
                      <div className="lb-table__name-wrap">
                        <span className="lb-table__name">{row.name}</span>
                        <span className="lb-table__badge lb-table__badge--blue">
                          {row.note}
                        </span>
                      </div>
                    </td>
                    <td className="lb-table__cell">{row.county}</td>
                    <td className="lb-table__cell lb-table__cell--dim">—</td>
                    <td
                      className={`lb-table__cell lb-table__pue lb-table__pue--${pueTone(row.pue)}`}
                    >
                      {row.pue}
                    </td>
                    <td
                      className={`lb-table__cell lb-table__ren lb-table__ren--${renewableTone(row.renewable_pct)}`}
                    >
                      {row.renewable_pct}%
                    </td>
                    <td className="lb-table__cell">
                      <ScoreBar score={row.greenScore} />
                    </td>
                  </tr>
                )
              }
              if (row.kind === 'georgia') {
                return (
                  <tr
                    key={row.id}
                    className="lb-table__row lb-table__row--georgia"
                  >
                    <td className="lb-table__cell lb-table__cell--dim">—</td>
                    <td className="lb-table__cell lb-table__strong">
                      {row.name}
                    </td>
                    <td className="lb-table__cell">{row.county}</td>
                    <td className="lb-table__cell lb-table__cell--dim">—</td>
                    <td
                      className={`lb-table__cell lb-table__pue lb-table__pue--${pueTone(row.pue)}`}
                    >
                      {row.pue}
                    </td>
                    <td
                      className={`lb-table__cell lb-table__ren lb-table__ren--${renewableTone(row.renewable_pct)}`}
                    >
                      {row.renewable_pct}%
                    </td>
                    <td className="lb-table__cell">
                      <ScoreBar score={row.greenScore} />
                    </td>
                  </tr>
                )
              }
              const rankClass =
                row.rank === 1
                  ? 'lb-table__rank--gold'
                  : row.rank === 2
                    ? 'lb-table__rank--silver'
                    : row.rank === 3
                      ? 'lb-table__rank--bronze'
                      : ''
              return (
                <tr
                  key={row.id}
                  className={`lb-table__row ${stripeClass}`.trim()}
                >
                  <td className={`lb-table__cell lb-table__rank ${rankClass}`}>
                    {row.rank}
                  </td>
                  <td className="lb-table__cell lb-table__strong">{row.name}</td>
                  <td className="lb-table__cell">{row.county}</td>
                  <td className="lb-table__cell lb-table__num">
                    {new Intl.NumberFormat('en-US').format(row.capacity_mw)}
                  </td>
                  <td
                    className={`lb-table__cell lb-table__pue lb-table__pue--${pueTone(row.pue)}`}
                  >
                    {row.pue}
                  </td>
                  <td
                    className={`lb-table__cell lb-table__ren lb-table__ren--${renewableTone(row.renewable_pct)}`}
                  >
                    {row.renewable_pct}%
                  </td>
                  <td className="lb-table__cell">
                    <ScoreBar score={row.greenScore} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!dashboardEmbed && (
        <section className="lb-action" aria-labelledby="lb-action-heading">
          <h2 id="lb-action-heading" className="lb-action__title">
            Hold Data Centers Accountable
          </h2>
          <div className="lb-action__grid">
            <div className="lb-action__card">
              <h3 className="lb-action__card-title">For Residents</h3>
              <p className="lb-action__card-text">
                Ask your city council representative to require annual energy
                transparency reports from data centers in your district.
              </p>
            </div>
            <div className="lb-action__card">
              <h3 className="lb-action__card-title">For Journalists</h3>
              <p className="lb-action__card-text">
                Use this data to investigate the gap between corporate sustainability
                claims and actual renewable energy usage.
              </p>
            </div>
            <div className="lb-action__card">
              <h3 className="lb-action__card-title">For Regulators</h3>
              <p className="lb-action__card-text">
                Georgia PSC has approved $16B in grid expansion — 80% for data
                centers. Demand emissions disclosure as a condition of grid access.
              </p>
            </div>
          </div>
        </section>
      )}
    </article>
  )
}

export default function LeaderboardPage() {
  return <LeaderboardPanel embedded={false} dashboardEmbed={false} />
}

function ScoreBar({ score }) {
  const tone = scoreBarTone(score)
  return (
    <div className="lb-score">
      <span className="lb-score__num">{score}</span>
      <div className="lb-score__track" aria-hidden="true">
        <div
          className={`lb-score__fill lb-score__fill--${tone}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  )
}
