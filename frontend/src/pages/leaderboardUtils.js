/** Green Score: PUE (max 40) + renewable (max 60), total max 100 */

export function puePoints(pue) {
  if (pue <= 1.2) return 40
  if (pue <= 1.3) return 32
  if (pue <= 1.4) return 24
  if (pue <= 1.5) return 16
  return 8
}

export function renewablePoints(pct) {
  return Math.min(60, Number(pct) * 0.6)
}

export function computeGreenScore(pue, renewablePct) {
  return Math.round(puePoints(pue) + renewablePoints(renewablePct))
}

export function pueTone(pue) {
  if (pue < 1.3) return 'green'
  if (pue <= 1.5) return 'amber'
  return 'red'
}

export function renewableTone(pct) {
  if (pct > 30) return 'green'
  if (pct >= 15) return 'amber'
  return 'red'
}

export function scoreBarTone(score) {
  if (score >= 60) return 'green'
  if (score >= 35) return 'amber'
  return 'red'
}
