// Planner: finds sowing months and alternative rotations from the climate of the farm point.
// Nothing here is region-specific. It screens every crop in crops.json against the real POWER record,
// builds candidate rotations from the crops that fit, and ranks them with the same scoring rules as the baseline.

import { heatScore, seasonTempFit, waterScore } from './components.js'
import { evaluateRotation, overallScore, scoreRotation } from './engine.js'
import { rotationKey, rotationName } from './names.js'
import { midDuration, validateRotation } from './rotation.js'

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** How well one crop sown in one month suits this location (0 to 100), with the parts shown. Cached in ctx. */
export function optionQuality(crop, sowMonth, ctx) {
  const key = `opt|${crop.id}|${sowMonth}`
  if (ctx.scoreCache.has(key)) return ctx.scoreCache.get(key)
  const w = ctx.weights
  const season = ctx.seasonFor(crop, sowMonth, midDuration(crop))
  let out = null
  if (season) {
    const durationDays = Math.min(365, Math.round(season.lengthMean))
    const items = [{ crop, sowMonth, year: 0, durationDays }]
    const tempFit = seasonTempFit(crop, season, w).fit
    const waterFit = waterScore(items, [season], ctx.farm, w, ctx.soil, w.planner.screeningCropDays).fit
    const heatFit = heatScore(items, [season], w).score
    const s = w.planner.optionQualityShares
    out = { crop, sowMonth, durationDays, tempFit, waterFit, heatFit, quality: s.temp * tempFit + s.water * waterFit + s.heat * heatFit }
  }
  ctx.scoreCache.set(key, out)
  return out
}

const monthGap = (a, b) => Math.min(Math.abs(a - b), 12 - Math.abs(a - b))

/** Months to sow each crop in, best first, with at least 2 months between the picks. */
export function bestOptionsForCrop(crop, ctx, count) {
  const w = ctx.weights.climateFit
  const all = []
  for (let m = 1; m <= 12; m += 1) {
    const o = optionQuality(crop, m, ctx)
    if (o && o.tempFit >= w.minOptionTempFit && o.quality >= w.minOptionQuality) all.push(o)
  }
  all.sort((a, b) => b.quality - a.quality)
  const picked = []
  all.forEach((o) => {
    if (picked.length < count && picked.every((p) => monthGap(p.sowMonth, o.sowMonth) >= 2)) picked.push(o)
  })
  return picked
}

/**
 * Fill in "auto" sowing months. Chooses the combination (non-overlapping, in the given order around the year
 * within each year of the cycle) with the best average option quality. Months the farmer set are kept as they are.
 */
export function autoSchedule(entries, ctx) {
  const crops = entries.map((e) => ctx.cropsById[e.crop])
  const years = entries.map((e) => e.year ?? 0)
  const autoIdx = entries.map((e, i) => (e.sowMonth === 'auto' ? i : -1)).filter((i) => i >= 0)
  if (!autoIdx.length) return entries.map((e) => ({ crop: e.crop, sowMonth: Number(e.sowMonth), year: e.year ?? 0 }))
  const months = entries.map((e) => (e.sowMonth === 'auto' ? 0 : Number(e.sowMonth)))
  let best = null
  const orderOk = () => {
    for (let y = 0; y < 4; y += 1) {
      const idx = entries.map((e, i) => i).filter((i) => years[i] === y)
      for (let k = 1; k < idx.length; k += 1) {
        const prev = (months[idx[k - 1]] - months[idx[0]] + 12) % 12
        const cur = (months[idx[k]] - months[idx[0]] + 12) % 12
        if (cur <= prev) return false
      }
    }
    return true
  }
  const visit = (k) => {
    if (k === autoIdx.length) {
      if (!orderOk()) return
      const opts = months.map((m, i) => optionQuality(crops[i], m, ctx))
      if (opts.some((o) => !o)) return
      const items = months.map((m, i) => ({ crop: crops[i], sowMonth: m, year: years[i], durationDays: opts[i].durationDays }))
      if (validateRotation(items).length) return
      const q = mean(opts.map((o) => o.quality))
      if (!best || q > best.q) best = { q, months: [...months] }
      return
    }
    for (let m = 1; m <= 12; m += 1) {
      months[autoIdx[k]] = m
      visit(k + 1)
    }
  }
  visit(0)
  const chosen = best?.months ?? entries.map((e, i) => (e.sowMonth === 'auto' ? optionBestMonth(crops[i], ctx) : Number(e.sowMonth)))
  return entries.map((e, i) => ({ crop: e.crop, sowMonth: chosen[i], year: years[i] }))
}

function optionBestMonth(crop, ctx) {
  let bestM = 1
  let bestQ = -1
  for (let m = 1; m <= 12; m += 1) {
    const q = optionQuality(crop, m, ctx)?.quality ?? 0
    if (q > bestQ) { bestQ = q; bestM = m }
  }
  return bestM
}

const isCoverCrop = (c) => c.role === 'cover' || c.coverUse === true || (c.erosionCover >= 4 && midDuration(c) <= 90)

