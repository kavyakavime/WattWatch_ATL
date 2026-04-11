import { useEffect, useState } from 'react'
import { CommunityCostContext } from './communityCost.js'

/** $60B over 30 years ≈ $63.27/s → $6.327 per 100ms tick */
const INCREMENT_PER_TICK_USD = 6.327
const TICK_MS = 100

const INITIAL_AMOUNT_USD = 47_200_000_000

export function CommunityCostProvider({ children }) {
  const [amountUsd, setAmountUsd] = useState(INITIAL_AMOUNT_USD)

  useEffect(() => {
    const id = window.setInterval(() => {
      setAmountUsd((prev) => prev + INCREMENT_PER_TICK_USD)
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const value = { amountUsd }
  return (
    <CommunityCostContext.Provider value={value}>
      {children}
    </CommunityCostContext.Provider>
  )
}
