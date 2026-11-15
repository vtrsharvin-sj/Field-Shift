# FieldShift

**A farmer-first crop rotation explorer informed by NASA Earth observations.** FieldShift helps farmers compare their current rotation with up to three explainable strategies and see how each fits local climate history, soil context, water constraints and their own priorities.

> FieldShift is a decision-support prototype. It helps people explore possibilities; it does not prescribe a planting plan or replace local agricultural expertise.

## Why FieldShift

Rotation decisions are made under pressure from variable rainfall, heat, water availability and soil degradation. Satellite and climate datasets can reveal patterns, but raw data rarely tells a farmer what to do next. FieldShift translates a location's environmental history into an understandable side-by-side comparison, with a clear chain from observations to crop-fit rules to trade-offs. It also shows missing evidence and local questions that need human review.

## Try the experience

1. Pick a farm location by place search, map, coordinates or device location.
2. Enter soil and water context and select the farm's current crop rotation.
3. Set what matters most: water, income, soil health and erosion protection.
4. Compare the current rotation with legume-integrated, water-saving and soil-cover strategies.
5. Open a strategy to review its seasonal fit, score components, NASA evidence, uncertainty, benefits, risks and information gaps.
6. Explore local crop references, climate summaries, optional satellite layers and a clearly labeled what-if scenario. Print the comparison to PDF for a field conversation.

For a fast live demo, choose a rural agricultural point in any region you know, then enter a locally familiar current rotation. Check the MODIS land-cover result before interpreting scores; if the selected pixel is urban or mixed, explain that the result is regional screening. Results depend on the live data services and the exact input choices.

## NASA Space Apps submission links

