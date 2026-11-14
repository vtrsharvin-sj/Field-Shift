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
        <li><strong>NASA POWER</strong> (live): daily temperature, rain, humidity, sunshine and modelled soil wetness, about 50 km grid, 2005 to 2024. It is a model and satellite blend, so local rain can differ, especially near hills.</li>
        <li><strong>SoilGrids</strong> (ISRIC, not NASA, live): soil sand, clay and carbon. Used only to suggest a soil type.</li>
        <li><strong>Local crops</strong> (Wikipedia text, CC BY-SA): articles about your village, district, state and country are read for the crops in our table. It shows what is described as grown near you. It is not production data and can be old or thin for small places.</li>
        <li><strong>Crop table</strong>: 37 crops with crop coefficients from FAO-56 and temperature ranges in the style of FAO EcoCrop. Entered by the developer and not yet checked crop by crop. Local varieties differ.</li>
        <li><strong>Where it works</strong>: any land location. Sowing months and candidate rotations are worked out from the climate at your point, so results for a region you know well are the best test.</li>
        <li><strong>Not included</strong>: MODIS NDVI, SMAP soil moisture, GPM rainfall, SRTM slope, GRACE groundwater, soil tests, market prices.</li>
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