// Strategy rules: which crops a rotation must contain to count as that strategy.
export const STRATEGY_RULES = {
  legume: (crops) => crops.length >= 2 && crops.some((c) => c.nFixing >= 4 && c.role === 'main') && crops.some((c) => c.nFixing < 4 && c.role === 'main'),
  'water-saving': (crops) => crops.every((c) => c.droughtTolerance >= 3) && mean(crops.map((c) => c.waterNeed)) <= 2.5,
  'soil-cover': (crops) => crops.some((cc, i) => isCoverCrop(cc) && crops.some((m, j) => j !== i && m.role === 'main' && m.incomePotential >= 2)),
}

function candidatePool(ctx) {
  const p = ctx.weights.planner
  // Only crops commonly grown in this climate type are suggested as alternatives (crops.json grownIn). Any crop can still be chosen as the baseline.
  const grown = (c) => !ctx.climate || !c.grownIn || c.grownIn.includes(ctx.climate.group)
  const mains = ctx.crops.filter((c) => c.role === 'main' && grown(c))
  const covers = ctx.crops.filter((c) => (c.role === 'cover' || c.coverUse) && grown(c))
  const optsOf = (crops) => crops.flatMap((c) => bestOptionsForCrop(c, ctx, p.optionsPerCrop)).sort((a, b) => b.quality - a.quality)
  const mainOpts = optsOf(mains)
  const chosen = [
    ...mainOpts.slice(0, p.maxOptions),
    ...optsOf(mains.filter((c) => c.nFixing >= 4)).slice(0, 6),
    ...optsOf(mains.filter((c) => c.droughtTolerance >= 4)).slice(0, 6),
    ...optsOf(covers).slice(0, p.coverOptions),
  ]
  const seen = new Set()
  return chosen.filter((o) => {
    const k = `${o.crop.id}@${o.sowMonth}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** All valid candidate rotations built from the pool, scored once (priority-independent) and cached in ctx. */
export function candidateRotations(ctx) {
  if (ctx.candidates) return ctx.candidates
  const pool = candidatePool(ctx)
  const max = ctx.weights.planner.maxCropsPerRotation
  const out = []
  const seen = new Set()
  const rules = Object.entries(STRATEGY_RULES)
  const consider = (opts, yearsOf = null) => {
    if (new Set(opts.map((o) => o.crop.id)).size !== opts.length) return
    const crops = opts.map((o) => o.crop)
    const matches = rules.filter(([, rule]) => rule(crops)).map(([id]) => id)
    if (!matches.length) return
    const withYear = opts.map((o, i) => ({ o, year: yearsOf ? yearsOf[i] : 0 }))
    const sorted = withYear.sort((a, b) => a.year - b.year || a.o.sowMonth - b.o.sowMonth)
    const nYears = yearsOf ? Math.max(...yearsOf) + 1 : 1
    const rotation = { id: sorted.map((s) => `${s.o.crop.id}${s.o.sowMonth}y${s.year}`).join('-'), name: rotationName(sorted.map((s) => s.o.crop.name), nYears), crops: sorted.map((s) => ({ crop: s.o.crop.id, sowMonth: s.o.sowMonth, year: s.year })) }
    const key = rotationKey(rotation)
    if (seen.has(key)) return
    seen.add(key)
    const scored = scoreRotation(rotation, ctx)
    if (!scored.error) out.push({ scored, matches, cropKey: [...crops.map((c) => c.id)].sort().join('+') })
  }
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      consider([pool[i], pool[j]])
      if (pool[i].crop.role === 'main' && pool[j].crop.role === 'main') consider([pool[i], pool[j]], [0, 1]) // two-year alternation
      if (max >= 3) for (let k = j + 1; k < pool.length; k += 1) consider([pool[i], pool[j], pool[k]])
    }
  }
  ctx.candidates = out
  return out
}

/** Best rotation for each strategy under the farmer's priorities. A rotation is used for one strategy only. */
export function generateAlternatives(ctx, strategies, priorities, baselineCropKey) {
  const cands = candidateRotations(ctx)
  const ranked = cands
    .filter((c) => c.cropKey !== baselineCropKey)
    .map((c) => ({ ...c.scored, ...overallScore(c.scored.components, priorities, ctx.weights), matches: c.matches, cropKey: c.cropKey }))
  const used = new Set()
  return strategies.map((strategy) => {
    const list = ranked.filter((r) => r.matches.includes(strategy.id)).sort((a, b) => b.overall - a.overall)
    const best = list.find((r) => !used.has(r.cropKey)) ?? null
    if (best) used.add(best.cropKey)
    const variants = []
    const seenCrops = new Set()
    list.forEach((r) => {
      if (variants.length < ctx.weights.planner.variantsShown && !seenCrops.has(r.cropKey)) {
        seenCrops.add(r.cropKey)
        variants.push(r)
      }
    })
    return { strategy, best, variants }
  })
}

/** Evaluate the farmer's rotation (resolving "auto" months) and generate one alternative per strategy. */
export function compareStrategies({ baselineEntries, strategies, ctx, priorities }) {
  const filled = autoSchedule(baselineEntries, ctx)
  const nYears = Math.max(1, ...filled.map((e) => (e.year ?? 0) + 1))
  const baseRotation = { id: 'baseline', name: rotationName(filled.map((e) => ctx.cropsById[e.crop].name), nYears), crops: filled }
  const baseline = evaluateRotation(baseRotation, ctx, priorities)
  const key = [...filled.map((e) => e.crop)].sort().join('+')
  return { baseline, alternatives: generateAlternatives(ctx, strategies, priorities, key), baselineRotation: baseRotation }
}
