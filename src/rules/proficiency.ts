/**
 * Proficiency, saving throws, initiative and skill bonuses.
 *
 * PHB rules implemented:
 * - "Your proficiency bonus is +2 plus your level divided by 4, rounded down,
 *   minus 2." (+2 at levels 1-4, +3 at 5-8, ... +6 at 17-20)
 * - Saving throws: add your proficiency bonus if you are proficient.
 * - "Your Dexterity modifier determines your initiative modifier."
 * - Skill checks: add the relevant ability modifier plus proficiency if trained.
 * - Passive checks are 10 + modifiers; passive Perception is the same minus 10.
 */
import type { AbilityKey } from '../data/types'
import type { Character } from '../state/schema'
import { totalLevel } from '../state/schema'
import { abilityModifiers } from './abilities'
import type { RulesContext } from './context'

/**
 * PHB "Proficiency Bonus": +2 at levels 1-4, +3 at 5-8, through +6 at 17-20.
 *
 * Uses the character's *total* level, not the highest class level, because a
 * multiclass character's level is the sum of their class levels.
 */
export function proficiencyBonus(character: Character, ctx: RulesContext): number {
  const level = totalLevel(character)
  if (level < 1) return 2
  const fromDataset = ctx.rules.constants.proficiencyBonusByLevel[String(level)]
  return fromDataset ?? 2 + Math.floor((level - 1) / 4)
}

/** Classes the character actually has levels in, deduplicated. */
export function classIndexes(character: Character): string[] {
  return [...new Set(character.classes.filter((c) => c.level > 0).map((c) => c.classIndex))]
}

/**
 * SRD proficiency indexes that stand for a whole group rather than one item.
 *
 * "All armor" is how the SRD spells Fighter and Paladin's armour training, and
 * "all simple weapons" / "all martial weapons" do the same for weapon categories.
 * A group is expanded into the specific indexes so callers can compare against a
 * single armour category or weapon type.
 */
export const ARMOR_PROFICIENCY_GROUPS: Record<string, string[]> = {
  'all-armor': ['light-armor', 'medium-armor', 'heavy-armor'],
  'light-armor': ['light-armor'],
  'medium-armor': ['medium-armor'],
  'heavy-armor': ['heavy-armor'],
  shields: ['shields'],
}

/** Expands group indexes so membership tests never miss a covering proficiency. */
function expandArmor(indexes: Iterable<string>): Set<string> {
  const result = new Set<string>()
  for (const index of indexes) {
    for (const expanded of ARMOR_PROFICIENCY_GROUPS[index] ?? [index]) result.add(expanded)
  }
  return result
}

/**
 * Armour the character is proficient with, as specific SRD proficiency indexes.
 *
 * PHB "Light armor" covers every light armour, likewise medium and heavy, and
 * "All armor" (the Fighter and Paladin grant) covers all three at once. Group
 * indexes are expanded here so `armorBlocker` can compare against one category.
 * Racial armour proficiencies arrive through traits and are folded in by
 * `racialProficiencies`.
 */
export function armorProficiencies(character: Character, ctx: RulesContext): Set<string> {
  const raw = new Set<string>()

  for (const entry of character.classes) {
    if (entry.level <= 0) continue
    for (const proficiency of ctx.class.get(entry.classIndex)?.armorProficiencies ?? []) {
      raw.add(proficiency)
    }
  }

  for (const proficiency of racialProficiencies(character, ctx)) raw.add(proficiency)

  return expandArmor(raw)
}

/** Weapon proficiencies, group indexes such as `simple-weapons`. */
export function weaponProficiencies(character: Character, ctx: RulesContext): Set<string> {
  const result = new Set<string>()
  for (const entry of character.classes) {
    if (entry.level <= 0) continue
    for (const proficiency of ctx.class.get(entry.classIndex)?.weaponProficiencies ?? []) {
      result.add(proficiency)
    }
  }
  for (const proficiency of racialProficiencies(character, ctx)) result.add(proficiency)
  return result
}

/** PHB: a multiclass character's saving-throw proficiencies are the union. */
export function savingThrowProficiencies(character: Character, ctx: RulesContext): Set<AbilityKey> {
  const result = new Set<AbilityKey>()
  for (const entry of character.classes) {
    if (entry.level <= 0) continue
    const klass = ctx.class.get(entry.classIndex)
    for (const ability of klass?.savingThrows ?? []) result.add(ability)
  }
  return result
}

export function savingThrowBonus(
  ability: AbilityKey,
  character: Character,
  ctx: RulesContext,
): { total: number; modifier: number; proficient: boolean } {
  const modifiers = abilityModifiers(character, ctx)
  const proficient = savingThrowProficiencies(character, ctx).has(ability)
  const bonus = proficiencyBonus(character, ctx)
  return {
    modifier: modifiers[ability],
    proficient,
    total: modifiers[ability] + (proficient ? bonus : 0),
  }
}

export function initiativeBonus(character: Character, ctx: RulesContext): number {
  return abilityModifiers(character, ctx).dex
}

export function passiveScore(character: Character, ctx: RulesContext, ability: AbilityKey): number {
  return 10 + savingThrowBonus(ability, character, ctx).total
}

export function passivePerception(character: Character, ctx: RulesContext): number {
  return passiveScore(character, ctx, 'wis') + skillProficient(character, ctx, 'perception')
}

