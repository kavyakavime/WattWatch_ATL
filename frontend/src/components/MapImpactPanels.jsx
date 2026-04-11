import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from '../config.js'
import { ZIP_IMPACT_SUGGESTIONS } from '../data/zipImpactSuggestions.js'
import '../pages/MapPage.css'

const SUGGEST_MAX = 6

function formatNeighborhoodLabel(name) {
  return name.replace(/\s*\/\s*/g, ' / ')
}

function formatIntLocale(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US')
}

function humanEquivalents(mw) {
  const m = Number(mw) || 0
  return {
    homes: (m * 1000) / 1.2,
    carTrips: m * 1000 * 0.013,
    tonsCo2PerDay: m * 24 * 0.4,
  }
}

/** X/Twitter post length guard for web intent URLs */
function truncateForTweet(text, max = 260) {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}…`
}

function PostDraftBody({ text }) {
  const parts = text.split(/(#[A-Za-z0-9_]+)/g)
  return parts.map((part, i) =>
    part.startsWith('#') ? (
      <span key={`h-${i}`} className="map-page__post-draft-hashtag">
        {part}
      </span>
    ) : (
      <span key={`t-${i}`}>{part}</span>
    ),
  )
}

function IconX() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  )
}

function IconLinkedIn() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
      />
    </svg>
  )
}

function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"
      />
    </svg>
  )
}

const PSC_EMAIL_TO = 'gapsc@psc.ga.gov'

function buildPscEmailParts(neighborhoodLabel, increaseUsd) {
  const subject = `Data Center Energy Transparency for ${neighborhoodLabel}`
  const inc = formatIntLocale(increaseUsd)
  const body =
    `As a resident of ${neighborhoodLabel}, I am concerned about the impact of data center growth on my electricity bills. Since 2022, my bills have risen $${inc}/month. I urge the Georgia Public Service Commission to require mandatory energy transparency reporting from data centers as a condition of grid access. The $16B grid expansion approved in December 2025 must include community protections.`
  return { subject, body }
}

function buildPscEmailClipboard(neighborhoodLabel, increaseUsd) {
  const { subject, body } = buildPscEmailParts(neighborhoodLabel, increaseUsd)
  return `Subject: ${subject}\n\n${body}`
}

function buildPscMailtoFromParts(subject, body) {
  return `mailto:${PSC_EMAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function gridIntensityQuality(current) {
  if (current == null || Number.isNaN(current)) {
    return { tone: 'muted', phrase: 'unavailable' }
  }
  if (current < 300) {
    return { tone: 'green', phrase: 'cleaner than average' }
  }
  if (current <= 400) {
    return { tone: 'amber', phrase: 'average' }
  }
  return { tone: 'red', phrase: 'dirtier than average' }
}

const bulletBorderClasses = [
  'map-page__bullet--edge-green',
  'map-page__bullet--edge-amber',
  'map-page__bullet--edge-red',
]

function SendMailIcon() {
  return (
    <svg
      className="map-page__send-mail-icon"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LightningPromptIcon() {
  return (
    <svg
      className="map-page__prompt-icon"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"
        fill="currentColor"
      />
    </svg>
  )
}

export default function MapImpactPanels() {
  const [zip, setZip] = useState('')
  const [impactLoading, setImpactLoading] = useState(false)
  const [impactError, setImpactError] = useState(null)
  const [impactResult, setImpactResult] = useState(null)
  const [submittedZip, setSubmittedZip] = useState(null)
  const [copyDone, setCopyDone] = useState(false)
  const [socialFeedback, setSocialFeedback] = useState(null)
  const [aiPost, setAiPost] = useState(null)
  const [aiPostLoading, setAiPostLoading] = useState(false)
  const [aiPostError, setAiPostError] = useState(null)
  const [emailCopyDone, setEmailCopyDone] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [bannerCarbon, setBannerCarbon] = useState(null)
  const [bannerUnit, setBannerUnit] = useState('gCO2eq/kWh')
  const [bannerLoading, setBannerLoading] = useState(true)
  const [autoDetectedFromLocation, setAutoDetectedFromLocation] =
    useState(false)

  const comboRef = useRef(null)
  const zipManuallyEditedRef = useRef(false)

  const fetchImpactBannerCarbon = useCallback(() => {
    fetch(`${API_BASE}/api/carbon-intensity`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.current === 'number') {
          setBannerCarbon(data.current)
          if (typeof data.unit === 'string') setBannerUnit(data.unit)
        }
      })
      .catch(() => {})
      .finally(() => setBannerLoading(false))
  }, [])

  useEffect(() => {
    fetchImpactBannerCarbon()
    const id = window.setInterval(fetchImpactBannerCarbon, 60_000)
    return () => window.clearInterval(id)
  }, [fetchImpactBannerCarbon])

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
      setImpactError('Enter a valid 5-digit Atlanta zip code.')
      return
    }
    setImpactError(null)
    setImpactResult(null)
    setSubmittedZip(null)
    setCopyDone(false)
    setSuggestOpen(false)
    setImpactLoading(true)
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
      setImpactResult(data)
    } catch (err) {
      setImpactError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setImpactLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) return undefined
    let cancelled = false
    const t = window.setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (cancelled || zipManuallyEditedRef.current) return
          try {
            const lat = pos.coords.latitude
            const lon = pos.coords.longitude
            const r = await fetch(
              `${API_BASE}/api/reverse-geocode?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
            )
            if (!r.ok || cancelled || zipManuallyEditedRef.current) return
            const data = await r.json().catch(() => ({}))
            const pc = data.postcode
            if (
              !pc ||
              typeof pc !== 'string' ||
              cancelled ||
              zipManuallyEditedRef.current
            )
              return
            const z = pc.replace(/\D/g, '').slice(0, 5)
            if (z.length !== 5) return
            if (cancelled || zipManuallyEditedRef.current) return
            setZip(z)
            setAutoDetectedFromLocation(true)
            setSuggestOpen(false)
            void submitZipCode(z)
          } catch {
            /* ignore */
          }
        },
        () => {},
        {
          enableHighAccuracy: false,
          timeout: 15_000,
          maximumAge: 300_000,
        },
      )
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [submitZipCode])

  const onImpactSubmit = useCallback(
    (e) => {
      e.preventDefault()
      zipManuallyEditedRef.current = true
      setAutoDetectedFromLocation(false)
      void submitZipCode(normalizedZip)
    },
    [normalizedZip, submitZipCode],
  )

  const pickSuggestion = useCallback(
    (zipCode) => {
      zipManuallyEditedRef.current = true
      setAutoDetectedFromLocation(false)
      setZip(zipCode)
      setSuggestOpen(false)
      void submitZipCode(zipCode)
    },
    [submitZipCode],
  )

  const onNoMatchPick = useCallback(() => {
    zipManuallyEditedRef.current = true
    setAutoDetectedFromLocation(false)
    setSuggestOpen(false)
    if (normalizedZip.length === 5) {
      void submitZipCode(normalizedZip)
    }
  }, [normalizedZip, submitZipCode])

  const neighborhoodLabel = impactResult
    ? formatNeighborhoodLabel(impactResult.neighborhood_name)
    : ''
  const equiv = impactResult ? humanEquivalents(impactResult.datacenter_mw) : null

  const fetchAiPost = useCallback(async () => {
    if (!impactResult) return
    setAiPostLoading(true)
    setAiPostError(null)
    try {
      const homes = Math.round(humanEquivalents(impactResult.datacenter_mw).homes)
      const r = await fetch(`${API_BASE}/api/generate-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          neighborhood: neighborhoodLabel,
          bill_increase: impactResult.increase,
          datacenter_name: impactResult.datacenter_name,
          datacenter_mw: impactResult.datacenter_mw,
          homes_powered: homes,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        let msg = 'Could not generate post. Try again.'
        if (typeof data.detail === 'string') msg = data.detail
        else if (Array.isArray(data.detail)) {
          msg = data.detail
            .map((d) => (typeof d === 'object' && d?.msg ? d.msg : String(d)))
            .join(' ')
        }
        throw new Error(msg)
      }
      const post = typeof data.post === 'string' ? data.post.trim() : ''
      if (!post) throw new Error('Empty post from server.')
      setAiPost(post)
    } catch (err) {
      setAiPostError(err instanceof Error ? err.message : 'Could not generate post.')
      setAiPost(null)
    } finally {
      setAiPostLoading(false)
    }
  }, [impactResult, neighborhoodLabel])

  useEffect(() => {
    if (!impactResult) {
      setAiPost(null)
      setAiPostError(null)
      setAiPostLoading(false)
      return
    }
    if (impactLoading) return
    void fetchAiPost()
  }, [impactResult, impactLoading, fetchAiPost])

  const pscDraft = useMemo(() => {
    if (!impactResult) return null
    const parts = buildPscEmailParts(neighborhoodLabel, impactResult.increase)
    return {
      ...parts,
      mailto: buildPscMailtoFromParts(parts.subject, parts.body),
    }
  }, [impactResult, neighborhoodLabel])

  const impactBanner = useMemo(() => {
    const base = gridIntensityQuality(bannerCarbon)
    const hasValue =
      bannerCarbon != null &&
      typeof bannerCarbon === 'number' &&
      !Number.isNaN(bannerCarbon)
    const tone = bannerLoading && !hasValue ? 'muted' : base.tone
    const phrase = bannerLoading && !hasValue ? 'updating' : base.phrase
    return { hasValue, tone, phrase }
  }, [bannerCarbon, bannerLoading])

  const copyAiPostPlain = useCallback(async () => {
    if (!aiPost) return
    try {
      await navigator.clipboard.writeText(aiPost)
      setCopyDone(true)
      window.setTimeout(() => setCopyDone(false), 2500)
    } catch {
      setImpactError('Could not copy to clipboard.')
    }
  }, [aiPost])

  const openTwitterShare = useCallback(() => {
    if (!aiPost) return
    const text = truncateForTweet(aiPost, 278)
    const href = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`
    window.open(href, '_blank', 'noopener,noreferrer')
  }, [aiPost])

  const openLinkedInShare = useCallback(() => {
    if (!aiPost) return
    const pageUrl = window.location.href
    const title = 'WattWatch ATL — Atlanta data center neighborhood impact'
    const href = `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(pageUrl)}&title=${encodeURIComponent(title)}&summary=${encodeURIComponent(aiPost)}&source=WattWatchATL`
    window.open(href, '_blank', 'noopener,noreferrer')
  }, [aiPost])

  const openInstagramShare = useCallback(async () => {
    if (!aiPost) return
    try {
      await navigator.clipboard.writeText(aiPost)
      setSocialFeedback(
        'Caption copied. We opened Instagram — paste it into a new post (Instagram has no web draft link).',
      )
      window.setTimeout(() => setSocialFeedback(null), 8000)
      window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')
    } catch {
      setImpactError('Could not copy caption for Instagram.')
    }
  }, [aiPost])

  const copyPscEmail = useCallback(async () => {
    if (!impactResult) return
    const text = buildPscEmailClipboard(
      neighborhoodLabel,
      impactResult.increase,
    )
    try {
      await navigator.clipboard.writeText(text)
      setEmailCopyDone(true)
      window.setTimeout(() => setEmailCopyDone(false), 2500)
    } catch {
      setImpactError('Could not copy email to clipboard.')
    }
  }, [impactResult, neighborhoodLabel])

  const showFallbackBanner =
    impactResult &&
    submittedZip &&
    impactResult.resolved_zip &&
    submittedZip !== impactResult.resolved_zip

  const showPrompt =
    !impactLoading &&
    !impactResult &&
    !impactError &&
    normalizedZip.length === 0

  const zipEntered = normalizedZip.length === 5

  return (
    <>
      <p className="map-page__section-label">NEIGHBORHOOD IMPACT</p>
      <div className="map-page__rail-impact">
            <form className="map-page__impact-form" onSubmit={onImpactSubmit}>
              <div className="map-page__combo" ref={comboRef}>
                <input
                  id="map-impact-zip"
                  className="map-page__impact-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="Atlanta zip (e.g. 30318)"
                  value={zip}
                  onChange={(e) => {
                    zipManuallyEditedRef.current = true
                    setAutoDetectedFromLocation(false)
                    setZip(e.target.value)
                    setImpactError(null)
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
                  aria-controls="map-impact-zip-suggestions"
                  maxLength={10}
                />
                {showSuggestPanel && (
                  <ul
                    id="map-impact-zip-suggestions"
                    className="map-page__suggest"
                    role="listbox"
                  >
                    {suggestions.map((s) => (
                      <li
                        key={s.zip}
                        className="map-page__suggest-item"
                        role="option"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          pickSuggestion(s.zip)
                        }}
                      >
                        <span className="map-page__suggest-zip">{s.zip}</span>
                        <span className="map-page__suggest-sep" aria-hidden="true">
                          ·
                        </span>
                        <span className="map-page__suggest-place">{s.place}</span>
                      </li>
                    ))}
                    {showNoMatch && (
                      <li
                        className="map-page__suggest-item map-page__suggest-item--empty"
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
                className="map-page__impact-check"
                disabled={impactLoading}
              >
                Check
              </button>
            </form>

            {impactError && (
              <p className="map-page__impact-error" role="alert">
                {impactError}
              </p>
            )}

            {impactLoading && (
              <div className="map-page__impact-loading" aria-live="polite">
                <div className="map-page__spinner" aria-hidden="true" />
                <p className="map-page__impact-loading-text">
                  Generating neighborhood insights…
                </p>
              </div>
            )}

            {showPrompt && (
              <div className="map-page__prompt">
                <LightningPromptIcon />
                <p className="map-page__prompt-text">
                  Enter your zip code to see how data centers affect your neighborhood
                </p>
              </div>
            )}

            {impactResult && !impactLoading && (
              <section
                className="map-page__impact-results map-page__impact-results-card"
                aria-label="Impact results"
              >
                {showFallbackBanner && (
                  <div className="map-page__fallback-banner" role="status">
                    {`We don't have specific data for zip code ${submittedZip} yet — showing nearest available Atlanta data instead.`}
                  </div>
                )}
                {impactResult.ai_source === 'fallback' && (
                  <div className="map-page__groq-fallback-banner" role="status">
                    Groq couldn&apos;t be reached — showing template insights. Check
                    network, VPN, or firewall; confirm{' '}
                    <code className="map-page__code">GROQ_API_KEY</code> in{' '}
                    <code className="map-page__code">backend/.env</code>.
                  </div>
                )}
                <h3 className="map-page__neighborhood">{neighborhoodLabel}</h3>
                {autoDetectedFromLocation && (
                  <p className="map-page__auto-loc">
                    📍 Auto-detected from your location
                  </p>
                )}
                <p className="map-page__bill-up">
                  Bill up{' '}
                  <span className="map-page__bill-up-em">${impactResult.increase}</span>
                  /mo since 2022
                </p>

                <div className="map-page__bullets">
                  {impactResult.ai_bullets.map((text, i) => (
                    <div
                      key={i}
                      className={`map-page__bullet ${bulletBorderClasses[i] ?? bulletBorderClasses[2]}`}
                    >
                      <p className="map-page__bullet-text">{text}</p>
                    </div>
                  ))}
                </div>

                <div className="map-page__equiv-col">
                  <div className="map-page__equiv-box">
                    <span className="map-page__equiv-main">
                      {formatIntLocale(equiv.homes)} homes
                    </span>
                    <span className="map-page__equiv-sub">
                      powered by nearest data center
                    </span>
                  </div>
                  <div className="map-page__equiv-box">
                    <span className="map-page__equiv-main">
                      {formatIntLocale(equiv.carTrips)} car trips
                    </span>
                    <span className="map-page__equiv-sub">
                      equivalent daily energy
                    </span>
                  </div>
                  <div className="map-page__equiv-box">
                    <span className="map-page__equiv-main">
                      {formatIntLocale(equiv.tonsCo2PerDay)} tons CO2
                    </span>
                    <span className="map-page__equiv-sub">emitted per day</span>
                  </div>
                </div>
              </section>
            )}
      </div>

      <p className="map-page__section-label">TAKE ACTION</p>
      <div className="map-page__rail-takeaction">
            <div
              className={`map-page__impact-grid-banner map-page__impact-grid-banner--${impactBanner.tone}`}
              role="status"
              aria-live="polite"
            >
              <span className="map-page__impact-grid-banner-icon" aria-hidden="true">
                ⚡
              </span>
              <span className="map-page__impact-grid-banner-text">
                Georgia Power&apos;s grid is currently at{' '}
                {impactBanner.hasValue ? (
                  <>
                    <strong>{bannerCarbon}</strong> {bannerUnit}
                  </>
                ) : bannerLoading ? (
                  <>… {bannerUnit}</>
                ) : (
                  <>— {bannerUnit}</>
                )}
                {' — '}
                <span className="map-page__impact-grid-banner-tag">
                  {impactBanner.phrase}
                </span>
                {' right now'}
              </span>
            </div>

            {pscDraft ? (
              <div className="map-page__action-card map-page__action-card--psc">
                <h3 className="map-page__action-card-title">Contact Georgia PSC</h3>
                <p className="map-page__action-card-desc">
                  Full draft below. Copy as text or open your mail app with To,
                  subject, and body filled in.
                </p>
                <div className="map-page__psc-to">
                  <span className="map-page__psc-to-label">Email to</span>
                  <a
                    className="map-page__psc-to-addr"
                    href={`mailto:${PSC_EMAIL_TO}`}
                  >
                    {PSC_EMAIL_TO}
                  </a>
                  <span className="map-page__psc-to-note">
                    Georgia Public Service Commission (general contact)
                  </span>
                </div>
                <div className="map-page__email-full">
                  <div className="map-page__email-full-field">
                    <span className="map-page__email-full-k">Subject</span>
                    <p className="map-page__email-full-subject">{pscDraft.subject}</p>
                  </div>
                  <div className="map-page__email-full-field">
                    <span className="map-page__email-full-k">Body</span>
                    <p className="map-page__email-full-body">{pscDraft.body}</p>
                  </div>
                </div>
                <div className="map-page__psc-btn-row">
                  <button
                    type="button"
                    className="map-page__action-btn map-page__action-btn--primary"
                    onClick={copyPscEmail}
                  >
                    {emailCopyDone ? 'Copied!' : 'Copy Email'}
                  </button>
                  <a
                    className="map-page__action-send"
                    href={pscDraft.mailto}
                    aria-label="Open your email app with To, subject, and body filled for the Georgia PSC"
                  >
                    <SendMailIcon />
                    <span>Send now</span>
                  </a>
                </div>
              </div>
            ) : (
              <div
                className="map-page__action-placeholder"
                aria-live="polite"
              >
                <p className="map-page__action-placeholder-text">
                  Enter your zip in <strong>Neighborhood Impact</strong> and tap{' '}
                  <strong>Check</strong> to generate your PSC email with local bill
                  context, then copy or open it in your mail app here.
                </p>
              </div>
            )}

            <div className="map-page__action-card">
              <h3 className="map-page__action-card-title">Find Your Rep</h3>
              <p className="map-page__action-card-desc">
                Look up who represents you in the Georgia State Senate.
              </p>
              <a
                className={
                  zipEntered
                    ? 'map-page__action-link'
                    : 'map-page__action-link map-page__action-link--dull'
                }
                href={
                  zipEntered
                    ? 'https://www.legis.ga.gov/members/senate'
                    : '#'
                }
                target={zipEntered ? '_blank' : undefined}
                rel={zipEntered ? 'noopener noreferrer' : undefined}
                tabIndex={zipEntered ? undefined : -1}
                aria-disabled={!zipEntered}
                onClick={(e) => {
                  if (!zipEntered) e.preventDefault()
                }}
              >
                Find your Georgia State Senator →
              </a>
            </div>

            <div className="map-page__action-card">
              <h3 className="map-page__action-card-title">Share the Data</h3>
              <p className="map-page__action-card-desc">
                After you check your zip, we generate an AI post you can share on
                social or copy.
              </p>
              {!impactResult && (
                <p className="map-page__action-placeholder-text map-page__share-placeholder">
                  Run a zip check above to generate your post.
                </p>
              )}
              {impactResult && aiPostLoading && (
                <div
                  className="map-page__post-generating"
                  aria-live="polite"
                >
                  <div className="map-page__spinner" aria-hidden="true" />
                  <p className="map-page__post-generating-text">Generating post…</p>
                </div>
              )}
              {impactResult && !aiPostLoading && aiPostError && !aiPost && (
                <p className="map-page__post-draft-error" role="alert">
                  {aiPostError}{' '}
                  <button
                    type="button"
                    className="map-page__post-draft-retry"
                    onClick={() => void fetchAiPost()}
                  >
                    Retry
                  </button>
                </p>
              )}
              {impactResult && aiPost && !aiPostLoading && (
                <div className="map-page__post-draft-card">
                  <div className="map-page__post-draft-head">
                    <span className="map-page__post-draft-kicker">POST DRAFT</span>
                    <button
                      type="button"
                      className="map-page__post-draft-regen"
                      onClick={() => void fetchAiPost()}
                      disabled={aiPostLoading}
                    >
                      ↻ Regenerate
                    </button>
                  </div>
                  <div className="map-page__post-draft-body">
                    <PostDraftBody text={aiPost} />
                  </div>
                  <div className="map-page__share-actions-grid">
                    <button
                      type="button"
                      className="map-page__share-grid-btn map-page__share-grid-btn--primary"
                      onClick={openTwitterShare}
                      disabled={!aiPost}
                      aria-label="Post on X"
                    >
                      <IconX />
                      <span>Post on X</span>
                    </button>
                    <button
                      type="button"
                      className="map-page__share-grid-btn map-page__share-grid-btn--primary"
                      onClick={openLinkedInShare}
                      disabled={!aiPost}
                      aria-label="Post on LinkedIn"
                    >
                      <IconLinkedIn />
                      <span>Post on LinkedIn</span>
                    </button>
                    <button
                      type="button"
                      className="map-page__share-grid-btn map-page__share-grid-btn--primary"
                      onClick={() => void openInstagramShare()}
                      disabled={!aiPost}
                      aria-label="Copy for Instagram"
                    >
                      <IconInstagram />
                      <span>Copy for Instagram</span>
                    </button>
                    <button
                      type="button"
                      className="map-page__share-grid-btn map-page__share-grid-btn--outline"
                      onClick={copyAiPostPlain}
                      disabled={!aiPost}
                    >
                      {copyDone ? 'Copied!' : 'Copy text only'}
                    </button>
                  </div>
                </div>
              )}
              {socialFeedback && (
                <p className="map-page__share-feedback" role="status">
                  {socialFeedback}
                </p>
              )}
            </div>
      </div>
    </>
  )
}
