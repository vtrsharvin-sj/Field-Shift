import { describe, it, expect } from 'vitest'
import { cv, linearSlope, longestRun, percentile, mean } from './stats.js'
import { annualTrends, describeTrends, extraterrestrialRadiation, hargreavesEt0, indexDays, seasonIndicators, windowRecords, monthlyClimatology } from './climate.js'
import { buildUrl, parsePowerResponse, validateLocation } from '../api/power.js'

// Test fixtures: tiny synthetic series, only used in tests.
function makeDays(years, fn) {
  const out = []
  years.forEach((y) => {
    for (let m = 1; m <= 12; m += 1) {
      const n = new Date(Date.UTC(y, m, 0)).getUTCDate()
      for (let d = 1; d <= n; d += 1) out.push({ date: `${y}${m}${d}`, year: y, month: m, day: d, ...fn({ y, m, d }) })
    }
  })
  return out
}

describe('stats', () => {
  it('percentile interpolates', () => expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3))
  it('cv of equal values is 0', () => expect(cv([5, 5, 5])).toBe(0))
  it('longestRun counts consecutive matches and treats null as a break', () => {
    expect(longestRun([0, 0, 5, 0, 0, 0, null, 0], (v) => v < 1)).toBe(3)
  })
  it('linearSlope finds slope', () => expect(linearSlope([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(2))
})

describe('evapotranspiration', () => {
  it('Ra at equator on day 1 is about 36 MJ/m2/day (FAO-56 table: 35.8 at 0 deg Jan)', () => {
    expect(extraterrestrialRadiation(0, 1)).toBeGreaterThan(34)
    expect(extraterrestrialRadiation(0, 1)).toBeLessThan(38)
  })
  it('Hargreaves ET0 is plausible for a warm tropical day (3 to 7 mm)', () => {
    const et = hargreavesEt0({ tmean: 27, tmax: 33, tmin: 21, lat: 11, doy: 100 })
    expect(et).toBeGreaterThan(3)
    expect(et).toBeLessThan(7)
  })
  it('returns null when temperature is missing', () => {
    expect(hargreavesEt0({ tmean: null, tmax: 30, tmin: 20, lat: 11, doy: 1 })).toBeNull()
  })
})

describe('season indicators', () => {
  const days = makeDays([2020, 2021, 2022], ({ y, m, d }) => ({
    t2m: 25,
    tmax: m === 4 && d <= 10 ? 38 : 30, // 10 hot days every April
    tmin: m === 1 && d <= 3 ? 1 : 18, // 3 frost nights every January
    rain: m === 6 ? 10 + (y - 2020) * 2 : 0, // June rains only: 300, 360, 420 mm/year differs by year
    rh: 70,
    gwetroot: 0.5,
  }))
  const index = indexDays(days)

  it('windowRecords returns null if the window runs past the data', () => {
    expect(windowRecords(index, 2022, 12, 90)).toBeNull()
    expect(windowRecords(index, 2021, 12, 90)).not.toBeNull()
  })

  it('counts heat days, dry stretch and rainfall in a season', () => {
    // April to June, 91 days
    const s = seasonIndicators(days, index, { lat: 11, sowMonth: 4, durationDays: 91, kc: 1 })
    expect(s.years).toBe(3)
    expect(s.heatDaysMean).toBe(10)
    expect(s.frostDaysMean).toBe(0)
    expect(s.rainMean).toBeCloseTo(((300 + 360 + 420) / 3), 0)
    expect(s.longestDryStretchMean).toBe(61) // April 1 to May 31
    expect(s.soilWetnessMean).toBeCloseTo(0.5)
    expect(s.rainCV).toBeGreaterThan(0)
  })

  it('water balance equals rain minus Kc x ET0', () => {
    const s = seasonIndicators(days, index, { lat: 11, sowMonth: 4, durationDays: 91, kc: 1.2 })
    expect(s.waterBalanceMean).toBeCloseTo(s.rainMean - 1.2 * s.et0Mean, 5)
  })

  it('counts frost nights below 2 C', () => {
    const s = seasonIndicators(days, index, { lat: 11, sowMonth: 1, durationDays: 31 })
    expect(s.frostDaysMean).toBe(3)
  })

  it('monthly climatology gives 12 months with rainfall means', () => {
    const c = monthlyClimatology(days, { lat: 11 })
    expect(c).toHaveLength(12)
    expect(c[5].rainMm).toBeCloseTo(360, 0)
    expect(c[0].rainMm).toBe(0)
  })
})

describe('trends', () => {
  it('detects a falling rainfall trend and describes it in plain language', () => {
    const days = makeDays([2000, 2001, 2002, 2003, 2004], ({ y }) => ({ t2m: 25 + (y - 2000) * 0.1, rain: 5 - (y - 2000) * 0.5 }))
    const t = annualTrends(days)
    expect(t.rainSlopeMmPerYear).toBeLessThan(0)
    expect(t.tempSlopeCPerYear).toBeGreaterThan(0)
    expect(describeTrends(t).rain).toMatch(/dropped/)
  })
  it('says there is not enough data when fewer than 3 complete years exist', () => {
    const days = makeDays([2000, 2001], () => ({ t2m: 25, rain: 1 }))
    expect(describeTrends(annualTrends(days)).rain).toMatch(/Not enough/)
  })
})

describe('POWER client helpers', () => {
  const json = {
    geometry: { coordinates: [77, 11, 500] },
    properties: {
      parameter: {
        T2M: { 20240101: 20, 20240102: -999, 20240103: 22 },
        PRECTOTCORR: { 20240101: 0, 20240102: 1, 20240103: -999 },
      },
    },
  }
  it('turns -999 into null and reports completeness', () => {
    const p = parsePowerResponse(json)
    expect(p.days[1].t2m).toBeNull()
    expect(p.days[0].t2m).toBe(20)
    expect(p.meta.completeness).toBeCloseTo(4 / 6)
  })
  it('lists missing parameters', () => {
    const p = parsePowerResponse(json)
    expect(p.meta.missingParams).toContain('GWETROOT')
    expect(p.meta.missingParams).not.toContain('T2M')
  })
  it('throws on an empty response', () => {
    expect(() => parsePowerResponse({})).toThrow()
  })
  it('builds a URL with the documented query', () => {
    const u = buildUrl({ lat: 11, lon: 77, startYear: 2005, endYear: 2024 })
    expect(u).toContain('community=AG')
    expect(u).toContain('start=20050101')
    expect(u).toContain('PRECTOTCORR')
  })
  it('validates coordinates', () => {
    expect(validateLocation(11, 77)).toBeNull()
    expect(validateLocation(120, 77)).toMatch(/Latitude/)
    expect(validateLocation('x', 77)).toMatch(/numbers/)
  })
  it('mean helper', () => expect(mean([1, 3])).toBe(2))
})
