/**
 * Armour Class.
 *
 * PHB rules implemented:
 * - "Your Armor Class equals 10 + your Dexterity modifier" when wearing no armour.
 * - Armour: base AC from Table 13, plus your Dexterity modifier for light and
 *   medium armour, and only up to the listed maximum, unless proficient with it.
 *   Heavy armour adds no Dexterity modifier at all.
 * - Shields add +2 and require a shield proficiency.
 * - Barbarian Unarmored Defense: 10 + Dex + Con while not wearing heavy armour.
 * - Monk Unarmored Defense: 10 + Dex + Wis while wearing no armour and no shield.
 * - Attuned magic items that grant an AC bonus add while attuned.
 * - "If a creature has a Strength score of less than 13 (or 15 for this armor),
 *   the creature can't equip or wear armor with this requirement."
 * - "You must be proficient with a piece of armor to wear it."
 */
import type { AbilityKey, AbilityScores, Armor } from '../data/types'
import type { Character, EquipmentEntry } from '../state/schema'
import { abilityTotals } from './abilities'
import { parseInventoryId, type RulesContext } from './context'
import { itemBonuses, effectiveItemScores, type ItemAggregate } from './items'
import { armorProficiencies, proficiencyBonus, racialProficiencies } from './proficiency'

export interface AcBreakdown {
  total: number
  base: number
  dexBonus: number
  conBonus: number
  wisBonus: number
  intBonus: number
  armorName: string | null
  armorBase: number
  dexCapped: boolean
  shieldBonus: number
  itemBonus: number
  /** Which rule produced the AC, for the hover explanation. */
  method: 'unarmored' | 'barbarian-unarmored-defense' | 'monk-unarmored-defense' | 'armor'
  /** Armour that is equipped but cannot legally be worn. */
  blockingArmor: { index: string; name: string; reason: string } | null
}

const dexCap = (ctx: RulesContext) => ctx.rules.constants.acUnarmoredDexCap

export function armorProficienciesFor(character: Character, ctx: RulesContext): Set<string> {
  return armorProficiencies(character, ctx)
}

/**
 * Whether the character may legally wear a piece of armour: proficient, and strong
 * enough to meet the Strength requirement. Returns the reason when they may not.
 */
export function armorBlocker(
  armor: Armor,
  character: Character,
  ctx: RulesContext,
): string | null {
  const scores = itemAwareScores(character, ctx)
  const proficiencies = armorProficienciesFor(character, ctx)

  // Table 13 lists a Strength requirement against Strength for every entry; the
  // Shield row has none.
  if (armor.strMinimum > 0 && scores.str < armor.strMinimum) {
    return `Strength ${armor.strMinimum} required`
  }

  // Category indexes are already expanded by `armorProficiencies`, so "all-armor"
  // has become light/medium/heavy and a Fighter matches every row of Table 13.
  const needed = armor.category === 'Shield' ? 'shields' : `${armor.category.toLowerCase()}-armor`
  if (!proficiencies.has(needed)) {
    return `Not proficient with ${needed}`
  }

  return null
}

/**
 * Scores after magic items that *set* a value, which can lift a Heavy armour check.
 *
 * Uses `effectiveItemScores`, not the raw aggregate, so an Amulet of Health that
 * says "no effect if your Constitution is already 19 or higher" is respected: it
 * raises a low score to 19 but never lowers a 20.
 */
function itemAwareScores(character: Character, ctx: RulesContext): AbilityScores {
  const scores = abilityTotals(character, ctx)
  const set = effectiveItemScores(character, ctx)
  for (const [key, value] of Object.entries(set)) {
    if (!(key in scores) || value == null) continue
    // An item can only ever raise a score, never reduce one.
    const next = value as number
    const current = scores[key as AbilityKey]
    if (next > current) scores[key as AbilityKey] = next
  }
  return scores
}

const equippedArmor = (character: Character, ctx: RulesContext) =>
  character.inventory
    .filter((entry) => entry.equipped)
    .map((entry) => ({ entry, resolved: parseInventoryId(entry.id, ctx) }))
    .filter((x) => x.resolved?.kind === 'armor')

