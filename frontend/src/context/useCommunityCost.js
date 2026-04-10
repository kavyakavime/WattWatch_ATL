import { useContext } from 'react'
import { CommunityCostContext } from './communityCost.js'

export function useCommunityCost() {
  const ctx = useContext(CommunityCostContext)
  if (!ctx) {
    throw new Error('useCommunityCost must be used within CommunityCostProvider')
  }
  return ctx
}
