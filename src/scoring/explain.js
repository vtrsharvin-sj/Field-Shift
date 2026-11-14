// Turns scored rotations into farmer-facing cards: why, evidence, benefits, gaps, risks, confidence.
// Every sentence is generated from the scored numbers or from fields in the data files. No free-floating claims.

import { MONTH_NAMES } from './rotation.js'

export const COMPONENT_LABELS = {
  water: 'Water',
  income: 'Income',
  soil: 'Soil health',
  erosion: 'Erosion protection',
  heat: 'Heat and frost safety',
  pest: 'Pest and disease safety',
}

const r0 = (x) => Math.round(x)
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const monthSpan = (sow, days) => `${MONTH_NAMES[sow - 1]} to ${MONTH_NAMES[(sow - 1 + Math.max(0, Math.round(days / 30.4) - 1)) % 12]}`
const unique = (xs) => [...new Set(xs)]

export function powerSourceLabel(meta) {
  const span = `${meta.startYear} to ${meta.endYear}`
  const origin =
    meta.origin === 'prefetched-example'
      ? `pre-fetched NASA data saved ${meta.fetchedAt}`
      : meta.origin === 'live'
        ? 'fetched live'
        : `from browser cache (fetched ${String(meta.fetchedAt ?? '').slice(0, 10)})`
  return `NASA POWER, about 50 km grid cell (not a field measurement), ${span}, ${origin}`
}

/** Months (1-12) formatted as a readable list. */
const monthList = (ms) => (ms.length ? list(ms.map((m) => MONTH_NAMES[m - 1])) : 'none')

function globalGaps(ctx, soilInfo) {
  const gaps = []
  gaps.push('No soil test: soil is set from the dropdown, so water holding and fertility are rough.')
  if (soilInfo?.error || !soilInfo) gaps.push('Soil properties not fetched (SoilGrids was not reachable or not used), so the soil type dropdown was used.')
  else gaps.push(`SoilGrids (ISRIC, not NASA) suggested ${soilInfo.suggestedType} soil here (sand ${r0(soilInfo.sandPct)}%, clay ${r0(soilInfo.clayPct)}%). It is about 250 m resolution and was not used in the scores other than to pre-fill the dropdown.`)
  gaps.push('Crop traits, sowing months and market notes are estimates from the project brief and are not yet verified against TNAU, ICAR or FAO.')
  gaps.push('Market prices are not included. Income is a generic rating, not a profit forecast.')
  gaps.push('Slope and elevation (SRTM) are not included, so erosion risk ignores how steep the field is.')
  gaps.push('Satellite greenness (MODIS NDVI) is not integrated. Bare-field months come from the sowing calendar, not from satellite images.')
  gaps.push('Satellite rainfall (GPM) and soil moisture (SMAP) are not integrated, so NASA POWER rainfall was not cross-checked against a second source.')
  gaps.push('Regional groundwater trend (GRACE) is not integrated. Borewell reliability is taken from the availability level you chose.')
  const m = ctx.power.meta
  if (m.missingParams.length) gaps.push(`NASA POWER did not provide: ${m.missingParams.join(', ')}. Indicators that need them were left out.`)
  if (m.completeness < 1) gaps.push(`${Math.round((1 - m.completeness) * 1000) / 10}% of daily NASA POWER values were missing (-999) and were excluded.`)
  gaps.push('NASA POWER is a model and satellite blend at about 50 km. Local rain can differ a lot from the grid-cell value, especially near hills. Compare with a local rain record before relying on the water results.')
  return gaps
}

