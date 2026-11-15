# FieldShift — NASA Space Apps challenge demo

## Before presenting

- Open the deployed app or run it locally and confirm the network is available.
- Use a prepared rural agricultural point in **Coimbatore district, Tamil Nadu, India**, not the city centre; keep a second prepared point available in case a public data service is slow. Confirm the MODIS land-cover result in advance. Introduce it as an illustrative demo location, not a validated pilot site.
- Select an existing rotation that is plausible for the chosen region. Say clearly that the example is illustrative and the crop table needs local validation.
- If optional satellite layers are still loading, present them as supplemental and continue with the climate-backed comparison.

## Live narration (about 3 minutes)

**0:00–0:25 — The problem**  
“A rotation that protects soil in one place can fail in another if rainfall, heat, water access or local growing seasons differ. Farmers need more than another climate map: they need to see how possible rotation choices compare, and where the evidence is weak.”

**0:25–0:50 — The product**  
“FieldShift starts with the farmer's context: location, soil, water, the two crops in the existing rotation, and priorities. It turns NASA climate history into crop-season indicators, then compares the current rotation with legume-integrated, water-saving and soil-cover strategies. The farmer stays in control of what matters most.”

**0:50–1:25 — Inputs**  
Choose the prepared rural location. Select a common rotation, then show that both current crops appear and can be edited independently. Explain that NASA POWER is a coarse regional climate grid, while SoilGrids is a modeled soil estimate and should be checked against local tests. If MODIS classifies the selected pixel as urban or mixed, point out the warning and call the result regional screening rather than field-specific evidence.

**1:25–2:10 — Compare strategies**  
Open Recommendations. Point out the baseline and available strategy cards, priority-sensitive scores and confidence labels. There can be fewer than three alternatives if no candidate passes the climate screen at that location. Open a card and show the “why” section, seasonal NASA evidence and the bare/crop month timeline. Say: “The score is a transparent screening aid, not a yield forecast. Generic crop parameters and local conditions still need agronomist review.”

**2:10–2:35 — Context, statistics and uncertainty**
Show the NASA water panel in the main results area. Point out GPM daily rainfall coverage and SMAP wetness: where enough complete seasons exist, the water comparison uses observed lower-quintile rainfall to stress-test a dry season. In the Climate tab, show the year-to-year rainfall range and bootstrap intervals, explaining that these summarize the historical sample, not a future forecast. The GPM, SMAP and GRACE/GRACE-FO images are regional map context only; their colors never enter the score, and GRACE is not a single-well measurement. Point to one data gap or risk note. State that soil tests and buyer quotes can be saved as local context but do not yet change the score.

**2:35–2:50 — What-if**  
Move one rainfall or temperature slider. “This stress-tests the historical record by shifting it uniformly. It is not a future climate projection. The point is to reveal whether the ranking is sensitive to the assumptions.” Reset the control.

**2:50–3:00 — Close**  
“FieldShift makes Earth-observation evidence easier to discuss with farmers and local experts. It turns coarse environmental records into a transparent comparison while keeping their uncertainty and data gaps visible. Our next step is a farmer-and-agronomist pilot to validate crop calendars, soil assumptions and score rules. The tool supports their judgment; it does not replace it.”

## Short pitch (about 45 seconds)

“Farmers are choosing rotations under changing rainfall, heat and soil pressure, but climate data alone does not tell them what to plant next. FieldShift compares a farmer's current rotation against up to three strategy alternatives using NASA POWER climate history, crop-season rules and farmer-selected priorities. It shows the evidence, trade-offs, uncertainty and local questions behind every score. Public GPM, SMAP and GRACE maps add regional context, while actual lab and buyer evidence can be saved by the farmer. It does not predict yield or replace agronomists. It helps farmers and advisors decide what is worth validating before changing a field plan.”

## Likely judge questions

**Is this NASA data at field resolution?**  
No. NASA POWER is a 0.5° global grid, and MODIS, SoilGrids and the crop calendar each have their own pixel size and time window. The app keeps those scales separate and labels them; local station and field measurements are still important.

**How are recommendations generated?**  
By transparent, rule-based crop screens and weighted component scores, not a black-box model. Users can inspect evidence, score factors and weights. Crop parameters need regional expert validation.

**What does the score mean?**  
It is a relative screening score under the entered context and chosen priorities. It is not a probability of success, yield estimate or profit forecast.

**How is farmer knowledge included?**  
Farmers enter their current rotation, soil and water context, and set priorities. They can also save lab soil-test values and a local price quote in the browser. Those entries are not score inputs yet. The tool highlights unknowns and review points so local knowledge can validate or reject an option.

**Are the NASA water layers used in the scores?**
Numeric GPM IMERG rainfall and available SMAP L4 root-zone wetness from NASA POWER feed the water comparison. NASA GIBS images appear as regional map context, and FieldShift never samples map colors. GRACE remains context because it cannot resolve a particular field or well.

**What is the next step toward real-world impact?**  
Pilot in one region with farmers and extension/agronomy partners; validate crop calendars and parameters against local knowledge, station records and soil tests; then revise and document the rules before expanding.