export function computeArmorClass(character: Character, ctx: RulesContext): AcBreakdown {
  const scores = itemAwareScores(character, ctx)
  const modifiers = Object.fromEntries(
    (Object.keys(scores) as AbilityKey[]).map((k) => [
      k,
      Math.floor((scores[k] - 10) / 2),
    ]),
  ) as AbilityScores

  const aggregate: ItemAggregate = itemBonuses(character, ctx)
  const worn = equippedArmor(character, ctx)

  const bodyArmor = worn
    .map((x) => x.resolved!.entry as Armor)
    .find((a) => a.category !== 'Shield')
  const shield = worn.map((x) => x.resolved!.entry as Armor).find((a) => a.category === 'Shield')

  const result: AcBreakdown = {
    total: 10,
    base: 10,
    dexBonus: 0,
    conBonus: 0,
    wisBonus: 0,
    intBonus: 0,
    armorName: null,
    armorBase: 0,
    dexCapped: false,
    shieldBonus: 0,
    itemBonus: aggregate.acBonus,
    method: 'unarmored',
    blockingArmor: null,
  }

  const legalArmor = bodyArmor && !armorBlocker(bodyArmor, character, ctx) ? bodyArmor : null
  const legalShield = shield && !armorBlocker(shield, character, ctx) ? shield : null

  // An item that raises Strength can make previously illegal heavy armour legal, so
  // report the blocker against the *unequipped* score too.
  if (bodyArmor && !legalArmor) {
    result.blockingArmor = {
      index: bodyArmor.index,
      name: bodyArmor.name,
      reason: armorBlocker(bodyArmor, character, ctx) ?? 'Unknown restriction',
    }
  }

  const classIndexes = character.classes.filter((c) => c.level > 0).map((c) => c.classIndex)

  if (legalArmor && legalArmor.category !== 'Shield') {
    result.method = 'armor'
    result.armorName = legalArmor.name
    result.armorBase = legalArmor.baseAC ?? 10
    result.base = legalArmor.baseAC ?? 10

    if (legalArmor.dexBonus) {
      const raw = modifiers.dex
      const cap = legalArmor.maxDexBonus ?? dexCap(ctx)
      // PHB: a higher maximum applies only while proficient with the armour, and
      // every proficiency here already includes it.
      const applied = Math.min(raw, cap)
      result.dexBonus = applied
      result.dexCapped = raw > cap
    }
  } else if (classIndexes.includes('barbarian') && legalArmor?.category !== 'Heavy') {
    // Unarmored Defense: 10 + Dex + Con while not wearing heavy armour.
    result.method = 'barbarian-unarmored-defense'
    result.dexBonus = modifiers.dex
    result.conBonus = modifiers.con
  } else if (
    classIndexes.includes('monk') &&
    !legalArmor &&
    !legalShield
  ) {
    // Unarmored Defense: 10 + Dex + Wis while wearing no armour and no shield.
    result.method = 'monk-unarmored-defense'
    result.dexBonus = modifiers.dex
    result.wisBonus = modifiers.wis
  } else {
    result.dexBonus = modifiers.dex
  }

  if (legalShield) {
    result.shieldBonus = ctx.rules.constants.shieldAcBonus
  }

  result.total =
    result.base + result.dexBonus + result.conBonus + result.wisBonus + result.shieldBonus + result.itemBonus
  return result
}

/**
 * Carrying capacity and encumbrance.
 *
 * PHB "Equipment", "Carrying, Pushing, and Dragging":
 * "Each character can carry a weight up to 15 times their Strength score. While
 * pushing or dragging weight in excess of their carrying capacity, a character's
 * speed drops to half."
 *
 * The 2014 PHB defines exactly one state beyond the limit: encumbered, which halves
 * speed. The two-tier encumbrance (heavily encumbered, size-based maximum load) is a
 * later optional variant and is deliberately not implemented.
 */
