/**
 * Hit points, hit dice and the class level table.
 *
 * PHB rules implemented:
 * - "At 1st level, a character has a maximum hit points equal to their hit dice
 *   value + their Constitution modifier."
 * - "Their hit points increase by their hit die average + their Constitution
 *   modifier."
 * - At 1st level a character has one hit die; every level after that adds one.
 * - Hill Dwarf and Mountain Dwarf each gain +1 per level from Dwarven Toughness.
 * - Multiclassing adds hit dice but not the saving-throw or skill proficiencies of
 *   the first class; see `proficiency.ts`.
 */
import type { AbilityKey } from '../data/types'
import type { Character } from '../state/schema'
import { finalAbilityScores } from './abilities'
import type { RulesContext } from './context'
import { proficiencyBonus } from './proficiency'

/** PHB Table 6-1 "Average Hit Die Value": d4=2, d6=3, d8=4, d10=5, d12=6. */
export const AVERAGE_HIT_DIE: Record<number, number> = {
  4: 2,
  6: 3,
  8: 4,
  10: 5,
  12: 6,
}

export interface HitPointSource {
  label: string
  amount: number
}

/**
 * Constitution modifier used for hit points.
 *
 * Uses the final score, including ASIs, because a Constitution bonus gained at a
 * later level applies to the levels gained after it. Background and subrace
 * bonuses arrive before 1st level and so apply throughout.
 */
export function conModifierFor(character: Character, ctx: RulesContext): number {
  const scores = finalAbilityScores(character, ctx)
  return scores.con.modifier
}

/**
 * Whether the ancestry grants the extra hit point per level.
 *
 * Both Hill Dwarf (via Dwarven Toughness) and Mountain Dwarf do. The SRD publishes
 * the trait text for Hill Dwarf; the curated Mountain Dwarf entry records it as a
 * `hitPointsBonus` sentence, so both are detected by name rather than by index.
 */
export function extraHitPointPerLevel(character: Character, ctx: RulesContext): boolean {
  if (!['hill-dwarf', 'mountain-dwarf'].includes(character.subraceIndex ?? '')) return false
  if (character.subraceIndex === 'mountain-dwarf') return true
  const subrace = ctx.subrace.get(character.subraceIndex!)
  return (subrace?.traits ?? []).includes('dwarven-toughness')
}

/** Per-class maximum hit points, level 1 plus the average for each later level. */
export function maxHitPoints(character: Character, ctx: RulesContext): {
  total: number
  sources: HitPointSource[]
} {
  const con = conModifierFor(character, ctx)
  const extra = extraHitPointPerLevel(character, ctx)
  const sources: HitPointSource[] = []

  let total = 0
  for (const entry of character.classes) {
    const klass = ctx.class.get(entry.classIndex)
    if (!klass || entry.level <= 0) continue
    const average = AVERAGE_HIT_DIE[klass.hitDie] ?? Math.floor(klass.hitDie / 2) + 1

    const first = entry.hitDieOverride ?? klass.hitDie
    const later = entry.hitDieOverride ?? average

    // 1st level uses the full die; every level after that uses the average.
    let amount =
      con + first + Array.from({ length: entry.level - 1 }, () => later + con).reduce((a, b) => a + b, 0)

    // Dwarven Toughness: +1 per character level, including 1st.
    if (extra) amount += entry.level

    total += amount
    sources.push({ label: `${klass.name} ${entry.level}`, amount })
  }

  return { total, sources }
}

/** A manual override wins over the computed maximum. */
export function effectiveMaxHitPoints(character: Character, ctx: RulesContext): number {
  return character.hp.max ?? maxHitPoints(character, ctx).total
}

/** Total hit dice across all classes, for rest and death-save bookkeeping. */
export function hitDice(character: Character, ctx: RulesContext): {
  total: number
  byClass: { classIndex: string; name: string; die: number; count: number }[]
} {
  const byClass = character.classes
    .filter((entry) => entry.level > 0)
    .map((entry) => {
      const klass = ctx.class.get(entry.classIndex)
      return {
        classIndex: entry.classIndex,
        name: klass?.name ?? entry.classIndex,
        die: klass?.hitDie ?? 8,
        count: entry.level,
      }
    })
  return { total: byClass.reduce((sum, c) => sum + c.count, 0), byClass }
}

/** Short rest hit point recovery from hit dice, capped at half the maximum. */
export function shortRestHealing(character: Character, ctx: RulesContext) {
  const max = effectiveMaxHitPoints(character, ctx)
  const dice = hitDice(character, ctx)
  const first = dice.byClass[0]
  const average = first ? (AVERAGE_HIT_DIE[first.die] ?? Math.floor(first.die / 2) + 1) : 5
  const perDie = average + conModifierFor(character, ctx)
  return { dice: dice.total, perDie, capped: Math.floor(max / 2) }
}

/**
 * Spell save DC and spell attack bonus.
 *
 * PHB: "Your spellcasting ability is the ability to use for your spell save DC and
 * your spell attack bonus", and "your proficiency bonus" is the character's total
 * level bonus. Both use the *final* ability score, so racial, background and ASI
 * bonuses all count.
 */
export function spellcastingNumbers(character: Character, ctx: RulesContext): {
  ability: AbilityKey
  modifier: number
  saveDc: number
  attackBonus: number
} | null {
  const entry = character.classes.find((c) => ctx.class.get(c.classIndex)?.spellcasting)
  const spellcasting = ctx.class.get(entry?.classIndex ?? '')?.spellcasting
  if (!spellcasting) return null

  const modifier = finalAbilityScores(character, ctx)[spellcasting.ability].modifier
  const prof = proficiencyBonus(character, ctx)

  return {
    ability: spellcasting.ability,
    modifier,
    saveDc: 8 + prof + modifier,
    attackBonus: prof + modifier,
  }
}
