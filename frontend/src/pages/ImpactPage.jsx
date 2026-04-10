import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from '../config.js'
import { ZIP_IMPACT_SUGGESTIONS } from '../data/zipImpactSuggestions.js'
import './ImpactPage.css'

function formatNeighborhoodLabel(name) {
  return name.replace(/\s*\/\s*/g, ' / ')
}

function formatIntLocale(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US')
}

function formatUsd(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0)
}

function humanEquivalents(mw) {
  const m = Number(mw) || 0
  return {
    homes: (m * 1000) / 1.2,
    carTrips: m * 1000 * 0.013,
    tonsCo2PerDay: m * 24 * 0.4,
  }
}

function buildShareText({ neighborhoodLabel, mw, homes, increase }) {
  return (
    `Data centers near ${neighborhoodLabel} consume ${formatIntLocale(mw)} MW — enough for ${formatIntLocale(homes)} homes. ` +
    `Atlanta residents pay $${formatIntLocale(increase)}/month more since 2022. ` +
    '#AtlantaEnergy #WattWatchATL'
  )
}

const SUGGEST_MAX = 6

export default function ImpactPage() {
  const [zip, setZip] = useState('30318')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [submittedZip, setSubmittedZip] = useState(null)
  const [copyDone, setCopyDone] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)

  const comboRef = useRef(null)

  const normalizedZip = useMemo(
    () => zip.replace(/\D/g, '').slice(0, 5),
    [zip],
  )

  const suggestions = useMemo(() => {
    const p = normalizedZip
    if (!p) return []
    return ZIP_IMPACT_SUGGESTIONS.filter((row) => row.zip.startsWith(p)).slice(
      0,
      SUGGEST_MAX,
    )
  }, [normalizedZip])

  const showNoMatch = normalizedZip.length >= 1 && suggestions.length === 0
  const showSuggestPanel = suggestOpen && (suggestions.length > 0 || showNoMatch)

  useEffect(() => {
    if (!suggestOpen) return
    const onDocMouseDown = (e) => {
      if (comboRef.current && !comboRef.current.contains(e.target)) {
        setSuggestOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [suggestOpen])

  const submitZipCode = useCallback(async (zip5) => {
    const z = zip5.replace(/\D/g, '').slice(0, 5)
    if (z.length !== 5) {
      setError('Enter a valid 5-digit Atlanta zip code.')
      return
    }
    setError(null)
    setResult(null)
    setSubmittedZip(null)
    setCopyDone(false)
    setSuggestOpen(false)
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/zip-impact-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zip: z }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        const msg =
          typeof data.detail === 'string'
            ? data.detail
            : Array.isArray(data.detail)
              ? data.detail.map((d) => d.msg || d).join(' ')
              : 'Request failed. Check your API key and try again.'
        throw new Error(msg)
      }
      setSubmittedZip(z)
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [])

  const onSubmit = useCallback(
    (e) => {
      e.preventDefault()
      void submitZipCode(normalizedZip)
    },
    [normalizedZip, submitZipCode],
  )

  const pickSuggestion = useCallback(
    (zipCode) => {
      setZip(zipCode)
      setSuggestOpen(false)
      void submitZipCode(zipCode)
    },
    [submitZipCode],
  )

  const onNoMatchPick = useCallback(() => {
    setSuggestOpen(false)
    if (normalizedZip.length === 5) {
      void submitZipCode(normalizedZip)
    }
  }, [normalizedZip, submitZipCode])

  const neighborhoodLabel = result
    ? formatNeighborhoodLabel(result.neighborhood_name)
    : ''
  const equiv = result ? humanEquivalents(result.datacenter_mw) : null

  const shareText = useMemo(() => {
    if (!result || !equiv) return ''
    return buildShareText({
      neighborhoodLabel,
      mw: result.datacenter_mw,
      homes: equiv.homes,
      increase: result.increase,
    })
  }, [result, equiv, neighborhoodLabel])

  const copyShare = useCallback(async () => {
    if (!shareText) return
    try {
      await navigator.clipboard.writeText(shareText)
      setCopyDone(true)
      window.setTimeout(() => setCopyDone(false), 2500)
    } catch {
      setError('Could not copy to clipboard.')
    }
  }, [shareText])

  const borderClasses = [
    'impact-page__bullet--edge-green',
    'impact-page__bullet--edge-amber',
    'impact-page__bullet--edge-red',
  ]

  const showFallbackBanner =
    result &&
    submittedZip &&
    result.resolved_zip &&
    submittedZip !== result.resolved_zip

  return (
    <article className="impact-page">
      <header className="impact-page__hero">
        <h1 className="impact-page__hero-title">
          What does data center growth mean for YOUR neighborhood?
        </h1>
        <p className="impact-page__hero-sub">
          Type your Atlanta zip code to see exactly how the data center boom is
          affecting your block.
        </p>
      </header>

      <form className="impact-page__form" onSubmit={onSubmit}>
        <div className="impact-page__form-row">
          <div className="impact-page__combo" ref={comboRef}>
            <input
              id="impact-zip"
              className="impact-page__input"
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="Enter Atlanta zip code (e.g. 30318)"
              value={zip}
              onChange={(e) => {
                setZip(e.target.value)
                const d = e.target.value.replace(/\D/g, '').slice(0, 5)
                setSuggestOpen(d.length >= 1)
              }}
              onFocus={() => {
                if (zip.replace(/\D/g, '').length >= 1) setSuggestOpen(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSuggestOpen(false)
              }}
              aria-label="Atlanta zip code"
              aria-expanded={showSuggestPanel}
              aria-controls="impact-zip-suggestions"
              maxLength={10}
            />
            {showSuggestPanel && (
              <ul
                id="impact-zip-suggestions"
                className="impact-page__suggest"
                role="listbox"
              >
                {suggestions.map((s) => (
                  <li
                    key={s.zip}
                    className="impact-page__suggest-item"
                    role="option"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickSuggestion(s.zip)
                    }}
                  >
                    <span className="impact-page__suggest-zip">{s.zip}</span>
                    <span className="impact-page__suggest-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="impact-page__suggest-place">{s.place}</span>
                  </li>
                ))}
                {showNoMatch && (
                  <li
                    className="impact-page__suggest-item impact-page__suggest-item--empty"
                    role="option"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onNoMatchPick()
                    }}
                  >
                    No exact match — showing nearest Atlanta area data
                  </li>
                )}
              </ul>
            )}
          </div>
          <button
            type="submit"
            className="impact-page__submit"
            disabled={loading}
          >
            See impact
          </button>
        </div>
      </form>

      {error && (
        <p className="impact-page__error" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <div className="impact-page__loading" aria-live="polite">
          <div className="impact-page__spinner" aria-hidden="true" />
          <p className="impact-page__loading-text">
            Analyzing your neighborhood...
          </p>
        </div>
      )}

      {result && !loading && (
        <section className="impact-page__results" aria-label="Impact results">
          {showFallbackBanner && (
            <div className="impact-page__fallback-banner" role="status">
              {`We don't have specific data for zip code ${submittedZip} yet — showing nearest available Atlanta data instead.`}
            </div>
          )}
          <h2 className="impact-page__neighborhood">{neighborhoodLabel}</h2>
          <p className="impact-page__bill-line">
            Your electric bill has risen{' '}
            <span className="impact-page__bill-em">${result.increase}</span>
            /month since 2022 — from{' '}
            <span className="impact-page__bill-em">{formatUsd(result.bill_2022)}</span> to{' '}
            <span className="impact-page__bill-em">{formatUsd(result.bill_current)}</span>
          </p>

          <div className="impact-page__bullets">
            {result.ai_bullets.map((text, i) => (
              <div
                key={i}
                className={`impact-page__bullet ${borderClasses[i] ?? borderClasses[2]}`}
              >
                <p className="impact-page__bullet-text">{text}</p>
              </div>
            ))}
          </div>

          <h3 className="impact-page__equiv-title">Human Equivalents</h3>
          <div className="impact-page__equiv-row">
            <div className="impact-page__equiv-card">
              <span className="impact-page__equiv-main">
                {formatIntLocale(equiv.homes)} homes
              </span>
              <span className="impact-page__equiv-sub">
                powered by nearest data center
              </span>
            </div>
            <div className="impact-page__equiv-card">
              <span className="impact-page__equiv-main">
                {formatIntLocale(equiv.carTrips)} car trips
              </span>
              <span className="impact-page__equiv-sub">
                equivalent daily energy
              </span>
            </div>
            <div className="impact-page__equiv-card">
              <span className="impact-page__equiv-main">
                {formatIntLocale(equiv.tonsCo2PerDay)} tons CO2
              </span>
              <span className="impact-page__equiv-sub">emitted per day</span>
            </div>
          </div>

          <button
            type="button"
            className="impact-page__share"
            onClick={copyShare}
          >
            {copyDone ? 'Copied!' : 'Share with your neighbor'}
          </button>
        </section>
      )}
    </article>
  )
}
