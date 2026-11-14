import { describe, it, expect } from 'vitest'
import { googleMapsLink, mergePlaces, parseCoordinates, parseNominatim, parsePlaces, searchPlaces } from './geocode.js'

describe('parseCoordinates', () => {
  it('reads plain pairs', () => {
    expect(parseCoordinates('10.95, 77.1')).toEqual({ lat: 10.95, lon: 77.1 })
    expect(parseCoordinates('10.95 77.1')).toEqual({ lat: 10.95, lon: 77.1 })
    expect(parseCoordinates('-31.6,117.2')).toEqual({ lat: -31.6, lon: 117.2 })
  })
  it('reads N/S/E/W letters', () => {
    expect(parseCoordinates('31.6S 117.2E')).toEqual({ lat: -31.6, lon: 117.2 })
    expect(parseCoordinates('42.03 N, 93.62 W')).toEqual({ lat: 42.03, lon: -93.62 })
  })
  it('reads Google Maps links', () => {
    expect(parseCoordinates('https://www.google.com/maps/@10.95,77.1,15z')).toEqual({ lat: 10.95, lon: 77.1 })
    expect(parseCoordinates('https://www.google.com/maps/place/Farm/data=!3d42.03!4d-93.62')).toEqual({ lat: 42.03, lon: -93.62 })
    expect(parseCoordinates('https://www.google.com/maps?q=0.55,35.2')).toEqual({ lat: 0.55, lon: 35.2 })
  })
  it('rejects text and out-of-range values', () => {
    expect(parseCoordinates('hello')).toBeNull()
    expect(parseCoordinates('')).toBeNull()
    expect(parseCoordinates('120, 10')).toBeNull()
    expect(parseCoordinates('10, 200')).toBeNull()
  })
})

describe('links and places', () => {
  it('builds a Google Maps link', () => {
    expect(googleMapsLink(10.95, 77.1)).toBe('https://www.google.com/maps?q=10.95,77.1')
  })
  it('parses place search results', () => {
    const p = parsePlaces({ results: [{ name: 'Ames', admin1: 'Iowa', country: 'United States', latitude: 42.03, longitude: -93.62 }] })
    expect(p).toEqual([{ name: 'Ames, Iowa, United States', lat: 42.03, lon: -93.62 }])
    expect(parsePlaces({})).toEqual([])
  })
})

describe('place name search', () => {
  it('parses OpenStreetMap results (landmarks, villages, farms)', () => {
    const p = parseNominatim([{ display_name: 'Eiffel Tower, Paris, France', lat: '48.8582599', lon: '2.2945006', type: 'tower' }, { display_name: 'bad', lat: 'x', lon: 'y' }])
    expect(p).toEqual([{ name: 'Eiffel Tower, Paris, France', lat: 48.8582599, lon: 2.2945006, kind: 'tower' }])
    expect(parseNominatim(null)).toEqual([])
  })
  it('merges sources and drops places within about 1 km of one already listed', () => {
    const m = mergePlaces([[{ name: 'A', lat: 10.0, lon: 77.0 }], [{ name: 'A again', lat: 10.003, lon: 77.004 }, { name: 'B', lat: 11, lon: 78 }]])
    expect(m.map((x) => x.name)).toEqual(['A', 'B'])
  })
  it('returns results from the sources that work when another fails', async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes('nominatim')) throw new Error('down')
      return { ok: true, json: async () => ({ results: [{ name: 'Ames', admin1: 'Iowa', country: 'USA', latitude: 42.03, longitude: -93.62 }] }) }
    }
    const r = await searchPlaces('Ames', { fetchImpl })
    expect(r[0].name).toBe('Ames, Iowa, USA')
  })
  it('throws only when every source fails', async () => {
    await expect(searchPlaces('Ames', { fetchImpl: async () => { throw new Error('offline') } })).rejects.toThrow()
  })
  it('ignores very short queries', async () => expect(await searchPlaces('a')).toEqual([]))
})
