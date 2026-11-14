# Crop Rotation Helper

Client-side tool that compares crop rotations for a farm using real NASA POWER climate data. No backend, no login.

## Run

```
npm install
npm run dev      # development
npm test         # unit tests (indicators, scoring, data files)
npm run build    # static site in dist/, deploy to GitHub Pages or Vercel
```

## Where things are

| Path | Purpose |
| --- | --- |
| `src/api/power.js` | NASA POWER client: retry, timeout, -999 filtering, cache |
| `src/api/soilgrids.js` | SoilGrids (ISRIC, not NASA), optional |
| `src/indicators/` | Pure climate indicator maths (rain, dry spells, heat, frost, ET0, water balance, trends) |
| `src/scoring/` | Component scores, weighting, explanations, confidence |
| `src/data/crops.json` | Crop table. Estimates, `verified: false` until you check each value |
| `src/data/rotations.json` | Baseline presets and strategy candidates |
| `src/data/weights.json` | Every scoring weight and threshold |
| `public/data/power_coimbatore_2005_2024.json` | Real POWER download for the demo farm, used only as a labelled fallback |

## To do before the demo (yours)

1. Verify every value in `crops.json` against TNAU / ICAR / FAO, fill `source`, set `verified: true`.
2. Review the weights in `weights.json`.
3. Compare POWER rainfall with a local rain record. At Coimbatore POWER gives about 1,200 mm a year, which looks high for the area.
4. Check the SoilGrids endpoint (it did not answer during development, so the fallback path is what was tested).

## NASA satellite layers (optional button in the app)

Loaded on demand through the ORNL DAAC MODIS web service (free, no login, 1 to 3 minutes): MODIS NDVI (MOD13Q1, 2023-24), evapotranspiration (MOD16A2GF, 2024), land surface temperature (MOD11A2, 2024) and land cover (MCD12Q1). Each layer fails independently and is then listed under information gaps. MODIS potential ET is cross-checked against the POWER-based ET0 and the result feeds confidence.

Slope comes from the Open-Meteo elevation service (Copernicus DEM, ESA, not NASA) because free SRTM services block browser requests.

## Not integrated

GPM IMERG, SMAP and GRACE need an Earthdata login (SMAP also returned no data from the keyless service). The app lists each one under information gaps. NASA SRTM itself is not used.
