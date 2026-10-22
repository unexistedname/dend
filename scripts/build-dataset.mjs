/**
 * Merges the vendored SRD 5.1 JSON with the curated PHB supplements into a
 * normalised, UI-ready dataset under src/data/generated/.
 *
 * Run after `npm run sync:srd`. Output is committed, so the app needs no network.
 *
 * Design notes:
 * - Tooltip text is copied verbatim from the SRD. Nothing here is paraphrased.
 * - The 5e-database shapes are inconsistent: `proficiency_choices` is an array on
 *   classes but a bare object on traits/races, `cost` is either a string or a
 *   {quantity, unit} pair, and saving throws appear both as refs and as
 *   `saving-throw-*` proficiencies. All of that is normalised here.
 * - Three chunks keep the bulky text (spells, items) out of the initial payload.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRD_DIR = join(ROOT, 'src', 'data', 'srd')
const CURATED_DIR = join(ROOT, 'src', 'data', 'curated')
const OUT_DIR = join(ROOT, 'src', 'data', 'generated')

const read = async (dir, name) => JSON.parse(await readFile(join(dir, name), 'utf8'))
const maybe = async (dir, name, fallback) => {
  try {
    return await read(dir, name)
  } catch {
    return fallback
  }
}
/**
 * Index of a reference, whichever shape the source uses: `{index: '...'}` for most
 * entries, or `{option_type: 'reference', item: {index: '...'}}` for
 * `proficiency_choices`. Without the second form every class loses its skill pool.
 */
const ref = (r) => (r ? (r.index ?? r.item?.index) : undefined)
const refs = (list) => (list ?? []).map(ref).filter(Boolean)
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])
const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

/**
 * PHB spell references the curated tables ask for that the SRD does not publish.
 * Collected while subclasses are normalised and written out for the validator to
 * report, so a missing spell is never dropped silently.
 */
const droppedSpellRefs = []

/** Drops API plumbing. Nothing in the app reads url/image/updated_at. */
function stripUrl(obj) {
  if (Array.isArray(obj)) return obj.map(stripUrl)
  if (obj && typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'url' || k === 'image' || k === 'updated_at') continue
      out[k] = stripUrl(v)
    }
    return out
  }
  return obj
}

/** `cost` is "5 gp" in some files and {quantity: 5, unit: "gp"} in others. */
function money(cost) {
  if (cost == null) return null
  if (typeof cost === 'string') return cost
  if (typeof cost === 'number') return `${cost} gp`
  if (cost.quantity == null) return null
  return `${cost.quantity} ${cost.unit ?? 'gp'}`
}

const emptyBonus = () => Object.fromEntries(ABILITY_KEYS.map((k) => [k, 0]))

function bonuses(list) {
  const out = emptyBonus()
  for (const b of asArray(list)) {
    const k = ref(b.ability_score)
    if (k in out) out[k] += b.bonus
  }
  return out
}

const hasBonus = (b) => ABILITY_KEYS.some((k) => (b?.[k] ?? 0) !== 0)

/** `proficiency_choices` -> [{desc, choose, type, options: [index]}] */
function choiceGroups(node) {
  return asArray(node?.proficiency_choices)
    .filter(Boolean)
    .map((c) => ({
      desc: c.desc ?? null,
      choose: c.choose ?? 1,
      type: c.type ?? null,
      options: refs(c.from?.options),
    }))
    .filter((g) => g.options.length > 0)
}

