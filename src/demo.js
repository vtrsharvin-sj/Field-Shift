// The demo farm: farmland in Coimbatore district, Tamil Nadu (MODIS land cover class 12, cropland, checked). The city centre itself is classed urban. Only the location and farmer choices are fixed here.
// Climate numbers are NEVER stored in code: they always come from the NASA POWER response.

export const DEMO_FARM = {
  lat: 10.95,
  lon: 77.1,
  soilType: 'loam',
  waterSource: 'borewell',
  waterAvailability: 'medium',
  baselineId: 'rice-rice',
}

export const DEMO_PRIORITIES = { water: 8, income: 3, soil: 8, erosion: 5 }

// Pre-fetched real NASA POWER response for the demo farm (see public/data).
export const CACHED_EXAMPLE_URL = './data/power_coimbatore_2005_2024.json'
export const WINDOW = { startYear: 2005, endYear: 2024 }
