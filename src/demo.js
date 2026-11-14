// Demo farms around the world. Only the location and the farmer's choices are fixed here.
// Climate numbers are NEVER stored in code: they always come from the NASA POWER response.

export const DEMO_FARMS = [
  { id: 'india-tn', name: 'Coimbatore, India (tropical, monsoon)', lat: 10.95, lon: 77.1, soilType: 'red', waterSource: 'borewell', waterAvailability: 'medium', presetId: 'rice-rice', priorities: { water: 8, income: 3, soil: 8, erosion: 5 } },
  { id: 'india-pb', name: 'Punjab, India (irrigated plains)', lat: 30.85, lon: 75.6, soilType: 'loam', waterSource: 'borewell', waterAvailability: 'high', presetId: 'rice-wheat', priorities: { water: 9, income: 5, soil: 6, erosion: 3 } },
  { id: 'us-ia', name: 'Iowa, USA (temperate corn belt)', lat: 42.03, lon: -93.62, soilType: 'loam', waterSource: 'rainfed', waterAvailability: 'low', presetId: 'maize-soybean', priorities: { water: 4, income: 7, soil: 8, erosion: 7 } },
  { id: 'ke-uasin', name: 'Uasin Gishu, Kenya (highland, rainfed)', lat: 0.55, lon: 35.2, soilType: 'red', waterSource: 'rainfed', waterAvailability: 'low', presetId: 'maize-bean', priorities: { water: 6, income: 6, soil: 8, erosion: 7 } },
  { id: 'br-mt', name: 'Mato Grosso, Brazil (tropical savanna)', lat: -12.55, lon: -55.7, soilType: 'clay', waterSource: 'rainfed', waterAvailability: 'low', presetId: 'maize-soybean', priorities: { water: 5, income: 7, soil: 8, erosion: 8 } },
  { id: 'au-wa', name: 'Western Australia wheatbelt (dry, southern hemisphere)', lat: -31.6, lon: 117.2, soilType: 'sandy', waterSource: 'rainfed', waterAvailability: 'low', presetId: 'wheat-fallow', priorities: { water: 9, income: 6, soil: 7, erosion: 7 } },
  { id: 'ca-sk', name: 'Saskatchewan, Canada (cold continental)', lat: 52.1, lon: -106.6, soilType: 'clay', waterSource: 'rainfed', waterAvailability: 'low', presetId: 'wheat-canola', priorities: { water: 6, income: 7, soil: 7, erosion: 6 } },
]

export const DEFAULT_PRIORITIES = { water: 5, income: 5, soil: 5, erosion: 5 }

// Pre-fetched real NASA POWER response (see public/data): used only as a labelled fallback when the live call fails.
export const CACHED_EXAMPLE_URL = './data/power_coimbatore_2005_2024.json'
export const CACHED_EXAMPLE_NAME = 'Coimbatore, India'
export const WINDOW = { startYear: 2005, endYear: 2024 }