- Project demonstration: [Download the seven-slide deck](https://vtrsharvin-sj.github.io/Field-Shift/demo/FieldShift-Hackathon-Demo.pptx)
- Project: [Open the live FieldShift app](https://vtrsharvin-sj.github.io/Field-Shift/)

## What the prototype does

- Downloads daily NASA POWER climate data for a selected point and derives seasonal rainfall, dry spells, heat/frost exposure, estimated reference evapotranspiration and crop water balance.
- Uses SoilGrids (ISRIC) to suggest a broad soil texture class when data is available.
- Looks up a public, global crop-calendar reference for 18 major crops at the selected point. It separates rainfed and irrigated dates and lets farmers apply a reference sowing month to their own crop entry; it does not decide the crop or model crop rotations.
- Screens a documented crop table for climate and growing-season fit, then builds candidate one- to three-year rotations.
- Compares a farmer's baseline with three strategies using explicit, editable rules and farmer-selected priority weights.
- Adds an evidence-first statistical climate summary: annual mean, median, middle-80% range, rainfall coefficient of variation and trend estimates with deterministic 95% moving-block-bootstrap intervals. Incomplete annual records are excluded; uncertainty describes this historical sample and is not a forecast.
- Compares every strategy side by side, including the point change from the current rotation, then exposes the component scores, assumptions, benefits, risks and evidence.
- Optionally adds recent MODIS greenness, evapotranspiration, land-surface temperature and land-cover context, plus an elevation-derived slope class. Optional layers describe the satellite pixel/current land cover; they are not field measurements or future crop observations.
- Displays public NASA GIBS maps in the main results area. Map colors are context only. Separately, NASA POWER's point API supplies GPM IMERG daily rainfall and high-resolution SMAP root-zone wetness: GPM drives rainfall and water-balance calculations where it has data, and SMAP can add a small drought-risk adjustment for drought-sensitive crops. NASA POWER precipitation fills GPM gaps. GRACE/GRACE-FO remains broad regional context and never stands in for a field or well measurement.
- Lets farmers save lab soil-test readings and a local price quote in browser storage for the selected location. They are not automatic observations or score inputs; the FAO GIEWS FPMA tool is linked for public price context where available.
- Uses nearby Wikipedia article text as a weak local-crop clue. It is shown as text evidence, not as a crop census, production statistic or market signal.
- Explains confidence, risks and gaps instead of presenting a recommendation as certain.

## Data and interpretation

| Input | Use | Important limit |
| --- | --- | --- |
| NASA POWER daily point series | Historical temperature, humidity, solar radiation and precipitation; GPM IMERG (~10 km) and SMAP L4 moisture (~9 km) are used when available | Source-specific resolution; model-assisted satellite products, not field instruments; SMAP begins in 2015 |
| NASA GIBS | Public location-centered GPM, SMAP and GRACE/GRACE-FO imagery | Visual raster only; colors are not sampled into point values. GRACE is broad total-water-storage change, not well-level groundwater |
| MODIS via ORNL DAAC (optional) | Recent NDVI, ET/PET, land-surface temperature and land cover | Different pixel sizes and short/recent periods; represents mixed land cover at the selected point |
| SoilGrids / ISRIC | Soil texture and organic-carbon context | Global modeled estimates; confirm with a field soil test |
| AgMIP-GGCMI Phase 3 crop calendar | Static multi-year average planting day and season length for major crops, rainfed and irrigated, global 0.5° grid | Composite of observations with gap-filling and spatial extrapolation; coverage varies; not field advice or a rotation model; [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Copernicus DEM | Approximate terrain/slope context | Not NASA SRTM; coarse terrain context is not a field erosion assessment |
| Crop table and scoring rules | Candidate screening and explainable comparison | Indicative values; not locally calibrated yield, profitability, disease or variety models |
| Wikipedia and geocoding sources | Place names and textual crop references | Coverage varies; mentions do not establish that a crop is currently grown nearby |

The app distinguishes numeric point-series inputs from map imagery and modeled products. The what-if control shifts historical weather values uniformly; it is a sensitivity exercise, not a climate projection. The crop-calendar reference is a static historical composite and does not represent current annual planting conditions. NASA GIBS displays the latest GPM IMERG, SMAP and GRACE/GRACE-FO map context around the selected location; imagery colors are never sampled into scores. Farmers can enter actual lab soil-test results and local buyer/market quotes; these remain local context and do not change rankings. No yield, profit, irrigation prescription, pest diagnosis or field-level soil-health measurement is produced.

### Browser data cache

NASA POWER climate responses are cached automatically by the browser for repeat requests at the same coordinates and period. This cache is device-specific. The app shell, crop calendar and static assets are cached on the first online visit. Place search, soil and optional satellite services may still need internet access. [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)

### Statistical method

Annual rainfall and mean-temperature summaries use complete years from NASA POWER. The display reports mean, median, standard deviation, rainfall coefficient of variation, interquartile range, and the 10th–90th percentile range. With at least eight complete growing seasons, the water-risk score also uses observed 20th-percentile seasonal rainfall; shorter records fall back to a CV-based estimate. Mean and linear-trend intervals use 1,000 deterministic circular moving-block bootstrap resamples (blocks up to three years) to preserve short adjacent-year runs. The intervals describe uncertainty from the finite observed record; longer climate persistence, data-product error, and local field conditions are not captured. Rotation scores remain a transparent rule-based screening index, not statistically validated yield or profit predictions.

## Run locally

Requirements: Node.js 22 or newer and npm.

```sh
npm install
npm run dev
```

To build the static site:

```sh
npm run build
npm run preview
```

### Google Maps and landmark search

Google Maps is optional. For the Google map and Google landmark suggestions, enable **Maps JavaScript API** and **Places API (New)** in the same Google Cloud project. Google Maps Platform requires billing on the project; set a budget and API quotas. Add `VITE_GOOGLE_MAPS_API_KEY` to `.env` for local use. If Google suggestions are unavailable, FieldShift labels the fallback results as OSM and shows a setup hint. “Search all sources” also uses Geocoding API when enabled; place autocomplete itself needs Places API (New).

For a browser key, choose website (HTTP referrer) restrictions and allow the exact app origins, for example `http://localhost:5173/*` and `https://<user>.github.io/*` (plus any custom domain). Under API restrictions, allow only Maps JavaScript API, Places API (New), and Geocoding API if you use full search. Add `VITE_GOOGLE_MAPS_API_KEY` to your deployment environment or configure the existing GitHub Pages secret `GOOGLE_MAPS_API_KEY`. Browser keys are visible to site visitors, so keep the referrer/API restrictions and quotas in place. Never commit `.env`.

## Project map

| Path | Purpose |
| --- | --- |
| `src/api/` | NASA POWER, MODIS/ORNL DAAC, SoilGrids, elevation and place/local-crop lookups |
| `public/data/global-crop-calendar-v1.*` | Compact global AgMIP-GGCMI crop calendar and its metadata |
| `scripts/build_global_crop_calendar.py` | Rebuilds the compact calendar from the public Zenodo source (Python 3, NumPy and h5py required) |
| `src/indicators/` | Climate and satellite indicator calculations |
| `src/scoring/` | Rotation planning, scoring, explanations and confidence |
| `src/data/crops.json` | Crop characteristics used by the screening rules |
| `src/data/weights.json` | Editable scoring weights and thresholds |
| `src/components/` | Location wizard, results, evidence, learning and map UI |
| `docs/FINAL_SUBMISSION.md` | Submission narrative, innovation, impact and limitations |
| `docs/DEMO_SCRIPT.md` | Timed live-demo and pitch guide |

## Known limitations and next steps

This is a deployable public prototype, not yet a field-validated commercial agronomy product. Crop parameters, generic benefit ratings and the SMAP drought trigger need agronomist review and regional calibration. Soil-test and local-price entries are saved only in the current browser and do not change rankings. FAO FPMA prices are linked as public context but are not automatically queried because the app is static and the API does not provide browser CORS access. GRACE remains map-only context because its total-water-storage signal is too broad to resolve an individual field or well. Next steps for operational use are farmer pilots, validation against soil tests and station data, monitoring upstream API changes, and a reviewed plan for local prices and support. The global calendar adds planting-date context for a subset of crops, but its coarse static grid cannot imply equal data quality or agronomic suitability everywhere.

The attached challenge brief and FieldShift's implementation status are mapped in [`docs/HACKATHON_REQUIREMENTS.md`](docs/HACKATHON_REQUIREMENTS.md). The final submission and updated demo narration are in [`docs/FINAL_SUBMISSION.md`](docs/FINAL_SUBMISSION.md) and [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

## License and attribution

FieldShift software is licensed under the **GNU General Public License v3.0 only (GPL-3.0-only)**; see [`LICENSE`](LICENSE). This does not relicense NASA, AgMIP-GGCMI, map, or other third-party data and services, which retain their own terms. Crop-calendar attribution: Jägermeyr et al. (2021), *Climate impacts on global agriculture emerge earlier in new generation of climate and crop models*, Nature Food 2, 873–885, [doi:10.1038/s43016-021-00400-y](https://doi.org/10.1038/s43016-021-00400-y), [AgMIP-GGCMI Phase 3 dataset](https://doi.org/10.5281/zenodo.5062513), CC BY 4.0. NASA, ISRIC, ORNL DAAC, Copernicus, Wikipedia, OpenStreetMap and any map providers retain their own terms and attribution requirements. FieldShift is an independent prototype and is not an official NASA product or endorsed by NASA.