/**
 * Every skill a character is proficient in, from four sources:
 * class skill picks, background grants, and the background's "any other two".
 * Racial trait proficiencies are added by the caller via `racialProficiencies`
 * because they live on traits rather than on the race.
 */
export function skillProficiencies(character: Character, ctx: RulesContext): Set<string> {
  const result = new Set<string>()

  for (const entry of character.classes) {
    const klass = ctx.class.get(entry.classIndex)
    const allowed = new Set(
      (klass?.skillChoices ?? []).flatMap((group) => group.options),
    )
    for (const pick of entry.skillChoices) {
      // Only accept picks the class actually offers; the validator reports the rest.
      if (allowed.size && !allowed.has(pick)) continue
      result.add(normaliseSkillIndex(pick))
    }
  }

  const background = ctx.background.get(character.backgroundIndex)
  for (const skill of background?.skillProficiencies ?? []) {
    result.add(normaliseSkillIndex(skill))
  }

  // PHB: the background also grants "any other two skills of your choice".
  for (const skill of character.skillProficiencies) {
    result.add(normaliseSkillIndex(skill))
  }

  return result
}

/** `skill-arcana` (proficiency index) and `arcana` (skill index) mean the same thing. */
export function normaliseSkillIndex(index: string): string {
  return index.startsWith('skill-') ? index.slice(6) : index
}

/** Tool and instrument proficiencies from class picks, background and traits. */
export function toolProficiencies(character: Character, ctx: RulesContext): Set<string> {
  const result = new Set<string>(character.toolProficiencies)

  for (const entry of character.classes) {
    const klass = ctx.class.get(entry.classIndex)
    const offered = new Set(
      [...(klass?.instrumentChoices ?? []), ...(klass?.toolChoices ?? [])].flatMap(
        (group) => group.options,
      ),
    )
    for (const pick of [...entry.instrumentChoices, ...entry.toolChoices]) {
      if (offered.size && !offered.has(pick)) continue
      result.add(pick)
    }
    for (const proficiency of klass?.grantedToolProficiencies ?? []) {
      result.add(proficiency)
    }
  }

  const background = ctx.background.get(character.backgroundIndex)
  for (const tool of background?.toolProficiencies ?? []) result.add(tool)

  return result
}

/** Racial proficiencies granted by traits the character has taken. */
export function racialProficiencies(character: Character, ctx: RulesContext): Set<string> {
  const result = new Set<string>()

  const traitIndexes = [
    ...(ctx.race.get(character.raceIndex)?.traits ?? []),
    ...(character.subraceIndex
      ? (ctx.subrace.get(character.subraceIndex)?.traits ?? [])
      : []),
  ]

  for (const index of traitIndexes) {
    const trait = ctx.trait.get(index)
    for (const proficiency of trait?.proficiencies ?? []) result.add(proficiency)

    // Traits that grant a *choice* need an explicit pick.
    if (!character.selectedTraits.includes(index)) continue
    for (const group of trait?.proficiencyChoices ?? []) {
      const limit = group.choose ?? 1
      const picked = character.selectedTraits
        .filter((t) => t.startsWith(`${index}:`))
        .map((t) => t.slice(index.length + 1))
        .slice(0, limit)
      for (const option of picked) {
        if (group.options.includes(option)) result.add(option)
      }
    }
  }

  const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
  for (const proficiency of subrace?.proficiencies?.armor ?? []) result.add(proficiency)
  for (const proficiency of subrace?.proficiencies?.weapons ?? []) result.add(proficiency)

  return result
}

export interface SkillBonus {
  skill: string
  name: string
  ability: AbilityKey
  abilityModifier: number
  proficient: boolean
  proficiencyBonus: number
  total: number
}

/** Every skill with its bonus, for the skills block on the sheet. */
export function skillBonuses(character: Character, ctx: RulesContext): SkillBonus[] {
  const modifiers = abilityModifiers(character, ctx)
  const profBonus = proficiencyBonus(character, ctx)
  const proficient = skillProficiencies(character, ctx)

  return ctx.rules.skills.map((skill) => ({
    skill: skill.index,
    name: skill.name,
    ability: skill.ability,
    abilityModifier: modifiers[skill.ability],
    proficient: proficient.has(skill.index),
    proficiencyBonus: proficient.has(skill.index) ? profBonus : 0,
    total: modifiers[skill.ability] + (proficient.has(skill.index) ? profBonus : 0),
  }))
}

export function skillProficient(
  character: Character,
  ctx: RulesContext,
  skill: string,
): number {
  const entry = ctx.skill.get(normaliseSkillIndex(skill))
  if (!entry) return 0
  return skillProficiencies(character, ctx).has(entry.index) ? proficiencyBonus(character, ctx) : 0
}

/** Languages: race, subrace, background and trait choices. */
export function languages(character: Character, ctx: RulesContext): string[] {
  const result = new Set<string>()

  if (character.variantHuman) {
    // Variant Human replaces the Human language line but keeps its common tongues.
    for (const index of ctx.race.get('human')?.languages ?? []) result.add(index)
  } else {
    const race = ctx.race.get(character.raceIndex)
    for (const index of race?.languages ?? []) result.add(index)

    const options = race?.languageOptions
    if (options) {
      const picks = character.racialLanguages.slice(0, options.choose)
      for (const index of picks) {
        if (options.options.includes(index)) result.add(index)
      }
    }

    const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
    for (const index of subrace?.languages ?? []) result.add(index)
  }

  for (const index of character.backgroundLanguages) result.add(index)

  return [...result]
}
