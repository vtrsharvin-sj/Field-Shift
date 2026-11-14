import { describe, it, expect } from 'vitest'
import { chunkYear, parseSubset, buildSubsetUrl, runPool, LAYERS } from '../api/satellite.js'
import { gridPoints, slopePercent, slopeClass, STEP_DEG } from '../api/elevation.js'
import { monthlyMeans, pearson, ndviSummary, etSummary, lstSummary, seasonMonthValues, landCoverInfo, sourceAgreement } from './satellite.js'
import weights from '../data/weights.json'

describe('ORNL request helpers', () => {
  it('chunks a year into requests of at most 10 composites', () => {
    const c16 = chunkYear(2023, 16)
    expect(c16).toEqual([
      { startDate: 'A2023001', endDate: 'A2023145' },
      { startDate: 'A2023161', endDate: 'A2023305' },
      { startDate: 'A2023321', endDate: 'A2023353' },
    ])
    expect(chunkYear(2024, 8)).toHaveLength(5)
  })
  it('builds a subset URL for a single pixel', () => {
    const u = buildSubsetUrl({ product: 'MOD13Q1', band: 'b', lat: 11, lon: 77, startDate: 'A2023001', endDate: 'A2023145' })
    expect(u).toContain('/MOD13Q1/subset?')
    expect(u).toContain('kmAboveBelow=0')
  })
  it('scales values and turns fill codes into null', () => {
    const json = { scale: '0.0001', subset: [{ calendar_date: '2023-01-01', data: [3420] }, { calendar_date: '2023-01-17', data: [-3000] }] }
    const p = parseSubset(json, LAYERS.ndvi.isFill)
    expect(p[0].value).toBeCloseTo(0.342)
    expect(p[1].value).toBeNull()
  })
  it('treats MOD16 fill codes (above 32760) as missing', () => {
    expect(parseSubset({ scale: '0.1', subset: [{ calendar_date: '2023-01-01', data: [32762] }] }, LAYERS.et.isFill)[0].value).toBeNull()
  })
  it('runPool keeps going when a task fails', async () => {
    const r = await runPool([async () => 1, async () => { throw new Error('x') }, async () => 3], 2)
    expect(r.map((x) => x.ok)).toEqual([true, false, true])
  })
})

describe('slope', () => {
  it('flat ground has zero slope', () => expect(slopePercent(new Array(9).fill(400), 11)).toBeCloseTo(0))
  it('a plane rising 10 m over 2 steps north-south gives about the right slope', () => {
    const dy = STEP_DEG * 111320
    const z = [20, 20, 20, 10, 10, 10, 0, 0, 0] // north row highest, 10 m per step
    expect(slopePercent(z, 11)).toBeCloseTo((10 / dy) * 100, 1)
  })
  it('grid has 9 points centred on the farm', () => {
    const g = gridPoints(11, 77)
    expect(g).toHaveLength(9)
    expect(g[4]).toEqual({ lat: 11, lon: 77 })
  })
  it('classifies slope', () => {
    expect(slopeClass(1, weights.satellite.slopeClasses).label).toBe('flat')
    expect(slopeClass(7, weights.satellite.slopeClasses).label).toBe('moderate')
    expect(slopeClass(30, weights.satellite.slopeClasses).label).toBe('steep')
  })
})

describe('satellite indicators', () => {
  it('monthly means ignore nulls', () => {
    const m = monthlyMeans([{ date: '2023-01-01', value: 0.2 }, { date: '2023-01-17', value: 0.4 }, { date: '2023-01-25', value: null }, { date: '2023-03-01', value: 0.5 }])
    expect(m[0]).toBeCloseTo(0.3)
    expect(m[1]).toBeNull()
    expect(m[2]).toBe(0.5)
  })
  it('finds low-NDVI months', () => {
    const s = ndviSummary({ years: [2023], series: { '250m_16_days_NDVI': [{ date: '2023-04-01', value: 0.2 }, { date: '2023-08-01', value: 0.7 }] } }, 0.3)
    expect(s.lowMonths).toEqual([4])
  })
  it('computes ET / PET ratio per month', () => {
    const s = etSummary({ years: [2024], series: { ET_500m: [{ date: '2024-06-01', value: 20 }], PET_500m: [{ date: '2024-06-01', value: 40 }] } })
    expect(s.ratio[5]).toBeCloseTo(0.5)
    expect(s.et[5]).toBeCloseTo((20 / 8) * 30)
  })
  it('converts LST from Kelvin and reports hot share', () => {
    const s = lstSummary({ years: [2024], series: { LST_Day_1km: [{ date: '2024-04-01', value: 323.15 }, { date: '2024-04-09', value: 303.15 }] } }, 45)
    expect(s.monthlyC[3]).toBeCloseTo(40)
    expect(s.hotShare[3]).toBe(0.5)
  })
  it('season values average the covered months', () => {
    const m = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    expect(seasonMonthValues(m, 6, 91)).toBe(7) // Jun, Jul, Aug
    expect(seasonMonthValues(m, 11, 91)).toBe(((11 + 12 + 1) / 3))
  })
  it('names land cover and flags non-cropland', () => {
    expect(landCoverInfo(13)).toEqual({ name: 'urban or built-up area', isCropland: false })
    expect(landCoverInfo(12).isCropland).toBe(true)
  })
  it('pearson correlation', () => expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1))
  it('source agreement flags big differences', () => {
    const a = [100, 120, 140, 160, 150, 130]
    expect(sourceAgreement(a, a.map((v) => v * 1.1), { maxPctDiff: 35, minCorr: 0.5 }).agrees).toBe(true)
    expect(sourceAgreement(a, a.map((v) => v * 2), { maxPctDiff: 35, minCorr: 0.5 }).agrees).toBe(false)
    expect(sourceAgreement([1, 2, null, null, null, null], a, { maxPctDiff: 35, minCorr: 0.5 })).toBeNull()
  })
})
