// Point lookup into the public, global AgMIP-GGCMI Phase 3 crop-calendar grid.
// This is a historical reference calendar; it is not a field prescription.

const cropLayers = {
  wheat: ['swh', 'wwh'],
  barley: ['bar'],
  rye: ['rye'],
  maize: ['mai'],
  rice: ['ri1', 'ri2'],
  sorghum: ['sor'],
  'pearl-millet': ['mil'],
  soybean: ['soy'],
  groundnut: ['nut'],
  'dry-bean': ['bea'],
  'field-pea': ['pea'],
  sunflower: ['sun'],
  canola: ['rap'],
  cotton: ['cot'],
  potato: ['pot'],
  cassava: ['cas'],
  sugarcane: ['sgc'],
  'sugar-beet': ['sgb'],
}

let dataPromise = null

async function loadGrid() {
  if (dataPromise) return dataPromise
  dataPromise = (async () => {
    const base = import.meta.env.BASE_URL || '/'
    const [manifestResponse, gridResponse] = await Promise.all([
      fetch(`${base}data/global-crop-calendar-v1.json`),
      fetch(`${base}data/global-crop-calendar-v1.bin`),
    ])
    if (!manifestResponse.ok || !gridResponse.ok) throw new Error('Global crop-calendar files could not be loaded.')
    const manifest = await manifestResponse.json()
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open the compressed global crop calendar.')
    const stream = gridResponse.body.pipeThrough(new DecompressionStream('gzip'))
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
    const expected = manifest.layers.length * manifest.grid.cellCount * 4
    if (bytes.byteLength !== expected) throw new Error('The global crop-calendar file is incomplete.')
    return { manifest, bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) }
  })().catch((error) => {
    dataPromise = null
    throw error
  })
  return dataPromise
}

function gridCell(lat, lon, grid) {
  const normalizedLon = ((Number(lon) + 180) % 360 + 360) % 360 - 180
  const row = Math.max(0, Math.min(grid.rows - 1, Math.round((grid.firstLatitudeCenter - Number(lat)) / Math.abs(grid.latitudeStep))))
  const col = Math.max(0, Math.min(grid.columns - 1, Math.round((normalizedLon - grid.firstLongitudeCenter) / grid.longitudeStep)))
  return { row, col, index: row * grid.columns + col }
}

function monthForDay(day) {
  return new Date(Date.UTC(2021, 0, day)).getUTCMonth() + 1
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = (x) => x * Math.PI / 180
  const dLat = radians(lat2 - lat1)
  const dLon = radians(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Returns calendar evidence for supported crops at the nearest 0.5° grid cell. */
export async function fetchGlobalCropCalendar(lat, lon) {
  const { manifest, view } = await loadGrid()
  const cell = gridCell(lat, lon, manifest.grid)
  const cellLat = manifest.grid.firstLatitudeCenter + cell.row * manifest.grid.latitudeStep
  const cellLon = manifest.grid.firstLongitudeCenter + cell.col * manifest.grid.longitudeStep
  const cellDistanceKm = distanceKm(Number(lat), Number(lon), cellLat, cellLon)
  const layerIndex = new Map(manifest.layers.map((layer, index) => [`${layer.cropCode}_${layer.system}`, index]))
  const calendars = {}

  for (const [cropId, codes] of Object.entries(cropLayers)) {
    const windows = []
    for (const code of codes) {
      for (const system of ['rf', 'ir']) {
        const index = layerIndex.get(`${code}_${system}`)
        if (index == null) continue
        const offset = (index * manifest.grid.cellCount + cell.index) * 4
        const plantingDay = view.getUint16(offset, true)
        const seasonDays = view.getUint16(offset + 2, true)
        if (!plantingDay || !seasonDays) continue
        windows.push({
          cropCode: code,
          season: code === 'ri2' ? 'second rice season' : code === 'swh' ? 'spring wheat' : code === 'wwh' ? 'winter wheat' : 'main season',
          system,
          plantingDay,
          plantingMonth: monthForDay(plantingDay),
          seasonDays,
        })
      }
    }
    if (windows.length) calendars[cropId] = windows
  }

  return {
    calendars,
    cell: { lat: cellLat, lon: cellLon, distanceKm: Math.round(cellDistanceKm * 10) / 10, resolutionDegrees: manifest.grid.resolutionDegrees },
    source: { dataset: manifest.dataset, citation: manifest.citation, recordUrl: manifest.recordUrl, license: manifest.license, licenseUrl: manifest.licenseUrl },
  }
}