function evidenceFor(ev, ctx) {
  const src = powerSourceLabel(ctx.power.meta)
  const lines = []
  ev.items.forEach((it, i) => {
    const s = ev.seasons[i]
    const row = ev.components.water.rows[i]
    const name = it.crop.name
    lines.push({ text: `${name} (${monthSpan(it.sowMonth, it.durationDays)}): average rain ${r0(s.rainMean)} mm per season, varying about ${r0(s.rainCV ?? 0)}% from year to year. Crop water need is about ${r0(row.demand)} mm (Kc ${it.crop.cropCoefficientKc} x ET0 ${r0(s.et0Mean)} mm${it.crop.extraWaterMm ? `, plus ${it.crop.extraWaterMm} mm extra for flooding and land preparation` : ''}).`, source: `${src}. ET0 by Hargreaves-Samani from temperature and latitude.` })
    lines.push({ text: `${name}: longest dry stretch averages ${r0(s.longestDryStretchMean)} days (worst year ${s.longestDryStretchMax}); ${s.heatDaysMean.toFixed(1)} very hot days (above ${it.crop.heatThresholdC} C) and ${s.frostDaysMean.toFixed(1)} frost nights per season.`, source: src })
    if (s.soilWetnessMean != null) lines.push({ text: `${name}: root-zone soil wetness is usually ${s.soilWetnessMean.toFixed(2)} on a 0 (dry) to 1 (wet) scale.`, source: `${src}, GWETROOT (modelled, not measured)` })
  })
  const e = ev.components.erosion
  lines.push({ text: `Months with no crop in the field: ${monthList(e.bareMonths)}. ${e.exposedHeavyMonths.length ? `Of these, ${monthList(e.exposedHeavyMonths)} are heavy-rain months.` : 'None of them are among the heaviest-rain months.'}`, source: `Sowing calendar in rotations.json plus heavy-rain days (above ${r0(ctx.heavyMm)} mm) from ${src}` })
  lines.push({ text: `Crop traits used: ${list(unique(ev.items.map((it) => `${it.crop.name} (nitrogen fixing ${it.crop.nFixing}/5, drought tolerance ${it.crop.droughtTolerance}/5, ground cover ${it.crop.erosionCover}/5)`)))}.`, source: 'crops.json (estimates, not yet verified)' })
  return lines
}

function benefitsFor(ev) {
  const c = ev.components
  const out = []
  const fixers = ev.items.filter((it) => it.crop.nFixing >= 4).map((it) => it.crop.name)
  if (fixers.length) out.push(`Includes ${list(unique(fixers))}, which fix nitrogen in the soil and can reduce fertilizer need.`)
  if (c.erosion.bareMonths.length <= 1) out.push('The field is covered by a crop almost all year, which protects the soil.')
  else if (c.erosion.exposedHeavyMonths.length === 0) out.push('Bare months fall outside the heaviest-rain months, which limits erosion.')
  if (c.water.irrigationNeed < 250) out.push(`Needs only about ${r0(c.water.irrigationNeed)} mm of irrigation beyond usable rain per year.`)
  if (new Set(ev.items.map((it) => it.crop.family)).size >= 2) out.push('Mixes crop families, which helps break pest and disease cycles.')
  if (c.income.avg >= 65) out.push('Crops here have a higher generic income rating (a rating only, not a price).')
  const droughtOk = ev.items.every((it) => it.crop.droughtTolerance >= 4)
  if (droughtOk) out.push('All crops tolerate dry spells well.')
  return out.length ? out : ['No clear strengths on the factors this tool scores.']
}

