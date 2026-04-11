import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { API_BASE } from '../config.js'
import './SchedulerPage.css'

const HOUR_LABELS = [
  '12am',
  '1am',
  '2am',
  '3am',
  '4am',
  '5am',
  '6am',
  '7am',
  '8am',
  '9am',
  '10am',
  '11am',
  '12pm',
  '1pm',
  '2pm',
  '3pm',
  '4pm',
  '5pm',
  '6pm',
  '7pm',
  '8pm',
  '9pm',
  '10pm',
  '11pm',
]

const DURATION_OPTIONS = [
  { value: 1, label: '1h' },
  { value: 2, label: '2h' },
  { value: 4, label: '4h' },
  { value: 6, label: '6h' },
  { value: 8, label: '8h' },
]

const DEADLINE_OPTIONS = [
  { value: 6, label: '6am' },
  { value: 9, label: '9am' },
  { value: 12, label: '12pm' },
  { value: 15, label: '3pm' },
  { value: 18, label: '6pm' },
  { value: 21, label: '9pm' },
  { value: 24, label: 'midnight' },
]

const X_TICKS = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 47]

function formatHour12(h) {
  const x = ((h % 24) + 24) % 24
  if (x === 0) return '12am'
  if (x < 12) return `${x}am`
  if (x === 12) return '12pm'
  return `${x - 12}pm`
}

function formatXAxisTick(idx) {
  if (idx === 24) return 'NOW'
  const h = ((idx % 24) + 24) % 24
  return HOUR_LABELS[h]
}

function recommendationSource(result) {
  if (result.recommendation_source === 'forecast') return 'forecast'
  if (result.recommendation_source === 'historical') return 'historical'
  return result.best_start_hour >= 24 ? 'forecast' : 'historical'
}

function SchedulerTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const isFc = row.forecast != null && row.idx >= 24
  const val = isFc ? row.forecast : row.real
  const src = isFc ? 'AI forecast (next 24h)' : 'Real grid (past 24h)'
  return (
    <div className="scheduler-tooltip">
      <div className="scheduler-tooltip__hour">{row.label}</div>
      <div className="scheduler-tooltip__src">{src}</div>
      <div className="scheduler-tooltip__val">
        {typeof val === 'number' ? val.toFixed(1) : val} gCO2eq/kWh
      </div>
    </div>
  )
}

