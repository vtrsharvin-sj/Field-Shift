# FieldShift against the challenge brief

The attached challenge asks for a farmer-centered decision-support tool that combines NASA Earth observations with local soil context, crop characteristics and farmer priorities to explore rotation strategies. This matrix describes what the current prototype actually does, including the limits that should be stated during judging.

## Core challenge objectives

| Challenge objective | FieldShift implementation | Coverage |
| --- | --- | --- |
| Use NASA Earth observations to understand local growing conditions | NASA POWER daily point history (2005 through the current year) feeds temperature, heat/frost, rainfall variability, dry-spell, heavy-rain, ET0 and seasonal water-balance features. Optional MODIS NDVI, ET, land-surface temperature and land cover add separate satellite evidence. | Meets, with source-specific resolution and date ranges shown. |
| Include soil and crop context | SoilGrids provides modeled soil texture and carbon context; the farmer chooses a soil type and can enter real lab values. Crop durations, water needs, temperature ranges, rooting, nitrogen fixing and cover traits drive the transparent screening rules. | Partially meets: crop parameters need local agronomy review; entered lab results are recorded but are not scoring inputs. |
| Include farmer priorities | Farmers provide the current crops, soil, water source/availability and weights for water, income, soil health and erosion protection. | Meets the main inputs; equipment, labor and water-right constraints are not yet modeled. |
| Compare rotation strategies, including the current rotation | Results place the farmer's existing rotation beside legume-integrated, water-saving and soil-cover candidate strategies. A strategy can be omitted when the crop screen finds no suitable candidate, and the UI says why. | Meets by design; the number of available alternatives can vary by location and crop constraints. |
| Explain recommendations, benefits, risks, evidence and unknowns | Each card presents factor scores, priority weights, benefits, local-review risks, source-linked seasonal evidence, information gaps and confidence reasons. | Meets. |
| Support—not replace—farmer judgment | Results label the score as screening, disclose modeled/coarse sources and direct users to local agronomists or extension partners. | Meets. |

## Optional considerations from the brief

| Consideration | Current behavior | Coverage |
| --- | --- | --- |
| Trends in heat, rainfall, moisture, evaporation and vegetation stress | Annual rainfall/temperature trends and monthly climate summaries; optional MODIS seasonal context; NASA GIBS GPM, SMAP and GRACE/GRACE-FO map images. | Partial: GIBS images are visual context only, not sampled into numerical point series or scores. |
| Bare-field periods and crop stress | Rotation calendar shows months with crops/bare soil; erosion score relates bare periods to heavy-rain timing; seasonal heat/frost and water indicators screen candidates. | Meets the main exploration. |
| Statistical or SI techniques and uncertainty | A documented point-based spatial-informatics pipeline aggregates daily records into seasonal/monthly features and evaluates candidates with interpretable deterministic rules; confidence reflects completeness, record length, score separation and missing context. | Partial: no learned model or uncertainty distribution; crop rules are not calibrated in every region. |
| Harmonize products to a shared grid | Sources are sampled around the selected point while retaining each native resolution and temporal window. | Partial: no common-grid resampling or pixel-level fusion; the prototype explicitly avoids implying field-scale precision. |
| Interactive geospatial/time visualization | Users search a global map and inspect climate trends, monthly indicators, crop calendars and optional NASA GIBS map context at their selected location. | Partial: no field-boundary vulnerability map or pixel-level multi-year SMAP/GRACE timeline. |
| Market suitability and local soil tests | The results panel stores farmer-entered lab measurements and local price quotes in the browser; the FAO GIEWS FPMA tool is linked for public price context. | Partial: manual context only, not automatic price ingestion or scoring. |

## Method and resolution

The app uses a point selected by the farmer. Each data source keeps its own spatial resolution and time coverage: NASA POWER is a coarse climate grid; MODIS products range from about 250 m to 1 km; SoilGrids is modeled at about 250 m; the AgMIP-GGCMI calendar is a static 0.5° reference; and GRACE is broad regional water-storage context. Daily POWER observations are aggregated to months, crop seasons and complete-year trends. Both annual trend summaries and the confidence record-length check use complete years only. The ranking combines derived indicators and crop rules; it does not imply all layers describe the same field pixel or day.

## Requirements evidence in the code

- The location-to-results flow and NASA requests are in [`src/App.jsx`](../src/App.jsx) and [`src/api/power.js`](../src/api/power.js).
- Indicator derivation is in [`src/indicators/climate.js`](../src/indicators/climate.js); transparent crop and rotation scoring is in [`src/scoring/components.js`](../src/scoring/components.js), [`src/scoring/engine.js`](../src/scoring/engine.js) and [`src/scoring/planner.js`](../src/scoring/planner.js).
- Strategy evidence, gaps, confidence and the farmer-facing explanation are in [`src/scoring/explain.js`](../src/scoring/explain.js) and [`src/components/RotationCards.jsx`](../src/components/RotationCards.jsx).
- Soil, map context, source provenance and manual field evidence are in [`src/components/DataStatus.jsx`](../src/components/DataStatus.jsx).

## What judges should see in a live demo

1. Search/select a farm location and show that the workflow accepts a global point.
2. Choose two current crops, soil, water and a common rotation; explain that the farmer can change either crop.
3. Set priorities and compare the current rotation with the available strategy alternatives.
4. Open one card's evidence, benefits, risks, gaps and scoring details; point out confidence and the bare/crop month timeline.
5. Show a climate trend and one NASA map layer, then explain its spatial/temporal limits.
6. Change a priority or use the sensitivity slider to demonstrate that choices affect the comparison; state clearly that the what-if slider is not a forecast.
7. Close by asking farmers and agronomists to validate the crop rules and data before changing a field plan.
