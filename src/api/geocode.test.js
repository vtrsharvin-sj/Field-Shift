import { describe, it, expect } from 'vitest'
import { googleMapsLink, mergePlaces, parseCoordinates, parseNominatim, parsePhoton, parsePlaces, parseWikipediaPlaces, relevantTo, searchPlaces, suggestPlaces } from './geocode.js'

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
    expect(p).toMatchObject([{ name: 'Ames, Iowa, United States', lat: 42.03, lon: -93.62 }])
    expect(parsePlaces({})).toEqual([])
  })
})

describe('place name search', () => {
  it('parses OpenStreetMap results (landmarks, villages, farms)', () => {
    const p = parseNominatim([{ display_name: 'Eiffel Tower, Paris, France', lat: '48.8582599', lon: '2.2945006', type: 'tower' }, { display_name: 'bad', lat: 'x', lon: 'y' }])
    expect(p).toMatchObject([{ name: 'Eiffel Tower, Paris, France', lat: 48.8582599, lon: 2.2945006, kind: 'tower' }])
    expect(parseNominatim(null)).toEqual([])
  })
  it('merges sources and drops places within about 150 m of one already listed', () => {
    const m = mergePlaces([[{ name: 'A', lat: 10.0, lon: 77.0 }], [{ name: 'A again', lat: 10.001, lon: 77.001 }, { name: 'B', lat: 11, lon: 78 }]])
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

describe('landmark search sources', () => {
  it('parses Photon results: shops, malls, temples with kind and place', () => {
    const p = parsePhoton({ features: [{ geometry: { coordinates: [76.96, 11.01] }, properties: { name: 'Brookefields Mall', osm_value: 'mall', city: 'Coimbatore', state: 'Tamil Nadu', country: 'India' } }, { geometry: { coordinates: ['x', 'y'] }, properties: { name: 'bad' } }] })
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ name: 'Brookefields Mall, Coimbatore, Tamil Nadu, India', lat: 11.01, lon: 76.96, kind: 'mall' })
  })
  it('uses the street when a Photon result has no name', () => {
    const p = parsePhoton({ features: [{ geometry: { coordinates: [1, 2] }, properties: { street: 'Main Road', housenumber: '5', city: 'Town', osm_value: 'yes' } }] })
    expect(p[0].name).toBe('5 Main Road, Town')
  })
  it('keeps only Wikipedia articles that have coordinates, in search order', () => {
    const p = parseWikipediaPlaces({ query: { pages: { 1: { title: 'List of malls', index: 1 }, 2: { title: 'Brookefields Mall', index: 2, coordinates: [{ lat: 11.01, lon: 76.96 }], description: 'shopping mall' }, 3: { title: 'Other', index: 3, coordinates: [{ lat: 1, lon: 2 }] } } } })
    expect(p.map((x) => x.name)).toEqual(['Brookefields Mall', 'Other'])
    expect(p[0].kind).toBe('shopping mall')
  })
  it('merges sources, keeping the first of near-duplicates and the same name nearby', () => {
    const m = mergePlaces([
      [{ name: 'Brookefields Mall, Coimbatore', lat: 11.0100, lon: 76.9600 }],
      [{ name: 'Brookefields Mall', lat: 11.0102, lon: 76.9601 }, { name: 'Brookefields Mall, Other', lat: 11.03, lon: 76.99 }, { name: 'Brookefields Mall', lat: 12.9, lon: 77.7 }],
    ])
    expect(m.map((x) => x.name)).toEqual(['Brookefields Mall, Coimbatore', 'Brookefields Mall'])
    expect(m[1].lat).toBe(12.9) // a different place far away with the same name is kept
  })
  it('combines every source in one search', async () => {
    const fetchImpl = async (url) => {
      const u = String(url)
      if (u.includes('photon')) return { ok: true, json: async () => ({ features: [{ geometry: { coordinates: [76.96, 11.01] }, properties: { name: 'Brookefields Mall', osm_value: 'mall', city: 'Coimbatore' } }] }) }
      if (u.includes('wikipedia')) return { ok: true, json: async () => ({ query: { pages: { 1: { title: 'Coimbatore Junction railway station', index: 1, coordinates: [{ lat: 11.0, lon: 76.96 }] } } } }) }
      if (u.includes('nominatim')) return { ok: true, json: async () => [{ display_name: 'Sulur, Tamil Nadu', lat: '11.02', lon: '77.13', type: 'town' }] }
      return { ok: true, json: async () => ({ results: [{ name: 'Coimbatore', admin1: 'Tamil Nadu', country: 'India', latitude: 11.0, longitude: 76.97 }] }) }
    }
    const r = await searchPlaces('coimbatore', { fetchImpl })
    expect(r.map((x) => x.source)).toEqual(expect.arrayContaining(['OpenStreetMap', 'Wikipedia', 'Open-Meteo']))
    expect(r.length).toBeGreaterThanOrEqual(4)
  })
  it('drops Wikipedia hits that do not match the search words', () => {
    expect(relevantTo('Brookefields Mall', 'Brookefield')).toBe(false) // only one of two words
    expect(relevantTo('Brookefields Mall', 'Brookefields Mall')).toBe(true)
    expect(relevantTo('PSG College of Technology', 'Anna University')).toBe(false)
    expect(relevantTo('PSG College of Technology', 'PSG College of Technology')).toBe(true)
    expect(relevantTo('Golden Temple', 'Operation Blue Star')).toBe(false)
    expect(relevantTo('Eiffel', 'Eiffel Tower')).toBe(true)
  })
  it('gives quick suggestions only after 3 letters', async () => {
    expect(await suggestPlaces('br')).toEqual([])
    const fetchImpl = async () => ({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [1, 2] }, properties: { name: 'Bro Cafe', city: 'X' } }] }) })
    expect((await suggestPlaces('bro', { fetchImpl }))[0].name).toBe('Bro Cafe, X')
  })
  it('reports Google problems without failing the search', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ features: [], results: [], query: { pages: {} } }) })
    const reports = []
    const g = { maps: { importLibrary: async () => { throw new Error('PERMISSION_DENIED') }, Geocoder: function () { this.geocode = (q, cb) => cb(null, 'REQUEST_DENIED') } } }
    const { searchGoogle } = await import('./geocode.js')
    expect(await searchGoogle('x', g, (s, why) => reports.push(s + ':' + why))).toEqual([])
    expect(reports).toEqual(['places:PERMISSION_DENIED', 'geocoder:REQUEST_DENIED'])
    expect(await searchPlaces('Ames', { fetchImpl })).toEqual([])
  })
})

