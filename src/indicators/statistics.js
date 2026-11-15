// Descriptive annual statistics and short-block bootstrap intervals for climate context.
// Intervals quantify variability in the observed record; they are not forecast intervals.
import { cv, linearSlope, mean, percentile, stdev } from './stats.js'

const B = 1000

function blockSample(values, rng, blockLength) {
  const sample = []
  while (sample.length < values.length) {
    const start = Math.floor(rng() * values.length)
    for (let i = 0; i < blockLength && sample.length < values.length; i += 1) sample.push(values[(start + i) % values.length])
  }
  return sample
}

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** Summarize complete annual observations with a deterministic, circular moving-block bootstrap. */
export function annualStatistics(rows, key) {
  const usable = rows.filter((row) => Number.isFinite(row[key]))
  const values = usable.map((row) => row[key])
  if (!values.length) return null
  const ys = usable.map((row) => row.year)
  const trend = linearSlope(ys, values)
  const result = {
    n: values.length,
    mean: mean(values),
    median: percentile(values, 50),
    sd: stdev(values),
    cv: cv(values),
    p10: percentile(values, 10),
    p25: percentile(values, 25),
    p75: percentile(values, 75),
    p90: percentile(values, 90),
    trendPerYear: trend,
    meanCI: null,
    trendCI: null,
    bootstrap: null,
  }
  // Very short records do not support a useful bootstrap interval.
  if (values.length < 8) return result
  const rng = seeded(values.length * 7919 + key.length * 104729)
  const blockLength = Math.min(3, Math.max(2, Math.round(values.length ** (1 / 3))))
  const means = []
  const slopes = []
  for (let i = 0; i < B; i += 1) {
    const draw = blockSample(values, rng, blockLength)
    means.push(mean(draw))
    slopes.push(linearSlope(draw.map((_, j) => j), draw))
  }
  result.meanCI = [percentile(means, 2.5), percentile(means, 97.5)]
  result.trendCI = [percentile(slopes, 2.5), percentile(slopes, 97.5)]
  result.bootstrap = { replicates: B, blockYears: blockLength }
  return result
}

