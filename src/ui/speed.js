// Speed slider mapping (pure). Owner: ui.
// world.speed: 0 = instant (maximum, identical to the original Imagine), 1..10 animated (1 slowest).
// The slider is monotonic: positions 1..10 animate, position 11 ("maks.") maps to speed 0.

export const SLIDER_MIN = 1
export const SLIDER_MAX = 11

export function sliderToSpeed(pos) {
  const p = Math.round(Number(pos))
  if (!Number.isFinite(p) || p >= SLIDER_MAX) return 0
  return Math.max(1, Math.min(10, p))
}

export function speedToSlider(speed) {
  const s = Math.round(Number(speed))
  if (!Number.isFinite(s) || s <= 0) return SLIDER_MAX
  return Math.max(1, Math.min(10, s))
}

export function speedLabel(speed) {
  return speed === 0 ? 'maks.' : String(speed)
}
