import { useEffect, useState } from 'react'
import { CommunityCostContext } from './communityCost.js'

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60
const ANNUAL_COMMUNITY_COST_DRIFT_USD = 60_000_000_000
const RATE_PER_SECOND = ANNUAL_COMMUNITY_COST_DRIFT_USD / SECONDS_PER_YEAR

const INITIAL_AMOUNT_USD = 47_200_000_000

export function CommunityCostProvider({ children }) {
  const [amountUsd, setAmountUsd] = useState(INITIAL_AMOUNT_USD)

  useEffect(() => {
    const id = window.setInterval(() => {
      setAmountUsd((prev) => prev + RATE_PER_SECOND)
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const value = { amountUsd }
  return (
    <CommunityCostContext.Provider value={value}>
      {children}
    </CommunityCostContext.Provider>
  )
}
