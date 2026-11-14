import { describe, it, expect } from 'vitest'
import { highlightParts, kindLabel, moveIndex, rankSuggestions, splitName } from './placeSearchUtils.js'

describe('place search dropdown helpers', () => {
  it('splits the place name from its address', () => {
    expect(splitName('Brookefields Mall, Coimbatore, Tamil Nadu, India')).toEqual({ main: 'Brookefields Mall', rest: 'Coimbatore, Tamil Nadu, India' })
    expect(splitName('Amritsar')).toEqual({ main: 'Amritsar', rest: '' })
  })
  it('bolds the part the user typed, ignoring case', () => {
    expect(highlightParts('Brookefields Mall', 'brooke')).toEqual([{ text: 'Brooke', match: true }, { text: 'fields Mall', match: false }])
    expect(highlightParts('Brookefields Mall', 'mall')).toEqual([{ text: 'Brookefields ', match: false }, { text: 'Mall', match: true }])
    expect(highlightParts('Anything', '')).toEqual([{ text: 'Anything', match: false }])
  })
  it('bolds each typed word when the whole text is not a substring', () => {
    const parts = highlightParts('Shri Harmandir Sahib', 'sahib harmandir')
    expect(parts.filter((p) => p.match).map((p) => p.text.toLowerCase()).sort()).toEqual(['harmandir', 'sahib'])
  })
  it('does not break on special characters', () => {
    expect(() => highlightParts('Cafe (Main)', '(ma')).not.toThrow()
    expect(() => highlightParts('A.B', 'a. b*')).not.toThrow()
  })
  it('moves the highlight with the arrow keys and wraps around', () => {
    expect(moveIndex(-1, 1, 5)).toBe(0)
    expect(moveIndex(-1, -1, 5)).toBe(4)
    expect(moveIndex(4, 1, 5)).toBe(0)
    expect(moveIndex(0, -1, 5)).toBe(4)
    expect(moveIndex(2, 1, 5)).toBe(3)
    expect(moveIndex(0, 1, 0)).toBe(-1)
  })
  it('labels kinds of place in plain words', () => {
    expect(kindLabel('mall')).toBe('Shop')
    expect(kindLabel('place of worship')).toBe('Temple or worship')
    expect(kindLabel('college')).toBe('School or college')
    expect(kindLabel('bus stop')).toBe('Transport')
    expect(kindLabel('')).toBe('')
  })
  it('ranks clear text matches first and keeps the rest in the service order', () => {
    const items = [
      { name: 'Tem Tour, Almaty' },
      { name: 'Shri Harmandir Sahib, Amritsar' }, // found through its other name "Golden Temple"
      { name: 'Sri Lakshmi Narayani Golden Temple, Vellore' },
      { name: 'Golden Temple Road, Amritsar' },
    ]
    const r = rankSuggestions(items, 'Golden Tem').map((x) => x.name.split(',')[0])
    expect(r[0]).toBe('Golden Temple Road') // name starts with what was typed
    expect(r[1]).toBe('Sri Lakshmi Narayani Golden Temple') // every typed word starts a word
    expect(r.slice(2)).toEqual(['Tem Tour', 'Shri Harmandir Sahib']) // unchanged order, nothing dropped
  })
  it('leaves the list alone when nothing was typed', () => {
    const items = [{ name: 'A' }, { name: 'B' }]
    expect(rankSuggestions(items, '')).toBe(items)
  })
})
