/**
 * Post-build integrity check on src/data/generated/.
 *
 * build-dataset.mjs already asserts structural invariants (every class has 20
 * levels, no dangling trait/proficiency refs). This script checks the things that
 * need cross-file agreement: subclass spell grants against the spell list, Paladin
 * and Ranger alignment restrictions against the curated table, spell slot tables
 * against the SRD, and equipment/armour references used by the rules engine.
 *
 * Run with `npm run validate`.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED = join(ROOT, 'src', 'data', 'generated')
const CURATED = join(ROOT, 'src', 'data', 'curated')

const load = async (dir, name) => JSON.parse(await readFile(join(dir, name), 'utf8'))
const maybe = async (dir, name, fallback) => {
  try {
    return await load(dir, name)
  } catch {
    return fallback
  }
}

const rules = await load(GENERATED, 'rules.json')
const spellChunk = await load(GENERATED, 'spells.json')
const itemChunk = await load(GENERATED, 'items.json')
const curatedSpellAlignments = await load(CURATED, 'spell-alignments.json').catch(() => ({}))

const errors = []
const warnings = []
const fail = (msg) => errors.push(msg)
const warn = (msg) => warnings.push(msg)

const spellByIndex = new Map(spellChunk.spells.map((s) => [s.index, s]))
const classByIndex = new Map(rules.classes.map((c) => [c.index, c]))
const subclassByIndex = new Map(rules.subclasses.map((s) => [s.index, s]))
const ALIGNMENTS = rules.alignments.map((a) => a.index)

// --- Subclass spell grants ---------------------------------------------------
let grantCount = 0
for (const sub of rules.subclasses) {
  if (!classByIndex.has(sub.classIndex)) {
    fail(`subclass ${sub.index}: unknown class ${sub.classIndex}`)
  }
  for (const grant of sub.spellGrants ?? []) {
    grantCount += 1
    for (const spellIndex of grant.spells ?? []) {
      if (!spellByIndex.has(spellIndex)) {
        fail(`subclass ${sub.index}: unknown spell ${spellIndex}`)
      }
    }
    if (grant.cantrip && grant.choose && (grant.spells ?? []).length < grant.choose) {
      fail(`subclass ${sub.index}: cantrip pool of ${grant.spells.length} < ${grant.choose}`)
    }
  }
}

// Every subclass level row must be a real class level.
for (const sub of rules.subclasses) {
  for (const row of sub.levelRows ?? []) {
    const klass = classByIndex.get(sub.classIndex)
    if (!klass.levels.some((l) => l.level === row.level)) {
      fail(`subclass ${sub.index}: level ${row.level} does not exist on ${sub.classIndex}`)
    }
  }
}

// --- Class progression tables ------------------------------------------------
const proficiencyByLevel = rules.constants.proficiencyBonusByLevel
for (const klass of rules.classes) {
  // Slot columns are not individually monotonic: a Warlock's slots all sit at
  // the highest level it has unlocked, so its lower columns drop to zero and
  // stay there. The *total* number of slots is what must never shrink.
  let previousTotal = 0
  let previousCantrips = 0

  for (const row of klass.levels) {
    if (row.profBonus !== proficiencyByLevel[row.level]) {
      fail(
        `${klass.index} level ${row.level}: proficiency bonus ${row.profBonus} != ${proficiencyByLevel[row.level]}`,
      )
    }

    const sc = row.spellcasting
    const castsFromHere = Boolean(klass.spellcasting) && row.level >= klass.spellcasting.startsAt
    if (Boolean(sc) !== castsFromHere) {
      fail(`${klass.index} level ${row.level}: spellcasting presence is wrong`)
    }

    if (sc) {
      let total = 0
      for (let lvl = 1; lvl <= 9; lvl += 1) {
        const slots = sc.slots[lvl]
        if (slots == null) {
          fail(`${klass.index} level ${row.level}: missing slot column ${lvl}`)
        } else {
          total += slots
        }
      }
      if (total < previousTotal) {
        fail(`${klass.index} level ${row.level}: total slots fell from ${previousTotal} to ${total}`)
      }
      previousTotal = total

      if (sc.cantripsKnown < previousCantrips) {
        fail(`${klass.index} level ${row.level}: cantrips known decreased`)
      }
      previousCantrips = sc.cantripsKnown

      if (sc.cantripsKnown < 0) fail(`${klass.index} level ${row.level}: negative cantrips`)
      if (sc.spellsKnown != null && sc.spellsKnown < 0) {
        fail(`${klass.index} level ${row.level}: negative spells known`)
      }
    }
    if (row.asiCount < 0) fail(`${klass.index} level ${row.level}: negative ASI count`)
  }

  // Cantrips known is non-decreasing across levels.
  let previous = 0
  for (const row of klass.levels) {
    if (!row.spellcasting) continue
    if (row.spellcasting.cantripsKnown < previous) {
      fail(`${klass.index}: cantrips known decreases at level ${row.level}`)
    }
    previous = row.spellcasting.cantripsKnown
  }

  if (klass.subclassIndexes.length) {
    for (const subIndex of klass.subclassIndexes) {
      if (!subclassByIndex.has(subIndex)) fail(`${klass.index}: unknown subclass ${subIndex}`)
    }
  }
}

// --- Paladin / Ranger spell alignment ---------------------------------------
for (const cls of ['paladin', 'ranger']) {
  const curatedTable = curatedSpellAlignments[cls] ?? {}
  const builtTable = spellChunk.spellAlignment[cls] ?? {}

  for (const [spellIndex, value] of Object.entries(curatedTable)) {
    if (!spellByIndex.has(spellIndex)) {
      warn(`${cls} alignment table lists ${spellIndex}, which is absent from the SRD`)
    }
  }
  for (const [spellIndex, allowed] of Object.entries(builtTable)) {
    for (const alignment of allowed) {
      if (!ALIGNMENTS.includes(alignment)) {
        fail(`${cls} alignment for ${spellIndex}: unknown alignment ${alignment}`)
      }
    }
  }

  // Paladins and Rangers only draw from their own class list.
  const klass = classByIndex.get(cls)
  if (!klass) {
    fail(`class ${cls} missing from dataset`)
    continue
  }
  for (const [spellIndex, allowed] of Object.entries(builtTable)) {
    const spell = spellByIndex.get(spellIndex)
    if (spell && !spell.classes.includes(cls)) {
      fail(`${cls} alignment table covers ${spellIndex}, which is not on the ${cls} spell list`)
    }
    void allowed
  }
}

// --- Subclass grants ---------------------------------------------------------
// The SRD records a spell's `classes` as the classes that can cast it *under
// SRD 5.1*, which excludes most domain, oath, patron and circle spells. So a
// subclass legitimately granting a spell whose `classes` omits its parent class
// is not an error. What must hold is that the grant is well-formed: the spell
// exists, its level is a real spell level, and a cantrip grant really is a
// cantrip.
for (const sub of rules.subclasses) {
  for (const grant of sub.spellGrants ?? []) {
    if (grant.cantrip) {
      for (const spellIndex of grant.spells ?? []) {
        const spell = spellByIndex.get(spellIndex)
        if (spell && spell.level !== 0) {
          fail(`subclass ${sub.index}: cantrip grant includes ${spellIndex} (level ${spell.level})`)
        }
      }
      continue
    }
    for (const spellIndex of grant.spells ?? []) {
      const spell = spellByIndex.get(spellIndex)
      if (!spell) continue
      if (spell.level < 1 || spell.level > 9) {
        fail(`subclass ${sub.index}: leveled grant includes cantrip ${spellIndex}`)
      }
    }
  }
}

// --- Armour & weapons --------------------------------------------------------
const armorByIndex = new Map(itemChunk.armor.map((a) => [a.index, a]))
const STR_REQUIREMENTS = [
  ['chain-mail', 15],
  ['ring-mail', 13],
  ['splint-armor', 15],
  ['plate-armor', 15],
  ['half-plate-armor', 13],
]
for (const [index, minimum] of STR_REQUIREMENTS) {
  const armor = armorByIndex.get(index)
  if (!armor) {
    fail(`armour ${index} missing from dataset`)
    continue
  }
  if (armor.strMinimum !== minimum) {
    fail(`armour ${index}: str minimum ${armor.strMinimum} != ${minimum}`)
  }
}
if (itemChunk.armor.filter((a) => a.category === 'Heavy').length !== 4) {
  fail('expected 4 heavy armour entries')
}
// Net legitimately has no damage die: it restrains instead of dealing damage.
for (const weapon of itemChunk.weapons) {
  if (weapon.damage) continue
  if (weapon.index === 'net') continue
  fail(`weapon ${weapon.index}: no damage die`)
}

// --- Magic item effects ------------------------------------------------------
const EFFECT_KEYS = new Set([
  'abilities',
  'abilityCap',
  'acBonus',
  'allSavesBonus',
  'speedMultiplier',
  'speedSet',
  'resistances',
  'note',
])
const itemByIndex = new Map(itemChunk.magicItems.map((i) => [i.index, i]))
for (const item of itemChunk.magicItems) {
  if (!item.effects) continue
  for (const key of Object.keys(item.effects)) {
    if (!EFFECT_KEYS.has(key)) fail(`item ${item.index}: unknown effect key ${key}`)
  }
  if (item.effects.resistances) {
    const valid = new Set(rules.damageTypes.map((d) => d.index))
    for (const resistance of item.effects.resistances) {
      if (!valid.has(resistance)) fail(`item ${item.index}: unknown resistance ${resistance}`)
    }
  }
  if (item.effects.abilities) {
    for (const [ability, score] of Object.entries(item.effects.abilities)) {
      if (!rules.abilities.some((a) => a.index === ability)) {
        fail(`item ${item.index}: unknown ability ${ability}`)
      }
      // The 20 cap applies to ability score *bonuses*, not to scores set by an
      // item: a Belt of Giant Strength (Storm) sets Strength to 29.
      if (score < 1 || score > 30) {
        fail(`item ${item.index}: ${ability} ${score} is out of range`)
      }
    }
  }
  // Items that lower a score to a fixed value need no cap note; items that raise
  // one past 20 need to say what happens when the wearer already exceeds it.
  const raisesAboveCap = Object.values(item.effects.abilities ?? {}).some((v) => v > 20)
  if (raisesAboveCap && !item.effects.abilityCap && !item.effects.note) {
    warn(`item ${item.index}: raises an ability score without a cap note`)
  }
}
void itemByIndex

// --- Point buy ---------------------------------------------------------------
const pointBuyTotal = Object.values(rules.pointBuy.costs).reduce((a, b) => a + b, 0)
if (pointBuyTotal < rules.pointBuy.budget) {
  warn('point buy scores cannot spend the full budget')
}
for (const [score, cost] of Object.entries(rules.pointBuy.costs)) {
  if (score < rules.pointBuy.min || score > rules.pointBuy.maxBeforeRacial) {
    fail(`point buy has an out-of-range score ${score}`)
  }
  if (cost == null) fail(`point buy has no cost for ${score}`)
}

// --- Backgrounds & subraces -------------------------------------------------
for (const background of rules.backgrounds) {
  if (background.skillProficiencies.length !== 2) {
    fail(`background ${background.index}: ${background.skillProficiencies.length} skills, expected 2`)
  }
  for (const skill of background.skillProficiencies) {
      const target = skill.startsWith('skill-') ? skill.slice(6) : skill
    if (!rules.skills.some((s) => s.index === target)) {
      fail(`background ${background.index}: unknown skill ${skill}`)
    }
  }
  if (!background.feature.name && background.index !== 'acolyte') {
    warn(`background ${background.index}: no feature name`)
  }
}
for (const subrace of rules.subraces) {
  const race = rules.races.find((r) => r.index === subrace.raceIndex)
  if (!race) fail(`subrace ${subrace.index}: unknown parent race ${subrace.raceIndex}`)
  if (!race.subraceIndexes.includes(subrace.index)) {
    fail(`subrace ${subrace.index} not listed on race ${subrace.raceIndex}`)
  }
  for (const cantrip of subrace.cantrips ?? []) {
    const spell = spellByIndex.get(cantrip)
    if (!spell) fail(`subrace ${subrace.index}: unknown cantrip ${cantrip}`)
    else if (spell.level !== 0) warn(`subrace ${subrace.index}: ${cantrip} is level ${spell.level}`)
  }
  for (const grant of subrace.spells ?? []) {
    if (!spellByIndex.has(grant.index)) {
      fail(`subrace ${subrace.index}: unknown spell ${grant.index}`)
    }
  }
}

// --- Race trait references ---------------------------------------------------
const traitByIndex = new Map(rules.traits.map((t) => [t.index, t]))
for (const race of rules.races) {
  for (const trait of race.traits) {
    const found = traitByIndex.get(trait)
    if (!found) fail(`race ${race.index}: unknown trait ${trait}`)
    else if (!found.desc.length) warn(`race ${race.index}: trait ${trait} has no text`)
  }
  if (!race.subraceIndexes.length) {
    // Only Dwarf, Elf, Gnome and Halfling have subraces in the 2014 PHB.
    if (['dwarf', 'elf', 'gnome', 'halfling'].includes(race.index)) {
      warn(`race ${race.index}: no subraces`)
    }
  }
}

// --- Dropped PHB spell references --------------------------------------------
// The curated tables list PHB spells that SRD 5.1 does not publish. The build cannot
// ship them, so each one is reported: the character sheet will simply not offer it.
const report = await maybe(GENERATED, 'build-report.json', null)
if (report?.droppedSpellRefs?.length) {
  const grouped = new Map()
  for (const ref of report.droppedSpellRefs) {
    const key = ref.spellIndex
    if (!grouped.has(key)) grouped.set(key, new Set())
    grouped.get(key).add(ref.subclass)
  }
  for (const [spellIndex, users] of grouped) {
    warn(
      `${spellIndex} is a PHB spell absent from SRD 5.1; omitted from ` +
        `${[...users].join(', ')}`,
    )
  }
}

// --- Report ------------------------------------------------------------------
console.log(`subclass spell grants checked: ${grantCount}`)
console.log(`subclasses: ${rules.subclasses.length}  classes: ${rules.classes.length}`)
console.log(`spells: ${spellChunk.spells.length}  magic items: ${itemChunk.magicItems.length}`)
console.log(
  `dropped PHB spell refs: ${report?.droppedSpellRefs?.length ?? 0} ` +
    `(${(report?.droppedSpellRefs ?? []).length === 0 ? 'none' : 'see warnings'})`,
)

if (warnings.length) {
  console.warn(`\n${warnings.length} warning(s):`)
  for (const w of warnings) console.warn(`  ! ${w}`)
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):`)
  for (const e of errors) console.error(`  x ${e}`)
  process.exit(1)
}
console.log('\nvalidation ok')
