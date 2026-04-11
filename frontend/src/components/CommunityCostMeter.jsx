import { useCommunityCost } from '../context/useCommunityCost'
import './CommunityCostMeter.css'

const CAP_USD = 60_000_000_000

function formatCommunityCost(usd) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(usd)
}

export default function CommunityCostMeter() {
  const { amountUsd } = useCommunityCost()
  const fillPercent = Math.min(100, (amountUsd / CAP_USD) * 100)

  return (
    <div className="cost-meter-root cost-meter-hover">
      <div className="cost-meter__tooltip" role="tooltip">
        <p>
          Georgia Power&apos;s $16B grid expansion (80% for data centers) could
          cost Atlanta residents $60B over 30 years. Currently accumulating at
          $63/second.
        </p>
      </div>

      <div className="cost-meter__stack">
        <p className="cost-meter__kicker">COMMUNITY COST</p>
        <p className="cost-meter__usd" aria-live="polite">
          {formatCommunityCost(amountUsd)}
        </p>

        <div
          className="cost-meter__tank"
          role="img"
          aria-label={`Community cost fill ${fillPercent.toFixed(2)} percent of sixty billion dollar cap`}
        >
          <div className="cost-meter__ticks" aria-hidden="true">
            <span className="cost-meter__tick cost-meter__tick--25" />
            <span className="cost-meter__tick cost-meter__tick--50" />
            <span className="cost-meter__tick cost-meter__tick--75" />
            <span className="cost-meter__tick cost-meter__tick--100" />
          </div>
          <div
            className="cost-meter__fill"
            style={{ height: `${fillPercent}%` }}
          >
            <div className="cost-meter__fill-inner">
              <div className="cost-meter__fill-wave" aria-hidden="true" />
            </div>
          </div>
        </div>

        <p className="cost-meter__cap">$60B CAP</p>
      </div>
    </div>
  )
}
