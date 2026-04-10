import { useContext } from 'react'
import { CarbonIntensityContext } from './carbonIntensity.js'

export function useCarbonIntensity() {
  const ctx = useContext(CarbonIntensityContext)
  if (!ctx) {
    throw new Error(
      'useCarbonIntensity must be used within CarbonIntensityProvider',
    )
  }
  return ctx
}
