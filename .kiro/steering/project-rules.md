# Project rules: Crop Rotation Decision-Support Tool

- Scoring must be **rule-based and explainable**. No black-box ML.
- **Real NASA POWER data must drive the output.** Never hardcode sample climate numbers in production paths. If the API fails, show an error or a clearly labelled cached example, never silent fake data.
- Every rotation result must show: score, why suggested, evidence, benefits, data gaps, risks needing local review, confidence.
- Every number shown to the farmer must be traceable to a data source or a documented rule.
- Plain language first. Explain terms like evapotranspiration, NDVI, soil wetness, frost risk in tooltips or a glossary.
- Always show the disclaimer: *This tool supports, and does not replace, local agricultural expertise.*
- Keep functions small and pure. Put all crop data and scoring weights in separate, editable data files.
- Stack: Vite + React, Leaflet for the map, Recharts for charts. No server code.
- Write unit tests for indicator calculations and scoring.
