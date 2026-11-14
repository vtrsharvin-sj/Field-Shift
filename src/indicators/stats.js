// Small pure statistics helpers.

export const sum = (xs) => xs.reduce((a, b) => a + b, 0)

export const mean = (xs) => (xs.length ? sum(xs) / xs.length : null)

/** Sample standard deviation. */
export function stdev(xs) {
  if (xs.length < 2) return null
  const m = mean(xs)
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1))
}

/** Coefficient of variation in percent (stdev / mean x 100). */
export function cv(xs) {
  const m = mean(xs)
  const s = stdev(xs)
  if (m == null || s == null || m === 0) return null
  return (s / m) * 100
}

/** Percentile with linear interpolation (p between 0 and 100). */
export function percentile(xs, p) {
  if (!xs.length) return null
  const a = [...xs].sort((x, y) => x - y)
  const idx = (p / 100) * (a.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return a[lo] + (a[hi] - a[lo]) * (idx - lo)
}

/** Least-squares slope of y against x. Returns null with fewer than 3 points. */
export function linearSlope(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return null
  const mx = mean(xs)
  const my = mean(ys)
  let num = 0
  let den = 0
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my)
    den += (x - mx) ** 2
  })
  return den === 0 ? null : num / den
}

/** Length of the longest run of consecutive items satisfying pred. Items that are null break nothing: they are skipped as unknown (counted as not satisfying). */
export function longestRun(items, pred) {
  let best = 0
  let cur = 0
  items.forEach((it) => {
    if (it != null && pred(it)) {
      cur += 1
      if (cur > best) best = cur
    } else {
      cur = 0
    }
  })
  return best
}

export const clamp = (x, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x))
