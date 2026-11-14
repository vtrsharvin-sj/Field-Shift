// Plain-language explanations used by tooltips and the glossary page.

export const GLOSSARY = {
  evapotranspiration: {
    term: 'Evapotranspiration (ET0)',
    text: 'Water lost from soil and plants into the air. It sets how much water a crop needs. This tool estimates it from temperature and latitude (Hargreaves-Samani method).',
  },
  waterBalance: {
    term: 'Water balance',
    text: 'Rain minus the water the crop needs. A minus number means a shortfall that irrigation must cover.',
  },
  soilWetness: {
    term: 'Soil wetness',
    text: 'How wet the root zone usually is, from 0 (dry) to 1 (wet). Where available, this uses high-resolution NASA POWER SMAP L4 data from 2015 onward. It is model-assisted satellite data, not a measurement from your field.',
  },
  soilMoistureAnomaly: {
    term: 'Soil moisture anomaly',
    text: 'How much wetter or drier the soil is than usual for that time of year. SMAP root-zone wetness can add a small drought-risk adjustment; the separate map imagery is regional context and its colors are never used as field-level values.',
  },
  ndvi: {
    term: 'NDVI',
    text: 'A satellite greenness index. Low values can mean sparse vegetation or bare soil, but can also reflect mixed land cover or seasonality. Optional recent MODIS NDVI is shown as context, not a crop-specific stress measurement.',
  },
  frostRisk: {
    term: 'Frost risk',
    text: 'Nights cold enough (below 2 C here) to damage sensitive crops.',
  },
  heatStress: {
    term: 'Very hot days',
    text: 'Days when the highest temperature goes above the limit for the crop (35 C by default). Heat at flowering can cut yield.',
  },
  dryStretch: {
    term: 'Longest dry stretch',
    text: 'The longest run of days in a row with less than 1 mm of rain.',
  },
  rainVariability: {
    term: 'Rain variability',
    text: 'How much a season\'s rainfall changes from year to year. A high percentage means the rain is hard to count on.',
  },
  heavyRain: {
    term: 'Heavy-rain days',
    text: 'Days with rain above the 95th percentile of rainy days. Heavy rain on bare soil washes soil away.',
  },
  bareField: {
    term: 'Bare-field months',
    text: 'Months when no crop is growing. Here they come from your sowing calendar, not from satellite images.',
  },
  satelliteVsGround: {
    term: 'Satellite vs ground data',
    text: 'Satellites and models cover large areas for many years but are coarse (about 50 km here). Ground stations and soil tests are local but sparse. Combining them is more accurate, so local expert checks matter.',
  },
  confidence: {
    term: 'Confidence',
    text: 'How much to trust a result. It drops when data is missing, the record is short, scores are close, or local facts (soil test, prices) are unknown.',
  },
  nitrogenFixing: {
    term: 'Nitrogen-fixing crop',
    text: 'Legumes such as black gram and cowpea take nitrogen from the air and leave some in the soil, which can lower fertilizer need.',
  },
  kc: {
    term: 'Crop coefficient (Kc)',
    text: 'A number that converts ET0 into the water one crop uses. Crop water need = Kc x ET0.',
  },
}

export const DISCLAIMER = 'This tool supports, and does not replace, local agricultural expertise.'
