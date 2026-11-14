import { describe, it, expect } from 'vitest'
import { googleMapsLink, parseCoordinates, parsePlaces } from './geocode.js'

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
