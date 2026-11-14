import { describe, it, expect } from 'vitest'
import { bareFractionByMonth, occupancyByYear, resolveRotation, totalCropDays, validateRotation, yearTotals } from './rotation.js'
import { rotationKey, rotationName } from './names.js'
import { indexDays, seasonIndicators, thermalWindow } from '../indicators/climate.js'
import crops from '../data/crops.json'

const cropsById = Object.fromEntries(crops.map((c) => [c.id, c]))
const items = (list) => resolveRotation({ id: 't', crops: list }, cropsById)

describe('multi-year rotations', () => {
  it('maize in year 1 and soybean in year 2 do not overlap even with the same sowing month', () => {
    expect(validateRotation(items([{ crop: 'maize', sowMonth: 5, year: 0 }, { crop: 'soybean', sowMonth: 5, year: 1 }]))).toEqual([])
  })
  it('the same two crops in one year overlap', () => {
    expect(validateRotation(items([{ crop: 'maize', sowMonth: 5 }, { crop: 'soybean', sowMonth: 5 }])).length).toBeGreaterThan(0)
  })
  it('a crop running past 31 December carries into the next year of the cycle', () => {
    const occ = occupancyByYear(items([{ crop: 'wheat', sowMonth: 11, year: 0 }, { crop: 'maize', sowMonth: 5, year: 1 }]))
    expect(occ).toHaveLength(2)
    expect(occ[1][0]).toBe(0) // wheat still in the field on 1 Jan of year 2
    expect(validateRotation(items([{ crop: 'wheat', sowMonth: 11, year: 0 }, { crop: 'maize', sowMonth: 5, year: 1 }]))).toEqual([])
  })
  it('bare fraction averages over the years of the cycle', () => {
    const bare = bareFractionByMonth(items([{ crop: 'maize', sowMonth: 5, year: 0 }, { crop: 'soybean', sowMonth: 5, year: 1 }]))
    expect(bare[0]).toBe(1)
    expect(bare[5]).toBe(0) // June is covered in both years
  })
  it('crop days are averaged per year', () => {
    const it2 = items([{ crop: 'maize', sowMonth: 5, year: 0 }, { crop: 'soybean', sowMonth: 5, year: 1 }])
    expect(yearTotals(it2)).toHaveLength(2)
    expect(totalCropDays(it2)).toBeCloseTo((120 + 115) / 2)
  })
  it('names and keys include the cycle', () => {
    expect(rotationName(['Maize', 'Soybean'], 2)).toBe('Maize, then Soybean (2-year cycle)')
    expect(rotationName(['Wheat'], 1)).toBe('Wheat, then fallow')
    expect(rotationKey({ crops: [{ crop: 'maize', sowMonth: 5, year: 1 }] })).toBe('maize@5@1')
  })
})

describe('thermal seasons (dormancy and frost)', () => {
  // Synthetic cold-winter site: 3 years, warm Apr-Oct (15 C), cold otherwise (-5 C), coldest night -25 C in January.
  const days = []
  ;[2000, 2001, 2002, 2003].forEach((y) => {
    for (let m = 1; m <= 12; m += 1) {
      const n = new Date(Date.UTC(y, m, 0)).getUTCDate()
      for (let d = 1; d <= n; d += 1) {
        const warm = m >= 4 && m <= 10
        days.push({ year: y, month: m, day: d, t2m: warm ? 15 : -5, tmax: warm ? 22 : 0, tmin: m === 1 && d === 15 ? -25 : warm ? 8 : -10, rain: 1, rh: 70 })
      }
    }
  })
  const index = indexDays(days)
  it('counts only growing days, so a winter crop sown in October stretches across the winter', () => {
    const recs = thermalWindow(index, 2000, 10, 100, 0)
    expect(recs.length).toBeGreaterThan(200) // Oct (31 growing) then dormant until April
    expect(recs.length).toBeLessThan(365)
  })
  it('returns null when the crop never collects enough growing days', () => {
    expect(thermalWindow(index, 2000, 11, 400, 0, 120)).toBeNull()
  })
  it('frost-kill share is the share of years with a night colder than the crop survives', () => {
    const tender = seasonIndicators(days, index, { lat: 45, sowMonth: 10, durationDays: 100, baseT: 0, killC: 0 })
    expect(tender.killShare).toBe(1)
    const hardy = seasonIndicators(days, index, { lat: 45, sowMonth: 10, durationDays: 100, baseT: 0, killC: -30 })
    expect(hardy.killShare).toBe(0)
  })
  it('average temperature is taken over growing days only', () => {
    const s = seasonIndicators(days, index, { lat: 45, sowMonth: 10, durationDays: 100, baseT: 0, killC: -30 })
    expect(s.tmeanMean).toBe(15)
  })
})

