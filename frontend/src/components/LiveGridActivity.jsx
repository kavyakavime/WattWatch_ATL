import { useCallback, useEffect, useMemo, useState } from 'react'

const FEED_VISIBLE = 8
const POOL_SIZE = 20
const REFRESH_MS = 8000

function rndInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1))
}

function shuffleIndices(n) {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function randomDot() {
  const t = ['green', 'amber', 'red']
  return t[Math.floor(Math.random() * 3)]
}

function timeLabelMinutesAgo() {
  const mins = rndInt(1, 15)
  const d = new Date(Date.now() - mins * 60 * 1000)
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

function avgHistory(history) {
  if (!history?.length) return null
  const s = history.reduce((acc, x) => acc + Number(x), 0)
  return s / history.length
}

/**
 * @param {number} id 0..POOL_SIZE-1
 * @param {{ intensity: number | null, avg24: number | null }} ctx
 */
function buildMessage(id, ctx) {
  const c = ctx.intensity
  const cur =
    c != null && !Number.isNaN(c)
      ? Math.round(c)
      : '—'
  const avg = ctx.avg24
  const aboveBelow =
    avg != null && c != null
      ? c > avg
        ? 'above'
        : c < avg
          ? 'below'
          : 'at'
      : 'near'

  const lines = [
    () =>
      `QTS Atlanta (Douglas Co.) drew ~${rndInt(11000, 13000)} MWh this hour`,
    () =>
      `Georgia grid intensity: ${cur} gCO2eq/kWh — ${aboveBelow} 24h average`,
    () =>
      `Microsoft Azure (Douglas Co.) operating at estimated ${rndInt(85, 95)}% capacity`,
    () =>
      'Solar generation peaking across SOCO region — intensity dropping',
    () =>
      'Evening demand surge detected — grid shifting to natural gas peakers',
    () =>
      `CyrusOne Gwinnett consuming ~${rndInt(7000, 9000)} MWh this hour`,
    () => 'Green window opening: grid intensity below 350 gCO2eq/kWh',
    () =>
      `Georgia Power SOCO grid: ${rndInt(38, 42)}% natural gas right now`,
    () =>
      'Switch Atlanta cooling systems drawing peak load — high PUE period',
    () =>
      'Equinix AT1 Midtown: renewable offset active — below grid average',
    () =>
      'Grid alert: demand forecast exceeds supply buffer for next 2 hours',
    () =>
      'WattWatch tip: schedule batch AI jobs before 6am for lowest carbon',
    () =>
      `Digital Realty ATL: estimated ${rndInt(200, 215)} MW active load`,
    () =>
      `Georgia solar farms contributing ${rndInt(12, 18)}% to current grid mix`,
    () =>
      `Data center cluster (Douglas Co.) collectively drawing ~${rndInt(1100, 1300)} MW`,
    () =>
      'Metro fiber ring utilization spike — east Atlanta corridor',
    () =>
      'Backup diesel tests scheduled — expect brief intensity noise',
    () =>
      'Hyperscale load shifting: overnight batch queues releasing',
    () =>
      'NERC SOC alert cleared — Georgia import capacity restored',
    () =>
      'River cooling intake nominal — Plant Yates thermal headroom OK',
  ]

  const fn = lines[id % lines.length]
  return typeof fn === 'function' ? fn() : ''
}

export default function LiveGridActivity({ intensity, history }) {
  const [tick, setTick] = useState(0)
  const [rows, setRows] = useState(() => [])

  const avg24 = useMemo(() => avgHistory(history), [history])

  const makeBatch = useCallback(() => {
    const ctx = { intensity, avg24 }
    const order = shuffleIndices(POOL_SIZE)
    const picked = order.slice(0, FEED_VISIBLE)
    return picked.map((templateId) => ({
      id: `${Date.now()}-${templateId}-${Math.random().toString(36).slice(2, 8)}`,
      time: timeLabelMinutesAgo(),
      dot: randomDot(),
      text: buildMessage(templateId, ctx),
    }))
  }, [intensity, avg24])

  useEffect(() => {
    setRows(makeBatch())
  }, [makeBatch, tick])

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1)
    }, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <section
      className="map-page__feed"
      aria-label="Live grid activity"
    >
      <h3 className="map-page__feed-title">Live Grid Activity</h3>
      <ul className="map-page__feed-list" key={tick}>
        {rows.map((row, i) => (
          <li
            key={row.id}
            className="map-page__feed-row"
            style={{ animationDelay: `${i * 45}ms` }}
          >
            <span
              className={`map-page__feed-dot map-page__feed-dot--${row.dot}`}
              aria-hidden="true"
            />
            <span className="map-page__feed-time">{row.time}</span>
            <span className="map-page__feed-msg">{row.text}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
