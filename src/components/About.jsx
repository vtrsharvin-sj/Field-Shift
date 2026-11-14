import { GLOSSARY, DISCLAIMER } from '../data/glossary.js'

export default function About() {
  return (
    <section aria-labelledby="about-h">
      <h2 id="about-h">Glossary and about this tool</h2>
      <h3>Words used in this tool</h3>
      <dl>
        {Object.values(GLOSSARY).map((g) => (
          <div key={g.term}>
            <dt>{g.term}</dt>
            <dd>{g.text}</dd>
          </div>
        ))}
      </dl>
      <h3>Where the data comes from</h3>
      <ul>
        <li><strong>NASA POWER</strong> (live): daily temperature, rain, humidity, sunshine and modelled soil wetness, about 50 km grid, 2005 to the current year. The latest days and current year may be incomplete; missing values are excluded where possible. It is a model and satellite blend, so local rain can differ, especially near hills.</li>
        <li><strong>MODIS</strong> (NASA, optional, live via ORNL DAAC): recent greenness, evapotranspiration, land-surface temperature and land cover. These are mixed-pixel snapshots/context, not field measurements or a 20-year crop record.</li>
        <li><strong>SoilGrids</strong> (ISRIC, not NASA, live): modeled soil texture and organic-carbon context. Used to suggest a broad soil type; confirm with a field soil test.</li>
        <li><strong>Local crops</strong> (Wikipedia text, CC BY-SA): articles about your village, district, state and country are read for the crops in our table. It shows what is described as grown near you. It is not production data and can be old or thin for small places.</li>
        <li><strong>Global crop calendar</strong> (AgMIP-GGCMI Phase 3, CC BY 4.0): static multi-year average planting dates and season lengths for major crops on a global 0.5° grid, separated into rainfed and irrigated systems. It merges observations and includes gap-filling and spatial extrapolation. It is optional context, not a field recommendation or crop-rotation model. <a href="https://doi.org/10.5281/zenodo.5062513" target="_blank" rel="noreferrer">Dataset and citation</a>.</li>
        <li><strong>GPM IMERG, SMAP and GRACE/GRACE-FO</strong> (NASA): public GIBS map images centered on the selected location are available under Data used. GPM displays precipitation rate; SMAP displays analyzed surface soil moisture; GRACE displays monthly total-water-storage anomaly. These maps are regional visual context, are not read as field point measurements, and do not change the scores. GRACE includes groundwater but also soil moisture, surface water and other stores, so it cannot tell a farmer how much water a well can supply. <a href="https://gibs.earthdata.nasa.gov/" target="_blank" rel="noreferrer">NASA GIBS</a> · <a href="https://gpm.nasa.gov/data/imerg" target="_blank" rel="noreferrer">GPM IMERG</a> · <a href="https://nsidc.org/data/smap" target="_blank" rel="noreferrer">SMAP</a> · <a href="https://grace.jpl.nasa.gov/data/get-data/" target="_blank" rel="noreferrer">GRACE Tellus</a>.</li>
        <li><strong>Field evidence you enter</strong>: lab soil-test readings and a local crop price quote can be saved in this browser for this farm location. They are not remotely measured and do not change recommendation scores. The FAO GIEWS FPMA tool offers public market-price context where it has coverage; its series may be retail or wholesale, not a local farm-gate offer. <a href="https://fpma.apps.fao.org/giews/food-prices/tool/public/" target="_blank" rel="noreferrer">FAO GIEWS FPMA</a>.</li>
        <li><strong>Crop table</strong>: 37 crops with crop coefficients from FAO-56 and temperature ranges in the style of FAO EcoCrop. These traits and generic benefit ratings are developer-entered estimates and are not validated crop by crop. Local varieties differ.</li>
        <li><strong>Where it works</strong>: climate screening works at any land location. The global crop calendar covers a subset of major crops; unsupported crops and cells continue to use the climate-based month estimate.</li>
        <li><strong>Not included</strong>: numeric GPM/SMAP/GRACE point extraction, automatic local market-price retrieval, or automatic lab soil-test feeds. NASA SRTM is also not included; slope context uses Copernicus DEM (ESA).</li>
      </ul>
      <h3>Limits of the tool</h3>
      <ul>
        <li>It works at point and regional scale, not at field level.</li>
        <li>It does not predict yield or profit.</li>
        <li>Scores are rule-based. The rules and weights are listed in each card and in weights.json.</li>
        <li>{DISCLAIMER}</li>
      </ul>
    </section>
  )
}