function risksFor(ev, ctx, baselineEv) {
  const out = []
  const w = ctx.weights
  ev.items.forEach((it, i) => {
    const row = ev.components.water.rows[i]
    const s = ev.seasons[i]
    if (row.ratioDry > 0.15) out.push(`${it.crop.name}: in a dry year (about 1 year in 5) usable rain plus your water source covers roughly ${r0(100 * (1 - row.ratioDry))}% of what the crop needs.`)
    if (s.heatDaysMean / it.durationDays > w.heat.toleratedHeatShare) out.push(`${it.crop.name}: about ${s.heatDaysMean.toFixed(1)} very hot days per season. Check heat-sensitive stages such as flowering with a local expert.`)
    if (s.frostDaysMean > 0) out.push(`${it.crop.name}: frost nights are possible (${s.frostDaysMean.toFixed(1)} per season).`)
    if (it.crop.diseaseProneness >= 3) out.push(`${it.crop.name}: ${it.crop.diseaseNotes}`)
    out.push(`${it.crop.name}: ${it.crop.marketNotes.replace(/\.$/, "")} (needs local verification).`)
  })
  if (ev.components.erosion.exposedHeavyMonths.length) out.push(`Bare field in heavy-rain months (${monthList(ev.components.erosion.exposedHeavyMonths)}) can lose topsoil.`)
  if (ev.components.soil.parts.repeat > 0) out.push('The same crop or crop family follows itself, which raises pest and disease build-up.')
  if (ctx.farm.waterSource === 'rainfed' && ev.items.some((it) => it.crop.waterNeed >= 4)) out.push('Water-hungry crop on rainfed land: confirm a reliable water supply locally.')
  if (ctx.farm.waterSource === 'borewell') out.push('Borewell yield can fall in dry years. Regional groundwater data is not included here.')
  if (ctx.scenario?.rainChangePct || ctx.scenario?.tempChangeC) out.push('These results use a what-if climate change you set. They are not a forecast.')
  if (baselineEv && ev !== baselineEv) {
    Object.keys(COMPONENT_LABELS).forEach((k) => {
      const d = ev.components[k].score - baselineEv.components[k].score
      if (d <= -5) out.push(`Scores ${r0(-d)} points lower than your current rotation on ${COMPONENT_LABELS[k].toLowerCase()}.`)
    })
  }
  out.push('Sowing months are typical values. Local variety, rainfall onset and advice from an extension officer should set the real dates.')
  return unique(out)
}

function whyFor(ev, baselineEv, kind, strategy, ctx, priorities) {
  const labels = COMPONENT_LABELS
  if (kind === 'baseline') {
    const keys = Object.keys(labels).sort((a, b) => ev.components[b].score - ev.components[a].score)
    return [
      'This is your current rotation. It is the comparison point for the others.',
      `Its strongest area is ${labels[keys[0]].toLowerCase()} (${r0(ev.components[keys[0]].score)}/100). Its weakest is ${labels[keys[keys.length - 1]].toLowerCase()} (${r0(ev.components[keys[keys.length - 1]].score)}/100).`,
    ]
  }
  const why = [strategy.purpose]
  const prio = ev.priorityWeights
  const gains = Object.keys(labels)
    .map((k) => ({ k, d: ev.components[k].score - baselineEv.components[k].score, weight: prio[k] ?? 0.1 }))
    .filter((g) => g.d >= 3)
    .sort((a, b) => b.d * b.weight - a.d * a.weight)
    .slice(0, 3)
  gains.forEach(({ k, d }) => {
    let detail = ''
    if (k === 'water') detail = ` It needs about ${r0(Math.max(0, baselineEv.components.water.irrigationNeed - ev.components.water.irrigationNeed))} mm less irrigation per year.`
    if (k === 'soil') detail = ` Soil-health parts: nitrogen fixing +${r0(ev.components.soil.parts.nFix)}, crop variety +${r0(ev.components.soil.parts.diversity)}, repeat penalty -${r0(ev.components.soil.parts.repeat)}.`
    if (k === 'erosion') detail = ` Bare months: ${monthList(ev.components.erosion.bareMonths)} (yours: ${monthList(baselineEv.components.erosion.bareMonths)}).`
    if (k === 'income') detail = ' This is a generic rating, not a price forecast.'
    why.push(`${labels[k]} is ${r0(d)} points higher than your current rotation.${detail}${(prio[k] ?? 0) >= 0.3 ? ' This matches one of your top priorities.' : ''}`)
  })
  if (!gains.length) why.push('It does not beat your current rotation on any factor by a clear margin. It is shown for comparison.')
  return why
}

