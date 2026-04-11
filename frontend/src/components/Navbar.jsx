import { NavLink } from 'react-router-dom'
import { useCarbonIntensity } from '../context/useCarbonIntensity'
import { useCommunityCost } from '../context/useCommunityCost'
import './Navbar.css'

const nav = [
  { to: '/map', label: 'Atlanta Energy Map' },
  { to: '/impact', label: 'Community Impact' },
  { to: '/scheduler', label: 'Green Scheduler' },
]

function formatCommunityCost(usd) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(usd)
}

function intensityBadgeDotClass(loading, current) {
  if (loading) return 'navbar__badge-dot--loading'
  if (current == null) return 'navbar__badge-dot--muted'
  if (current < 300) return 'navbar__badge-dot--good'
  if (current <= 400) return 'navbar__badge-dot--warn'
  return 'navbar__badge-dot--bad'
}

function intensityBadgeText(loading, current, unit) {
  if (loading) return 'Loading...'
  if (current == null) return '—'
  const n = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(current)
  return `${n} ${unit}`
}

export default function Navbar() {
  const { amountUsd } = useCommunityCost()
  const { loading: ciLoading, current, unit } = useCarbonIntensity()

  return (
    <header className="navbar">
      <div className="navbar__brand">
        <img
          className="navbar__logo"
          src="/wattwatch_logo.png"
          alt=""
          decoding="async"
        />
        <span className="navbar__title">WattWatch ATL</span>
      </div>

      <nav className="navbar__links" aria-label="Main">
        {nav.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `navbar__link${isActive ? ' navbar__link--active' : ''}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="navbar__meta">
        <div className="navbar__badge" title="Grid carbon intensity">
          <span
            className={`navbar__badge-dot ${intensityBadgeDotClass(ciLoading, current)}`}
            aria-hidden="true"
          />
          <span className="navbar__badge-text">
            {intensityBadgeText(ciLoading, current, unit)}
          </span>
        </div>
        <div className="navbar__counter" aria-live="polite">
          <span className="navbar__counter-label">COMMUNITY COST</span>
          <span className="navbar__counter-value">{formatCommunityCost(amountUsd)}</span>
        </div>
      </div>
    </header>
  )
}