export default function SchedulerPage() {
  const [history, setHistory] = useState([])
  const [forecast, setForecast] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [forecastLoading, setForecastLoading] = useState(true)
  const [duration, setDuration] = useState(4)
  const [deadline, setDeadline] = useState(18)
  const [scheduleResult, setScheduleResult] = useState(null)
  const [scheduleError, setScheduleError] = useState(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [windowDuration, setWindowDuration] = useState(0)

  useEffect(() => {
    let cancelled = false
    setForecastLoading(true)
    fetch(`${API_BASE}/api/carbon-forecast`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load carbon forecast')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        const h = Array.isArray(data.history) ? data.history.map(Number) : []
        const f = Array.isArray(data.forecast) ? data.forecast.map(Number) : []
        setHistory(h.length >= 24 ? h.slice(-24) : [])
        setForecast(f.length >= 24 ? f.slice(0, 24) : [])
        setLoadError(null)
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Load error')
          setHistory([])
          setForecast([])
        }
      })
      .finally(() => {
        if (!cancelled) setForecastLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const chartData = useMemo(() => {
    const h =
      history.length >= 24 ? history : Array.from({ length: 24 }, () => 400)
    const f =
      forecast.length >= 24
        ? forecast
        : Array.from({ length: 24 }, () => null)
    const rows = []
    for (let i = 0; i < 24; i += 1) {
      rows.push({
        idx: i,
        label: `${HOUR_LABELS[i]} · past 24h`,
        real: typeof h[i] === 'number' ? h[i] : 400,
        forecast: null,
      })
    }
    for (let j = 0; j < 24; j += 1) {
      rows.push({
        idx: 24 + j,
        label: `${HOUR_LABELS[j]} · next 24h`,
        real: null,
        forecast: typeof f[j] === 'number' ? f[j] : null,
      })
    }
    return rows
  }, [history, forecast])

  const yDomain = useMemo(() => {
    const vals = chartData.flatMap((d) =>
      [d.real, d.forecast].filter((v) => typeof v === 'number'),
    )
    const lo = Math.min(...vals, 250)
    const hi = Math.max(...vals, 450)
    const pad = (hi - lo) * 0.08
    return [Math.floor(lo - pad), Math.ceil(hi + pad)]
  }, [chartData])

  const gradientStops = useMemo(() => {
    const [yMin, yMax] = yDomain
    const span = yMax - yMin || 1
    const pct = (y) =>
      `${Math.min(100, Math.max(0, ((y - yMin) / span) * 100))}%`
    return {
      g300: pct(300),
      g400: pct(400),
    }
  }, [yDomain])

  const hasFullForecast = forecast.length >= 24 && history.length >= 24

  const onFindWindow = useCallback(
    async (e) => {
      e.preventDefault()
      setScheduleError(null)
      setScheduleResult(null)
      setScheduleLoading(true)
      try {
        const params = new URLSearchParams({
          duration: String(duration),
          deadline: String(deadline),
        })
        const r = await fetch(`${API_BASE}/api/best-window?${params}`)
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          throw new Error(
            typeof data.detail === 'string'
              ? data.detail
              : 'Could not find a window',
          )
        }
        setScheduleResult(data)
        setWindowDuration(duration)
      } catch (err) {
        setScheduleError(
          err instanceof Error ? err.message : 'Something went wrong.',
        )
      } finally {
        setScheduleLoading(false)
      }
    },
    [duration, deadline],
  )

  const carsOff = scheduleResult
    ? Math.max(
        1,
        Math.round(scheduleResult.equivalent_car_miles_saved / 150),
      )
    : 0

  return (
    <article className="scheduler-page">
      <header className="scheduler-page__header">
        <h1 className="scheduler-page__title">Green Workload Scheduler</h1>
        <p className="scheduler-page__sub">
          Cox Automotive pioneered EV smart charging — shifting when cars charge
          based on grid cleanliness. WattWatch ATL applies that same logic to AI
          compute workloads, with an AI forecast for the next 24 hours.
        </p>
      </header>

      {loadError && (
        <p className="scheduler-page__banner scheduler-page__banner--warn" role="alert">
          {loadError}
        </p>
      )}

      <div className="scheduler-page__chart-wrap">
        <div className="scheduler-page__chart-legend" aria-label="Chart legend">
          <div className="scheduler-page__chart-legend-item">
            <span className="scheduler-page__chart-legend-swatch scheduler-page__chart-legend-swatch--real" />
            <span>Real grid data (past 24h)</span>
          </div>
          <div className="scheduler-page__chart-legend-item">
            <span className="scheduler-page__chart-legend-swatch scheduler-page__chart-legend-swatch--forecast" />
            <span>AI forecast (next 24h)</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <AreaChart
            data={chartData}
            margin={{ top: 12, right: 14, left: 4, bottom: 8 }}
          >
            <defs>
              <linearGradient id="schedulerCarbonGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#00ff88" stopOpacity={0.95} />
                <stop offset={gradientStops.g300} stopColor="#00ff88" stopOpacity={0.55} />
                <stop offset={gradientStops.g400} stopColor="#ffaa00" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#ff4444" stopOpacity={0.45} />
              </linearGradient>
              <linearGradient id="schedulerForecastGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#00ff88" stopOpacity={0.45} />
                <stop offset={gradientStops.g300} stopColor="#00ff88" stopOpacity={0.28} />
                <stop offset={gradientStops.g400} stopColor="#88ffcc" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#aaffdd" stopOpacity={0.15} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="rgba(0, 255, 136, 0.2)"
              strokeDasharray="4 6"
              vertical={false}
            />
            <XAxis
              type="number"
              dataKey="idx"
              domain={[0, 47]}
              ticks={X_TICKS}
              tickFormatter={(v) => formatXAxisTick(v)}
              stroke="rgba(255,255,255,0.35)"
              tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 10 }}
            />
            <YAxis
              domain={yDomain}
              stroke="rgba(255,255,255,0.35)"
              tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
              label={{
                value: 'gCO2eq/kWh',
                angle: -90,
                position: 'insideLeft',
                fill: 'rgba(0,255,136,0.65)',
                fontSize: 11,
              }}
            />
            <Tooltip content={<SchedulerTooltip />} cursor={{ stroke: '#00ff88', strokeOpacity: 0.35 }} />
            <ReferenceLine
              y={300}
              stroke="#00ff88"
              strokeDasharray="5 5"
              strokeOpacity={0.85}
              label={{
                value: 'Clean threshold',
                fill: '#00ff88',
                fontSize: 11,
                position: 'insideTopRight',
              }}
            />
            <ReferenceLine
              y={400}
              stroke="#ff4444"
              strokeDasharray="5 5"
              strokeOpacity={0.85}
              label={{
                value: 'Dirty threshold',
                fill: '#ff4444',
                fontSize: 11,
                position: 'insideBottomRight',
              }}
            />
            {hasFullForecast && (
              <ReferenceLine
                x={24}
                stroke="rgba(255,255,255,0.65)"
                strokeDasharray="4 4"
                label={{
                  value: 'NOW',
                  fill: 'rgba(255,255,255,0.85)',
                  fontSize: 11,
                  position: 'top',
                }}
              />
            )}
            {scheduleResult && windowDuration > 0 && (
              <ReferenceArea
                x1={scheduleResult.best_start_hour}
                x2={scheduleResult.best_start_hour + windowDuration}
                fill="#00ff88"
                fillOpacity={0.18}
                stroke="#00ff88"
                strokeOpacity={0.5}
              />
            )}
            <Area
              type="monotone"
              dataKey="forecast"
              stroke="#6dffc4"
              strokeWidth={1.75}
              strokeDasharray="7 5"
              strokeOpacity={0.9}
              fill="url(#schedulerForecastGrad)"
              fillOpacity={0.5}
              dot={false}
              activeDot={{ r: 4, fill: '#6dffc4', stroke: '#080c10' }}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="real"
              stroke="#00ff88"
              strokeWidth={2}
              fill="url(#schedulerCarbonGrad)"
              fillOpacity={1}
              dot={false}
              activeDot={{ r: 5, fill: '#00ff88', stroke: '#080c10' }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <form className="scheduler-page__form" onSubmit={onFindWindow}>
        <h2 className="scheduler-page__form-title">Schedule My Workload</h2>
        <div className="scheduler-page__form-row">
          <label className="scheduler-page__field">
            <span className="scheduler-page__label">Workload duration</span>
            <select
              className="scheduler-page__select"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {DURATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="scheduler-page__field">
            <span className="scheduler-page__label">Must finish by</span>
            <select
              className="scheduler-page__select"
              value={deadline}
              onChange={(e) => setDeadline(Number(e.target.value))}
            >
              {DEADLINE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          className="scheduler-page__submit"
          disabled={
            scheduleLoading || forecastLoading || history.length < 24
          }
        >
          {scheduleLoading ? 'Searching…' : 'Find Greenest Window'}
        </button>
      </form>

      {scheduleError && (
        <p className="scheduler-page__banner scheduler-page__banner--err" role="alert">
          {scheduleError}
        </p>
      )}

      {scheduleResult && (
        <section className="scheduler-page__result" aria-live="polite">
          {recommendationSource(scheduleResult) === 'forecast' && (
            <p className="scheduler-page__ai-badge">AI predicted window</p>
          )}
          <p className="scheduler-page__best-window">
            Best window: Tomorrow{' '}
            <span className="scheduler-page__best-window-time">
              {formatHour12(scheduleResult.best_start_hour)} →{' '}
              {formatHour12(scheduleResult.best_end_hour)}
            </span>
          </p>
          {recommendationSource(scheduleResult) === 'historical' && (
            <p className="scheduler-page__result-historical-note">
              Around {formatHour12(scheduleResult.best_start_hour)} (based on
              yesterday&apos;s grid) — same clock time tomorrow.
            </p>
          )}
          <p className="scheduler-page__result-line">
            Save{' '}
            <span className="scheduler-page__result-pct">
              {scheduleResult.carbon_saved_vs_now_percent}%
            </span>{' '}
            carbon vs running right now
          </p>
          <p className="scheduler-page__result-line">
            That&apos;s like taking{' '}
            <span className="scheduler-page__result-cars">{carsOff}</span> cars off
            Atlanta highways for a day
          </p>
        </section>
      )}

      <aside className="scheduler-page__cox">
        This is the same logic Cox Automotive uses for EV smart charging — applied
        to AI compute. Shift your workload to when Georgia&apos;s grid is greenest.
      </aside>
    </article>
  )
}