function whatWouldChange(ev, ctx) {
  const out = ['A soil test (water holding, nutrients, salinity).', 'Local market prices at harvest time.', 'How much water your borewell or canal can really supply in a dry year.']
  if (ev.items.some((it) => it.crop.droughtTolerance <= 2)) out.push('When the monsoon actually starts this year, for the water-hungry crops.')
  out.push('Local variety choice and its real duration, which move the season windows.')
  return out
}

function confidenceFor(ev, cards, ctx, unknownCount) {
  const w = ctx.weights.confidence
  const m = ctx.power.meta
  const reasons = []
  let issues = 0
  const years = m.endYear - m.startYear + 1
  if (m.completeness < w.minCompleteness) { issues += 1; reasons.push(`Only ${Math.round(m.completeness * 100)}% of daily NASA values were usable.`) }
  else reasons.push(`${Math.round(m.completeness * 1000) / 10}% of daily NASA values were usable.`)
  if (years < w.goodYears) { issues += 1; reasons.push(`The climate record is ${years} years, short for judging year-to-year variation.`) }
  else reasons.push(`The climate record covers ${years} years.`)
  const others = cards.filter((c) => c !== ev).map((c) => c.overall)
  const margin = others.length ? Math.min(...others.map((o) => Math.abs(o - ev.overall))) : null
  if (margin != null && margin < w.closeMargin) { issues += 1; reasons.push(`Its score is within ${margin.toFixed(1)} points of another rotation, so the ranking could flip.`) }
  else if (margin != null) reasons.push(`Its score is ${margin.toFixed(1)} points from the nearest other rotation.`)
  if (unknownCount >= 4) { issues += 1; reasons.push(`${unknownCount} local factors are unknown (soil test, market prices, field-level data, slope), so local expert review is needed.`) }
  if (ctx.scenario?.rainChangePct || ctx.scenario?.tempChangeC) { issues += 1; reasons.push('A what-if scenario is applied.') }
  const level = issues === 0 ? 'High' : issues === 1 ? 'Medium' : 'Low'
  return { level, reasons, margin }
}

/** Build the final list of cards. Baseline first, then each strategy's best variant. */
export function buildCards({ comparison, ctx, priorities, soilInfo }) {
  const baseEv = comparison.baseline
  if (!baseEv || baseEv.error) return { error: baseEv?.error ?? 'Your rotation could not be scored.', cards: [] }
  const evs = [{ ev: baseEv, kind: 'baseline', strategy: null, label: 'Your current rotation' }]
  const skipped = []
  comparison.alternatives.forEach((a) => {
    if (a.best) evs.push({ ev: a.best, kind: a.strategy.id, strategy: a.strategy, label: a.strategy.label, variants: a.variants })
    else skipped.push(a.strategy.label)
  })
  const allEv = evs.map((e) => e.ev)
  const ranked = [...allEv].sort((a, b) => b.overall - a.overall)
  const gaps = globalGaps(ctx, soilInfo)
  const unknownCount = 4
  const cards = evs.map(({ ev, kind, strategy, label, variants }) => {
    const cardGaps = [...gaps]
    if (ev.items.some((it) => it.crop.id === 'rice')) cardGaps.push('Extra water for rice (puddling and seepage) is a rough estimate in crops.json.')
    return {
      id: ev.rotation.id,
      kind,
      label,
      name: ev.rotation.name,
      items: ev.items,
      overall: ev.overall,
      rank: ranked.indexOf(ev) + 1,
      components: ev.components,
      bareFraction: ev.components.erosion.bare,
      why: whyFor(ev, baseEv, kind, strategy, ctx, priorities),
      evidence: evidenceFor(ev, ctx),
      benefits: benefitsFor(ev),
      gaps: cardGaps,
      risks: risksFor(ev, ctx, kind === 'baseline' ? null : baseEv),
      whatWouldChange: whatWouldChange(ev, ctx),
      confidence: confidenceFor(ev, allEv, ctx, unknownCount),
      variants: variants?.map((v) => ({ name: v.rotation.name, overall: v.overall })) ?? [],
    }
  })
  return { cards, skipped, error: null }
}