function languageOptions(node) {
  const lo = node?.language_options
  if (!lo) return null
  const options = refs(lo.from?.options)
  return options.length ? { choose: lo.choose ?? 1, options } : null
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
const srd = {}
for (const file of [
  'Ability-Scores',
  'Alignments',
  'Backgrounds',
  'Classes',
  'Conditions',
  'Damage-Types',
  'Equipment',
  'Features',
  'Languages',
  'Levels',
  'Magic-Items',
  'Magic-Schools',
  'Proficiencies',
  'Races',
  'Skills',
  'Spells',
  'Subclasses',
  'Subraces',
  'Traits',
  'Weapon-Properties',
]) {
  srd[file] = await read(SRD_DIR, `5e-SRD-${file}.json`)
}

const curated = {
  subraces: (await maybe(CURATED_DIR, 'subraces.json', { subraces: [] })).subraces,
  backgrounds: (await maybe(CURATED_DIR, 'backgrounds.json', { backgrounds: [] })).backgrounds,
  subclasses: (await maybe(CURATED_DIR, 'subclasses.json', { subclasses: [] })).subclasses,
  spellAlignments: await maybe(CURATED_DIR, 'spell-alignments.json', {}),
  itemEffects: (await maybe(CURATED_DIR, 'magic-item-effects.json', { effects: {} })).effects ?? {},
  armorOverrides: (await maybe(CURATED_DIR, 'armor-overrides.json', { armor: {} })).armor ?? {},
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
const abilities = srd['Ability-Scores'].map((a) => ({
  index: a.index,
  name: a.name,
  desc: stripUrl(a.desc ?? []),
}))

const alignments = srd.Alignments.map((a) => ({
  index: a.index,
  name: a.name,
  desc: stripUrl(a.desc ?? []),
}))

const skills = srd.Skills.map((s) => ({
  index: s.index,
  name: s.name,
  ability: ref(s.ability_score),
  desc: stripUrl(s.desc ?? []),
}))

const languages = srd.Languages.map((l) => ({
  index: l.index,
  name: l.name,
  type: l.type,
  desc: stripUrl(l.desc ?? []),
}))

const magicSchools = srd['Magic-Schools'].map((m) => ({
  index: m.index,
  name: m.name,
  desc: stripUrl(m.desc ?? []),
}))

const damageTypes = srd['Damage-Types'].map((d) => ({
  index: d.index,
  name: d.name,
  desc: stripUrl(d.desc ?? []),
}))

const weaponProperties = srd['Weapon-Properties'].map((w) => ({
  index: w.index,
  name: w.name,
  desc: stripUrl(w.desc ?? []),
}))

const conditions = srd.Conditions.map((c) => ({
  index: c.index,
  name: c.name,
  desc: stripUrl(c.desc ?? []),
}))

const proficiencies = srd.Proficiencies.map((p) => ({
  index: p.index,
  name: p.name,
  type: p.type,
  classes: refs(p.classes),
  races: refs(p.races),
  reference: ref(p.reference),
}))
const proficiencyByIndex = new Map(proficiencies.map((p) => [p.index, p]))
const profType = (type) => proficiencies.filter((p) => p.type === type).map((p) => p.index)

// ---------------------------------------------------------------------------
// Traits. Curated PHB traits with no SRD entry get a `phb-trait:` slug.
// ---------------------------------------------------------------------------
const inlineTraitIndex = (name) => `phb-trait:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

const traits = new Map(
  srd.Traits.map((t) => [
    t.index,
    {
      index: t.index,
      name: t.name,
      desc: stripUrl(t.desc ?? []),
      proficiencies: refs(t.proficiencies),
      proficiencyChoices: choiceGroups(t),
      languageOptions: languageOptions(t),
      races: refs(t.races),
      subraces: refs(t.subraces),
    },
  ]),
)

function addInlineTrait(name, desc) {
  const index = inlineTraitIndex(name)
  if (!traits.has(index)) {
    traits.set(index, {
      index,
      name,
      desc,
      proficiencies: [],
      proficiencyChoices: [],
      languageOptions: null,
      races: [],
      subraces: [],
    })
  }
  return index
}

// ---------------------------------------------------------------------------
// Races & subraces
// ---------------------------------------------------------------------------
function normaliseSubrace(s, isCurated) {
  const traitIndexes = isCurated
    ? (s.traitRefs ?? []).slice()
    : refs(s.racial_traits)

  for (const t of s.traitText ?? []) {
    const idx = addInlineTrait(t.name, t.desc)
    if (!traitIndexes.includes(idx)) traitIndexes.push(idx)
  }

  const abilityBonuses = isCurated
    ? { ...emptyBonus(), ...(s.abilityBonuses ?? {}) }
    : bonuses(s.ability_bonuses)

  return {
    index: s.index,
    name: s.name,
    raceIndex: s.raceIndex ?? ref(s.race),
    abilityBonuses: hasBonus(abilityBonuses) ? abilityBonuses : null,
    traits: traitIndexes,
    // Curated entries carry the PHB sentence; SRD entries expose it only through
    // the dwarven-toughness trait text.
    hitPointsBonus: isCurated ? (s.hitPointsBonus ?? null) : null,
    proficiencies: s.proficiencies ?? null,
    cantrips: s.cantrips ?? [],
    // Curated subrace spell grants use `spell`; normalise to `index`.
    spells: (s.spells ?? []).map((g) =>
      typeof g === 'string'
        ? { index: g, minClassLevel: null, uses: null }
        : { index: g.index ?? g.spell, minClassLevel: g.minClassLevel ?? null, uses: g.uses ?? null },
    ),
    languages: s.languages ?? [],
    speedOverride: s.speedOverride ?? null,
    desc: s.desc ? [s.desc] : [],
    textAvailable: Boolean(s.desc),
  }
}

const subraces = [
  ...srd.Subraces.map((s) => normaliseSubrace(s, false)),
  ...curated.subraces.map((s) => normaliseSubrace(s, true)),
].sort((a, b) => a.name.localeCompare(b.name))

const subraceIndexesByRace = new Map()
for (const s of subraces) {
  subraceIndexesByRace.set(s.raceIndex, [...(subraceIndexesByRace.get(s.raceIndex) ?? []), s.index])
}

const races = srd.Races.map((r) => {
  const abo = r.ability_bonus_options
  const bonusOptions = abo
    ? asArray(abo.from?.options)
        .map((o) => ({ ability: ref(o.ability_score), bonus: o.bonus }))
        .filter((o) => o.ability)
    : []

  return {
    index: r.index,
    name: r.name,
    speed: r.speed,
    size: r.size,
    sizeDescription: r.size_description ?? null,
    abilityBonuses: bonuses(r.ability_bonuses),
    abilityBonusOptions: bonusOptions.length
      ? { choose: abo.choose ?? 1, options: bonusOptions }
      : null,
    languages: refs(r.languages),
    languageOptions: languageOptions(r),
    languageDescription: r.language_desc ?? null,
    traits: refs(r.traits),
    traitChoices: choiceGroups(r),
    subraceIndexes: subraceIndexesByRace.get(r.index) ?? [],
    age: r.age ?? null,
    alignment: r.alignment ?? null,
  }
})

/**
 * Variant Human is a PHB option ("the humans present a special case"), modelled
 * as an ancestry variant so it composes with any class like a normal race.
 *
 * 2014 rule: +1 to two different ability scores of your choice (+1 to a skill and
 * a feat). The score choices live in the character's `racialAbilityChoices`, since
 * they are per-character; the fixed bonuses here are deliberately all zero.
 */
const variantHuman = {
  index: 'variant-human',
  name: 'Variant Human',
  abilityBonuses: Object.fromEntries(ABILITY_KEYS.map((k) => [k, 0])),
  featAbilityBonus: 1,
  extraFeat: true,
  rulebookSource: "Player's Handbook, 'Human' race (Variant Human)",
  description:
    'The humans present a special case in this world: capable of living in nearly any environment. If you choose to be a variant human, you gain +1 to two different ability scores of your choice and one additional benefit.',
}

// ---------------------------------------------------------------------------
// Backgrounds. SRD and curated files expose proficiencies under different keys.
// ---------------------------------------------------------------------------
function normaliseBackground(b, isCurated) {
  const starting = refs(b.starting_proficiencies)

  // Curated files store plain index strings; SRD stores ref objects.
  const asIndex = (x) => (typeof x === 'string' ? x : ref(x))

  const skillProficiencies = (isCurated ? b.skillProficiencies ?? [] : starting)
    .map(asIndex)
    .filter(Boolean)
    .filter((p) => p.startsWith('skill-'))

  const toolProficiencies = (isCurated ? b.toolProficiencies ?? [] : starting)
    .map(asIndex)
    .filter(Boolean)
    .filter((p) => !p.startsWith('skill-'))

  const equipment = isCurated
    ? asArray(b.equipment).map((line) =>
        typeof line === 'string'
          ? { name: line, cost: null }
          : { name: line.name, cost: money(line.cost) },
      )
    : asArray(b.starting_equipment).map((e) => ({
        name: ref(e.equipment) ?? 'Unknown item',
        cost: null,
        quantity: e.quantity ?? null,
      }))

  const featureDesc = isCurated ? stripUrl(b.feature?.desc ?? []) : []

  return {
    index: b.index,
    name: b.name,
    skillProficiencies,
    toolProficiencies,
    languages: isCurated ? (b.languages ?? 0) : (b.language_options?.choose ?? 0),
    languageOptions: languageOptions(b),
    startingGold: isCurated ? (b.startingGold ?? null) : (b.starting_gold?.quantity ?? null),
    equipment,
    // PHB background feature text is not OGL, so curated entries ship the name
    // only and `desc` stays empty.
    feature: { name: isCurated ? (b.feature?.name ?? null) : null, desc: featureDesc },
    // 2014 backgrounds grant no ability score increase. The field is kept in the
    // dataset shape (0) so downstream code cannot accidentally resurrect the 2024
    // "+2 to one ability" rule.
    featAbilityBonus: 0,
    textAvailable: featureDesc.length > 0,
    desc: b.desc ? [b.desc] : [],
  }
}

const backgrounds = [
  ...srd.Backgrounds.map((b) => normaliseBackground(b, false)),
  ...curated.backgrounds
    .filter((b) => !srd.Backgrounds.some((x) => x.index === b.index))
    .map((b) => normaliseBackground(b, true)),
].sort((a, b) => a.name.localeCompare(b.name))

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------
const spells = srd.Spells.map((s) => ({
  index: s.index,
  name: s.name,
  level: s.level,
  school: ref(s.school),
  castingTime: s.casting_time,
  range: s.range,
  components: refs(s.components),
  material: s.material ?? null,
  duration: s.duration,
  ritual: Boolean(s.ritual),
  concentration: Boolean(s.concentration),
  attackType: s.attack_type ?? null,
  damage: stripUrl(s.damage ?? []),
  areaOfEffect: s.area_of_effect ?? null,
  dc: stripUrl(s.dc ?? null),
  desc: stripUrl(s.desc ?? []),
  higherLevel: stripUrl(s.higher_level ?? []),
  classes: refs(s.classes),
  subclasses: refs(s.subclasses),
}))
  .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

const spellByIndex = new Map(spells.map((s) => [s.index, s]))

/**
 * Paladin/Ranger alignment restrictions. PHB: "your spells must be of your
 * alignment". The SRD does not tag spells, so the curated table does, with group
 * keywords expanded here so the app never has to.
 */
const ALIGNMENT_GROUPS = {
  good: ['lawful-good', 'neutral-good', 'chaotic-good'],
  evil: ['lawful-evil', 'neutral-evil', 'chaotic-evil'],
  lawful: ['lawful-good', 'lawful-neutral', 'lawful-evil'],
  neutral: ['neutral-good', 'true-neutral', 'neutral-evil'],
  chaotic: ['chaotic-good', 'chaotic-neutral', 'chaotic-evil'],
}

function expandAlignment(value) {
  if (value == null || value === 'any') return null
  const expanded = new Set()
  for (const entry of asArray(value)) {
    // Expand the group keyword to its members and drop the keyword itself.
    for (const alignment of ALIGNMENT_GROUPS[entry] ?? []) expanded.add(alignment)
    if (!ALIGNMENT_GROUPS[entry]) expanded.add(entry)
  }
  return [...expanded].sort()
}

const spellAlignment = {}
for (const cls of ['paladin', 'ranger']) {
  const table = curated.spellAlignments[cls] ?? {}
  const out = {}
  for (const [spellIndex, value] of Object.entries(table)) {
    if (!spellByIndex.has(spellIndex)) continue
    const expanded = expandAlignment(value)
    if (expanded) out[spellIndex] = expanded
  }
  spellAlignment[cls] = out
}

// ---------------------------------------------------------------------------
// Subclasses. Curated indexes are descriptive (`path-of-the-berserker`) while the
// SRD uses short slugs (`berserker`) and publishes text for only 12 of them, so
// match on class + name to recover the slug and its verbatim text.
// ---------------------------------------------------------------------------
const srdSubclassByClassName = new Map(
  srd.Subclasses.map((s) => [`${ref(s.class)}:${s.name.toLowerCase()}`, s]),
)

/**
 * Curated names carry the full archetype title ("Path of the Berserker") while the
 * SRD publishes only the short form ("Berserker"), so an exact match misses most of
 * them. Fall back to a same-class match on the tail of either the name or the index,
 * which is enough for every curated entry without risking a cross-class hit.
 */
const findSrdSubclass = (classIndex, curated) => {
  const exact = srdSubclassByClassName.get(`${classIndex}:${curated.name.toLowerCase()}`)
  if (exact) return exact
  const name = curated.name.toLowerCase()
  const slug = curated.index.toLowerCase()
  return (
    srd.Subclasses.find((s) => {
      if (ref(s.class) !== classIndex) return false
      const srdName = s.name.toLowerCase()
      return (
        name === srdName ||
        name.endsWith(` ${srdName}`) ||
        slug === s.index ||
        slug.endsWith(`-${s.index}`) ||
        slug.startsWith(`${s.index}-`)
      )
    }) ?? null
  )
}

const subclasses = curated.subclasses.map((s) => {
  const srdEntry = findSrdSubclass(s.classIndex, s)
  const srdSlug = srdEntry?.index ?? s.index

  const spellGrants = []
  for (const g of s.spellGrants ?? []) {
    if (g.cantrip && g.choose) {
      spellGrants.push({
        minClassLevel: g.minClassLevel ?? null,
        cantrip: true,
        choose: g.choose,
        spellList: g.spellList ?? s.classIndex,
        spells: spells
          .filter((x) => x.level === 0 && (g.spellList ? x.classes.includes(g.spellList) : true))
          .map((x) => x.index),
      })
      continue
    }
    // Curated tables list PHB spells. Any absent from the SRD cannot be shipped, so
    // it is recorded in the build report and surfaced by validate-srd.mjs rather than
    // dropped silently.
    const missing = (g.spells ?? []).filter((i) => !spellByIndex.has(i))
    for (const spellIndex of missing) {
      droppedSpellRefs.push({ subclass: s.index, spellIndex, minClassLevel: g.minClassLevel ?? null })
    }
    const known = (g.spells ?? []).filter((i) => spellByIndex.has(i))
    if (known.length) {
      // A grant whose spells are all cantrips (Light Domain's light, Arcane
      // Trickster's mage hand, Illusion school's minor illusion) is a cantrip
      // grant even though the table did not say so.
      const allCantrips = known.every((i) => spellByIndex.get(i).level === 0)
      spellGrants.push({
        minClassLevel: g.minClassLevel ?? null,
        cantrip: allCantrips,
        spells: known,
      })
    }
  }

  return {
    index: s.index,
    srdIndex: srdEntry?.index ?? null,
    name: s.name,
    classIndex: s.classIndex,
    level: s.level ?? null,
    flavor: s.flavor ?? null,
    grantsExtraSpellSlots: Boolean(s.grantsExtraSpellSlots),
    spellGrants,
    levelRows: srd.Levels.filter((l) => ref(l.subclass) === srdSlug)
      .sort((a, b) => a.level - b.level)
      .map((l) => ({ level: l.level, subclassSpecific: stripUrl(l.subclass_specific ?? {}) })),
    features: srd.Features.filter((f) => ref(f.subclass) === srdSlug)
      .sort((a, b) => a.level - b.level)
      .map((f) => ({
        index: f.index,
        name: f.name,
        level: f.level ?? null,
        desc: stripUrl(f.desc ?? []),
      })),
    desc: stripUrl(srdEntry?.desc ?? []),
    textAvailable: Boolean(srdEntry?.desc?.length),
  }
})

const subclassesByClass = new Map()
for (const s of subclasses) {
  subclassesByClass.set(s.classIndex, [...(subclassesByClass.get(s.classIndex) ?? []), s.index])
}

// ---------------------------------------------------------------------------
// Equipment, armour and magic items
// ---------------------------------------------------------------------------
const equipmentIn = (category) => srd.Equipment.filter((e) => ref(e.equipment_category) === category)

const weapons = equipmentIn('weapon').map((w) => ({
  index: w.index,
  name: w.name,
  category: w.weapon_category ?? null,
  range: w.weapon_range ?? null,
  cost: money(w.cost),
  weight: w.weight ?? null,
  damage: w.damage ?? null,
  throwRange: w.throw_range ?? null,
  twoHandedDamage: w.two_handed_damage ?? null,
  properties: refs(w.properties),
  desc: stripUrl(w.special ?? []),
}))

const armor = equipmentIn('armor').map((a) => {
  // The SRD under-reports three Strength requirements; the PHB table governs.
  const override = curated.armorOverrides[a.index] ?? {}
  return {
    index: a.index,
    name: a.name,
    category: a.armor_category,
    baseAC: a.armor_class?.base ?? null,
    dexBonus: Boolean(a.armor_class?.dex_bonus),
    maxDexBonus: a.armor_class?.max_bonus ?? null,
    strMinimum: override.strMinimum ?? a.str_minimum ?? 0,
    stealthDisadvantage: Boolean(a.stealth_disadvantage),
    cost: money(a.cost),
    weight: a.weight ?? null,
  }
})

const gear = [...equipmentIn('adventuring-gear'), ...equipmentIn('mounts-and-vehicles')].map(
  (g) => ({
    index: g.index,
    name: g.name,
    category: ref(g.gear_category) ?? ref(g.vehicle_category),
    cost: money(g.cost),
    weight: g.weight ?? null,
    quantity: g.quantity ?? null,
    contents: g.contents ?? null,
    desc: stripUrl(g.desc ?? []),
  }),
)

const tools = equipmentIn('tools').map((t) => ({
  index: t.index,
  name: t.name,
  category: t.tool_category ?? null,
  cost: money(t.cost),
  weight: t.weight ?? null,
  desc: stripUrl(t.desc ?? []),
}))

/**
 * Attunement and its restrictions live in prose. The SRD phrasing is
 * "(requires attunement by a cleric, druid, or paladin)", and a few items
 * mention it in a later paragraph ("Requires Attunement"). Split the tail on
 * commas and "or"/"and", then classify each token against the known class and
 * race names rather than guessing.
 */
const ATTUNEMENT = /requires attunement(?:\s+by\s+([^)]*?))?\s*\)/i

const CLASS_NAMES = new Map(srd.Classes.map((c) => [c.name.toLowerCase(), c.index]))
const RACE_NAMES = new Map(srd.Races.map((r) => [r.name.toLowerCase(), r.index]))

function attunementRules(desc) {
  const prose = (desc ?? []).find((p) => ATTUNEMENT.test(p)) ?? null
  if (!prose) return { required: false, classes: [], races: [], spellcaster: false }

  const tail = prose.match(ATTUNEMENT)?.[1] ?? ''
  const tokens = tail
    .toLowerCase()
    .split(/,|\bor\b|\band\b/)
    .map((t) => t.replace(/^(?:a|an|the)\s+/, '').trim())
    .filter(Boolean)

  const classes = []
  const races = []
  let spellcaster = false

  for (const token of tokens) {
    if (token === 'spellcaster') {
      spellcaster = true
    } else if (CLASS_NAMES.has(token)) {
      classes.push(CLASS_NAMES.get(token))
    } else if (RACE_NAMES.has(token)) {
      races.push(RACE_NAMES.get(token))
    }
  }

  return {
    required: true,
    // null means "no class restriction stated"; "Requires attunement by a
    // spellcaster" additionally sets `spellcaster` so the UI can say so.
    classes: classes.length ? classes : null,
    races: races.length ? races : null,
    spellcaster,
    source: prose.trim(),
  }
}

const magicItems = srd['Magic-Items'].map((i) => {
  const desc = stripUrl(i.desc ?? [])
  return {
    index: i.index,
    name: i.name,
    category: ref(i.equipment_category),
    rarity: i.rarity?.name ?? null,
    attunement: attunementRules(desc),
    effects: curated.itemEffects[i.index] ?? null,
    variants: refs(i.variants),
    isVariant: Boolean(i.variant),
    desc,
  }
})

// ---------------------------------------------------------------------------
// Classes. `srd.Levels` holds both class rows (no `subclass`) and subclass rows.
// ---------------------------------------------------------------------------
const classLevels = new Map()
for (const l of srd.Levels) {
  if (l.subclass) continue
  const key = ref(l.class)
  classLevels.set(key, [...(classLevels.get(key) ?? []), l])
}

const featuresByClassSubclassLevel = new Map()
for (const f of srd.Features) {
  const key = `${ref(f.class)}|${ref(f.subclass) ?? ''}|${f.level ?? ''}`
  featuresByClassSubclassLevel.set(key, [
    ...(featuresByClassSubclassLevel.get(key) ?? []),
    f,
  ])
}

const featuresFor = (classIndex, level, subclassIndex = '') =>
  (featuresByClassSubclassLevel.get(`${classIndex}|${subclassIndex}|${level}`) ?? []).map((f) => ({
    index: f.index,
    name: f.name,
    level: f.level ?? null,
    desc: stripUrl(f.desc ?? []),
    prerequisites: asArray(f.prerequisites).map((p) => p.type),
  }))

/** Normalises one SRD `Levels[].spellcasting` object. Absent slots mean zero. */
function spellcastingRow(sc) {
  return {
    cantripsKnown: sc.cantrips_known ?? 0,
    spellsKnown: sc.spells_known ?? null,
    slots: Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [i + 1, sc[`spell_slots_level_${i + 1}`] ?? 0]),
    ),
  }
}

const classes = srd.Classes.map((c) => {
  const classIndex = c.index
  const levels = (classLevels.get(classIndex) ?? []).sort((a, b) => a.level - b.level)
  const groups = choiceGroups(c)

  const armorProficiencies = []
  const weaponProficiencies = []
  const grantedToolProficiencies = []
  for (const p of refs(c.proficiencies)) {
    switch (proficiencyByIndex.get(p)?.type) {
      case 'Armor':
        armorProficiencies.push(p)
        break
      case 'Weapons':
        weaponProficiencies.push(p)
        break
      case 'Saving Throws':
        break
      default:
        grantedToolProficiencies.push(p)
    }
  }

  const skillChoices = groups
    .filter((g) => g.options.some((o) => o.startsWith('skill-')))
    .map((g) => ({ ...g, options: g.options.filter((o) => o.startsWith('skill-')) }))

  const instrumentChoices = groups
    .filter((g) => g.options.some((o) => profType('Musical Instruments').includes(o)))
    .map((g) => ({
      ...g,
      options: g.options.filter((o) => profType('Musical Instruments').includes(o)),
    }))

  const toolChoices = groups
    .filter(
      (g) =>
        !skillChoices.includes(g) &&
        !instrumentChoices.includes(g) &&
        g.options.some(
          (o) =>
            profType("Artisan's Tools").includes(o) ||
            profType('Gaming Sets').includes(o) ||
            profType('Other').includes(o) ||
            o === 'vehicles',
        ),
    )
    .map((g) => ({ ...g }))

  return {
    index: classIndex,
    name: c.name,
    hitDie: c.hit_die,
    savingThrows: refs(c.saving_throws),
    armorProficiencies,
    weaponProficiencies,
    grantedToolProficiencies,
    skillChoices,
    instrumentChoices,
    toolChoices,
    spellcasting: c.spellcasting
      ? {
          ability: ref(c.spellcasting.spellcasting_ability),
          startsAt: c.spellcasting.level ?? 1,
          info: asArray(c.spellcasting.info).map((i) => ({
            name: i.name,
            desc: stripUrl(i.desc ?? []),
          })),
        }
      : null,
    // Prepared-spell classes choose from the whole list; others have a fixed count.
    preparesSpells: ['cleric', 'druid', 'paladin', 'ranger', 'wizard'].includes(classIndex),
    subclassIndexes: subclassesByClass.get(classIndex) ?? [],
    levels: levels.map((l) => {
      const sc = l.spellcasting
      // SRD quirk: the Paladin and Ranger level-1 rows carry an all-zero
      // spellcasting object even though neither casts at 1st level. Treat a row
      // with nothing in it as "does not cast yet".
      const empty =
        sc != null &&
        !sc.cantrips_known &&
        !sc.spells_known &&
        ![1, 2, 3, 4, 5, 6, 7, 8, 9].some((n) => sc[`spell_slots_level_${n}`])
      return {
        level: l.level,
        profBonus: l.prof_bonus,
        asiCount: l.ability_score_bonuses ?? 0,
        spellcasting: sc && !empty ? spellcastingRow(sc) : null,
        features: featuresFor(classIndex, l.level),
        classSpecific: stripUrl(l.class_specific ?? {}),
      }
    }),
    multiClassing: stripUrl(c.multi_classing ?? {}),
    startingEquipment: stripUrl(c.starting_equipment ?? []),
    startingEquipmentOptions: stripUrl(c.starting_equipment_options ?? []),
  }
})

// ---------------------------------------------------------------------------
// Static rulebook tables
// ---------------------------------------------------------------------------
/** PHB "Assigning Ability Scores": 27 points, scores 8-15 before racial bonuses. */
const pointBuy = {
  budget: 27,
  min: 8,
  maxBeforeRacial: 15,
  costs: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 },
}

const standardArray = [15, 14, 13, 12, 10, 8]

const rolling = {
  expression: '4d6dl1',
  groups: 6,
  rulebookText:
    'Roll four six-sided dice. Drop the lowest one. Assign the new character\u2019s six results to the six ability scores on the character sheet. You can assign the values in any order. You can also assign any one score twice.',
}

const rules = {
  meta: {
    generator: 'scripts/build-dataset.mjs',
    ruleset: 'D&D 5e (2014)',
    source:
      "System Reference Document 5.1 (Wizards of the Coast, CC-BY-4.0) via 5e-bits/5e-database, plus curated Player's Handbook (2014) supplements.",
    licence: 'CC-BY-4.0 - see src/data/LICENSES.md',
  },
  abilities,
  alignments,
  conditions,
  damageTypes,
  languages,
  magicSchools,
  skills,
  weaponProperties,
  proficiencies,
  traits: [...traits.values()],
  races,
  variantHuman,
  subraces,
  backgrounds,
  classes,
  subclasses,
  pointBuy,
  standardArray,
  rolling,
  maxAbilityScore: 20,
  constants: {
    maxAttunementSlots: 3,
    // PHB "Proficiency Bonus": +2 at levels 1-4, +3 at 5-8, and so on.
    proficiencyBonusByLevel: Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [i + 1, 2 + Math.floor(i / 4)]),
    ),
    acUnarmoredDexCap: 10,
    shieldAcBonus: 2,
    attunementSlotsPerLevelUpTo3: 3,
  },
}

const spellChunk = {
  meta: rules.meta,
  spells,
  spellAlignment,
  subclassSpellGrants: Object.fromEntries(
    subclasses.map((s) => [s.index, s.spellGrants]),
  ),
}

const itemChunk = {
  meta: rules.meta,
  weapons,
  armor,
  gear,
  tools,
  magicItems,
}

async function emit(name, data) {
  const json = JSON.stringify(data)
  await writeFile(join(OUT_DIR, name), json, 'utf8')
  console.log(`${name.padEnd(14)} ${(json.length / 1024).toFixed(0).padStart(6)} kB`)
}

await mkdir(OUT_DIR, { recursive: true })
console.log(
  `races=${races.length} subraces=${subraces.length} backgrounds=${backgrounds.length} ` +
    `classes=${classes.length} subclasses=${subclasses.length} spells=${spells.length}\n` +
    `weapons=${weapons.length} armor=${armor.length} gear=${gear.length} tools=${tools.length} ` +
    `magicItems=${magicItems.length} traits=${traits.size}\n`,
)

await emit('rules.json', rules)
await emit('spells.json', spellChunk)
await emit('items.json', itemChunk)
await emit(
  'build-report.json',
  {
    meta: rules.meta,
    counts: {
      races: races.length,
      subraces: subraces.length,
      backgrounds: backgrounds.length,
      classes: classes.length,
      subclasses: subclasses.length,
      spells: spells.length,
      weapons: weapons.length,
      armor: armor.length,
      gear: gear.length,
      tools: tools.length,
      magicItems: magicItems.length,
    },
    // Spells the curated tables reference that the SRD does not publish. They are
    // absent from the generated data, so the UI cannot offer them.
    droppedSpellRefs,
  },
)

// Fail loudly rather than shipping a dataset with dangling references.
const problems = []
const classIndexes = new Set(classes.map((c) => c.index))
const traitIndexes = new Set(traits.keys())
const profIndexes = new Set(proficiencies.map((p) => p.index))

for (const c of classes) {
  if (c.levels.length !== 20) problems.push(`class ${c.index} has ${c.levels.length} levels, expected 20`)
  for (const g of [...c.skillChoices, ...c.instrumentChoices, ...c.toolChoices]) {
    for (const o of g.options) {
      if (o.startsWith('skill-') && !profIndexes.has(o)) problems.push(`${c.index}: unknown ${o}`)
    }
  }
}
for (const s of subclasses) {
  if (!classIndexes.has(s.classIndex)) problems.push(`subclass ${s.index}: unknown class ${s.classIndex}`)
}
for (const s of subraces) {
  if (!s.raceIndex) problems.push(`subrace ${s.index}: no parent race`)
  for (const t of s.traits) {
    if (!traitIndexes.has(t)) problems.push(`subrace ${s.index}: unknown trait ${t}`)
  }
}

if (problems.length) {
  console.error('BUILD FAILED:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('dataset ok')
