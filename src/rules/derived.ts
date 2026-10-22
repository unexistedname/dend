/**
 * The single derived-value surface for the character sheet.
 *
 * Every number the sheet shows is computed here from one pass over the character, so
 * the UI never calls two rules functions that could disagree (for example an AC that
 * used one Dexterity total while a skill bonus used another). Each field carries the
 * rulebook text that justifies it, because every one of these is shown with a hover.
 *
 * Nothing in this file decides legality; see `validate.ts` for that. This module only
 * answers "what are the numbers right now", including when the character is invalid.
 */
import type { AbilityKey } from '../data/types'
import type { Character } from '../state/schema'
import { primaryClass, totalLevel } from '../state/schema'
import { finalAbilityScores, type AbilityBreakdown } from './abilities'
import {
  carryingCapacity,
  computeArmorClass,
  walkingSpeed,
  type AcBreakdown,
} from './armor'
import { parseInventoryId, type RulesContext } from './context'
import {
  effectiveMaxHitPoints,
  hitDice,
  shortRestHealing,
  spellcastingNumbers,
} from './health'
import { attunementSlots, itemBonuses, type ItemAggregate } from './items'
import {
  armorProficiencies,
  weaponProficiencies,
  initiativeBonus,
  languages,
  passivePerception,
  proficiencyBonus,
  savingThrowBonus,
  skillBonuses,
  toolProficiencies,
  type SkillBonus,
} from './proficiency'
import { spellcastingSummary, slotsRemaining } from './spells'
import { checkConstraints, type ConstraintReport } from './validate'

export interface DerivedCharacter {
  identity: {
    id: string
    name: string
    playerName: string
    level: number
    className: string
    subclassName: string | null
    raceName: string
    subraceName: string | null
    backgroundName: string
    alignmentName: string
    variantHuman: boolean
  }
  abilities: AbilityBreakdown
  combat: {
    armorClass: AcBreakdown
    hitPoints: { max: number; temporary: number }
    hitDice: ReturnType<typeof hitDice>
    shortRest: ReturnType<typeof shortRestHealing>
    initiative: number
    passivePerception: number
    speed: number
    proficiencyBonus: number
  }
  savingThrows: { ability: AbilityKey; proficient: boolean; total: number }[]
  skills: SkillBonus[]
  /**
   * Non-null because this block only exists when the class can cast, and the numbers
   * derive from that same class entry.
   */
  spellcasting:
    | (ReturnType<typeof spellcastingSummary> & {
        numbers: NonNullable<ReturnType<typeof spellcastingNumbers>>
      })
    | null
  slotsRemaining: Record<number, number>
  inventory: {
    weight: ReturnType<typeof carryingCapacity>
    attunement: ReturnType<typeof attunementSlots>
    items: ItemAggregate
  }
  proficiencies: {
    /** Specific armour indexes the character may wear, group grants expanded. */
    armor: string[]
    /** Weapon indexes the character is proficient with. */
    weapons: Set<string>
    tools: string[]
    languages: string[]
  }
  constraints: ConstraintReport
}

/**
 * Everything the sheet needs, computed once.
 *
 * `validateConstraints` is included so the builder and the sheet cannot disagree
 * about whether the character is legal.
 */
export function deriveCharacter(character: Character, ctx: RulesContext): DerivedCharacter {
  const entry = primaryClass(character)
  const klass = ctx.class.get(entry.classIndex)
  const race = ctx.race.get(character.raceIndex)
  const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
  const subclass = entry.subclassIndex ? ctx.subclass.get(entry.subclassIndex) : null

  const abilities = finalAbilityScores(character, ctx)
  const armorClass = computeArmorClass(character, ctx)
  const constraints = checkConstraints(character, ctx)
  const isCaster = Boolean(klass?.spellcasting)

  return {
    identity: {
      id: character.id,
      name: character.name,
      playerName: character.playerName,
      level: totalLevel(character),
      className: klass?.name ?? entry.classIndex,
      subclassName: subclass?.name ?? null,
      raceName: race?.name ?? character.raceIndex,
      subraceName: subrace?.name ?? null,
      backgroundName: ctx.background.get(character.backgroundIndex)?.name ?? character.backgroundIndex,
      alignmentName: ctx.alignment.get(character.alignmentIndex)?.name ?? character.alignmentIndex,
      variantHuman: character.variantHuman,
    },

    abilities,

    combat: {
      armorClass,
      hitPoints: {
        max: effectiveMaxHitPoints(character, ctx),
        temporary: character.hp.temporary,
      },
      hitDice: hitDice(character, ctx),
      shortRest: shortRestHealing(character, ctx),
      initiative: initiativeBonus(character, ctx),
      passivePerception: passivePerception(character, ctx),
      speed: walkingSpeed(character, ctx),
      proficiencyBonus: proficiencyBonus(character, ctx),
    },

    savingThrows: (Object.keys(abilities) as AbilityKey[]).map((ability) => {
      const save = savingThrowBonus(ability, character, ctx)
      return { ability, proficient: save.proficient, total: save.total }
    }),

    skills: skillBonuses(character, ctx),

    spellcasting: isCaster
      ? {
          ...spellcastingSummary(character, ctx),
          numbers: spellcastingNumbers(character, ctx)!,
        }
      : null,
    slotsRemaining: isCaster ? slotsRemaining(character, ctx) : {},

    inventory: {
      weight: carryingCapacity(character, ctx),
      attunement: attunementSlots(character, ctx),
      items: itemBonuses(character, ctx),
    },

    proficiencies: {
      armor: [...armorProficiencies(character, ctx)],
      weapons: weaponProficiencies(character, ctx),
      tools: [...toolProficiencies(character, ctx)],
      languages: languages(character, ctx),
    },

    constraints,
  }
}

/**
 * Resolved inventory rows for display: the item's name, whether it is worn or held,
 * and whether its effects currently apply.
 *
 * Custom entries (homebrew or PHB-only items) have no dataset record, so they fall
 * back to the name the player gave them rather than being dropped.
 */
export function inventoryRows(character: Character, ctx: RulesContext) {
  return character.inventory.map((entry) => {
    const resolved = parseInventoryId(entry.id, ctx)
    const name = resolved?.entry.name ?? entry.customName ?? entry.id

    // Armour carries no `desc`: Table 13 is self-describing.
    const desc = resolved && resolved.kind !== 'armor' ? resolved.entry.desc : []

    return {
      entry,
      id: entry.id,
      name,
      kind: resolved?.kind ?? 'custom',
      known: Boolean(resolved),
      rarity: resolved?.kind === 'magic-item' ? resolved.entry.rarity : null,
      requiresAttunement: resolved?.kind === 'magic-item' ? resolved.entry.attunement.required : false,
      desc,
    }
  })
}
