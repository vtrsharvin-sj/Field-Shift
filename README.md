# Crop Rotation Helper

A free, client-side decision-support tool that compares crop rotations for **any land location** using NASA climate and satellite data. No backend, no login, no machine learning: every score comes from written rules you can read and edit.

> This tool supports, and does not replace, local agricultural expertise.

## How it works

1. You pick a location (search by place name, tap the map, GPS, paste coordinates or a Google Maps link), soil type, water source, your current rotation and your priorities.
2. The app downloads 20 years of daily NASA POWER data for that point (temperature, rain, humidity, sunlight, soil wetness).
3. It screens all 37 crops in `src/data/crops.json` against that climate (temperature range, sowing temperature, frost kill, water balance, heat days) and works out the best sowing months. Cold-winter crops are handled with growing days, so a winter wheat season runs through the dormant period.
4. It builds candidate rotations (within one year, or alternating over two years), picks the best one for each strategy (legume, water-saving, soil-cover), and compares them with your own rotation.
5. Each card shows the score, why it was suggested, NASA evidence, benefits, information gaps, risks for local review, and a confidence level with reasons.
6. Soil comes from SoilGrids (ISRIC, not NASA): texture sets how much rain crops can use, low organic carbon raises the value of legumes, and pH shows up as a risk note. If the exact point has no data (built-up land, water), a point about 1 km away is used and the app says so.
7. Crop options are location-aware. The app reads Wikipedia articles about your village, district, state and country (BigDataCloud finds the place names), looks for the crops in the crop table in sentences about growing or farming, and uses that to sort the crop lists, add a "Grown locally" factor (8% of the score) and prefer suggestions that are known in your area. This is text evidence, not production statistics.
8. NASA satellite layers (MODIS NDVI, evapotranspiration, ground temperature, land cover) and slope load in the background right after the climate data, and are saved in the browser for 30 days, so a second visit is instant. MODIS potential evapotranspiration is cross-checked against the POWER-based estimate, and the result feeds the confidence level.
9. The results page shows a "Data used" checklist, the weight each factor has in the overall score (the four priority weights follow your sliders), and the reasons behind every confidence level.

## Run

```
npm install
npm run dev      # development
npm test         # unit tests
npm run build    # static site in dist/
```

## Google Maps key

The key needs **Maps JavaScript API**. For Google to also find shops, businesses and every landmark by name, enable **Places API (New)** and **Geocoding API** on the same key. Without them the search still finds landmarks through OpenStreetMap (Photon, Nominatim), Wikipedia and Open-Meteo, and the map still labels landmarks.

The location step uses Google Maps when `VITE_GOOGLE_MAPS_API_KEY` is set, and falls back to OpenStreetMap when it is missing or rejected.

- **Local:** the key is in `.env` (ignored by git). `.env.example` shows the format.
- **GitHub Pages:** add a repository secret named `GOOGLE_MAPS_API_KEY` (Settings, Secrets and variables, Actions). The workflow passes it to the build.
- **Important:** a browser key is visible to anyone who opens the site. In Google Cloud Console, enable only **Maps JavaScript API** for this key, and under Application restrictions choose **Websites (HTTP referrers)** and add `https://<user>.github.io/*` and `http://localhost:5173/*`. Set a daily quota cap too.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this project (`git remote add origin <url>`, `git push -u origin master`).
2. In the repository: Settings, Pages, Source: **GitHub Actions**.
3. Push to `main` or `master`. `.github/workflows/deploy.yml` runs the tests, builds, and publishes. The site URL appears in the workflow run.

All asset paths are relative, so it works under `https://<user>.github.io/<repo>/`.

## Where things are

| Path | Purpose |
| --- | --- |
| `src/api/power.js` | NASA POWER client: retry, timeout, -999 filtering, cache |
| `src/api/satellite.js` | MODIS layers through the ORNL DAAC service (no login) |
| `src/api/soilgrids.js`, `elevation.js`, `geocode.js` | SoilGrids (ISRIC), slope (Copernicus DEM, ESA), place search (non-NASA, labelled) |
| `src/indicators/` | Pure climate maths: rain, dry spells, heat, frost, ET0, water balance, trends, climate type |
| `src/scoring/` | Component scores, planner, explanations, confidence |
| `src/data/crops.json` | Crop table (FAO-56 Kc, EcoCrop-style temperature ranges, `grownIn` climate types) |
| `src/data/rotations.json` | Example rotations and the three strategies |
| `src/data/weights.json` | Every scoring weight and threshold |
| `test-data/` | A real POWER download used only by the unit tests (never shown in the app) |

## Limits you should know

- **Crop table is not verified crop by crop.** Values are from FAO-56 and EcoCrop-style ranges entered by the developer. Set `verified: true` per crop only after checking. Income, drought tolerance and cover ratings are generic estimates.
- **`grownIn`** (which climate types a crop is commonly grown in) is a coarse filter written from general knowledge. FAOSTAT country data would be better.
- **NASA POWER is about 50 km resolution.** Rainfall can differ a lot from local records, especially near hills and coasts.
- **No market prices, soil tests or field-level data.** Income is a generic rating. Confidence therefore stays Medium or Low.
- **Not integrated:** GPM IMERG, SMAP and GRACE (need an Earthdata login), NASA SRTM (no free browser access; slope uses Copernicus DEM instead). Each is listed under information gaps.
- Rotation cycles of 1 to 3 years with up to 3 crops are supported. Perennials, intercropping, livestock and varieties are not.