export function carryingCapacity(character: Character, ctx: RulesContext): {
  capacity: number
  carried: number
  encumbered: boolean
  /** Multiplier applied to walking speed while encumbered. */
  speedMultiplier: number
  /** Per-item multiplier, for the "up to 15 times your Strength" rule. */
  perItemMultiplier: number
} {
  const str = itemAwareScores(character, ctx).str
  const capacity = str * CARRYING_CAPACITY_MULTIPLIER

  let carried = 0
  for (const entry of character.inventory) {
    carried += itemWeight(entry, ctx) ?? 0
  }

  const encumbered = carried > capacity

  return {
    capacity,
    carried,
    encumbered,
    speedMultiplier: encumbered ? 0.5 : 1,
    perItemMultiplier: CARRYING_CAPACITY_MULTIPLIER,
  }
}

/** PHB: carrying capacity is 15 x Strength. */
export const CARRYING_CAPACITY_MULTIPLIER = 15

/** Weight in pounds, or null for items the dataset does not weigh. */
export function itemWeight(entry: EquipmentEntry, ctx: RulesContext): number | null {
  const resolved = parseInventoryId(entry.id, ctx)
  if (!resolved) return null
  switch (resolved.kind) {
    case 'weapon':
    case 'armor':
      return resolved.entry.weight
    case 'gear':
    case 'tool':
      return resolved.entry.weight
    default:
      return null
  }
}

/**
 * Weapon proficiency check.
 *
 * PHB: proficiency with a weapon type covers every weapon of that kind, so simple
 * and martial are checked as sets rather than per weapon. Class-granted
 * proficiencies live on the class; racial ones come from traits and are folded in
 * by `racialProficiencies`.
 */
export function weaponProficiencyFor(
  character: Character,
  ctx: RulesContext,
  weaponIndex: string,
): boolean {
  const weapon = ctx.weapon.get(weaponIndex)
  if (!weapon) return false

  const offered = new Set<string>()
  for (const entry of character.classes) {
    if (entry.level <= 0) continue
    const klass = ctx.class.get(entry.classIndex)
    for (const proficiency of klass?.weaponProficiencies ?? []) offered.add(proficiency)
  }
  for (const proficiency of racialProficiencies(character, ctx)) offered.add(proficiency)

  const needed = weapon.category === 'Simple' ? 'simple-weapons' : 'martial-weapons'
  return offered.has(needed) || offered.has(weaponIndex)
}

/** Unarmored Movement: Rogue only, and only without medium or heavy armour or a shield. */
export function unarmoredMovementBonus(character: Character, ctx: RulesContext): number | null {
  const rogue = character.classes.find((c) => c.classIndex === 'rogue' && c.level > 0)
  if (!rogue) return null

  const scores = itemAwareScores(character, ctx)
  const dex = Math.floor((scores.dex - 10) / 2)
  const intelligence = Math.floor((scores.int - 10) / 2)

  const worn = equippedArmor(character, ctx)
    .map((x) => x.resolved!.entry as Armor)
    .filter((a) => a.category !== 'Shield' && !armorBlocker(a, character, ctx))
  const shield = equippedArmor(character, ctx)
    .map((x) => x.resolved!.entry as Armor)
    .some((a) => a.category === 'Shield' && !armorBlocker(a, character, ctx))

  if (worn.some((a) => a.category === 'Medium' || a.category === 'Heavy')) return null
  if (shield) return null

  return dex + intelligence
}

/**
 * Speed after racial overrides, encumbrance and the Monk's Unarmored Movement.
 *
 * Encumbrance halves speed rather than subtracting a flat amount, matching the
 * 2014 PHB.
 */
export function walkingSpeed(character: Character, ctx: RulesContext): number {
  const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
  let speed = subrace?.speedOverride ?? ctx.race.get(character.raceIndex)?.speed ?? 30

  const load = carryingCapacity(character, ctx)
  if (load.encumbered) speed = Math.floor(speed * load.speedMultiplier)

  return speed
}

/** Convenience for the sheet: proficiency bonus alongside the other core numbers. */
export function coreProficiency(character: Character, ctx: RulesContext): number {
  return proficiencyBonus(character, ctx)
}
