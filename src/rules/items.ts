/**
 * Magic items: attunement slots, class prerequisites, and the stat changes the
 * curated effects table records.
 *
 * PHB rules implemented:
 * - "You can attune to no more than three magic items at a time."
 * - "You can't attune to an item if you can't meet any requirement", including
 *   class: an item that requires attunement by a cleric can only be attuned by one.
 * - An item that sets an ability score sets it outright, and the 20 score cap does
 *   not apply: a Belt of Giant Strength (Storm) sets Strength to 29.
 */
import type { AbilityKey, MagicItem } from '../data/types'
import type { Character, EquipmentEntry } from '../state/schema'
import { abilityModifier, abilityTotals } from './abilities'
import { parseInventoryId, type RulesContext } from './context'
import { classIndexes } from './proficiency'

export interface ItemAggregate {
  /** Ability index -> the score an item sets while active. */
  setAbilities: Partial<Record<AbilityKey, number>>
  acBonus: number
  allSavesBonus: number
  speedMultiplier: number
  /** null when no item changes speed; otherwise the set value. */
  speedSet: number | null
  resistances: string[]
  notes: { index: string; name: string; note: string }[]
}

export const emptyAggregate = (): ItemAggregate => ({
  setAbilities: {},
  acBonus: 0,
  allSavesBonus: 0,
  speedMultiplier: 1,
  speedSet: null,
  resistances: [],
  notes: [],
})

/** Attuned magic items, in inventory order. */
export function attunedItems(character: Character, ctx: RulesContext): MagicItem[] {
  const result: MagicItem[] = []
  for (const entry of character.inventory) {
    if (!entry.attuned) continue
    const resolved = parseInventoryId(entry.id, ctx)
    if (resolved?.kind === 'magic-item') result.push(resolved.entry)
  }
  return result
}

/** Whether an inventory entry needs attunement at all. */
export function attunementRequired(entry: EquipmentEntry, ctx: RulesContext): boolean {
  const resolved = parseInventoryId(entry.id, ctx)
  return resolved?.kind === 'magic-item' ? resolved.entry.attunement.required : false
}

/**
 * Items whose effects currently apply: equipped, and attuned when the item needs
 * attunement. Attunement is an extra gate on top of holding the item, not an
 * alternative to it.
 */
export function activeItems(character: Character, ctx: RulesContext): MagicItem[] {
  const result: MagicItem[] = []
  for (const entry of character.inventory) {
    if (!entry.equipped) continue
    const resolved = parseInventoryId(entry.id, ctx)
    if (resolved?.kind !== 'magic-item') continue
    if (resolved.entry.attunement.required && !entry.attuned) continue
    result.push(resolved.entry)
  }
  return result
}

/**
 * Attunement slot usage.
 *
 * Only items that *require* attunement consume a slot. An item that does not
 * require it cannot be attuned at all, and non-magic entries have no attunement
 * state, so both are excluded.
 */
export function attunementSlots(character: Character, ctx: RulesContext): {
  used: number
  max: number
} {
  const used = character.inventory.filter((entry) => {
    if (!entry.attuned) return false
    const resolved = parseInventoryId(entry.id, ctx)
    return resolved?.kind === 'magic-item' && resolved.entry.attunement.required
  }).length

  return { used, max: ctx.rules.constants.maxAttunementSlots }
}

export interface AttunementBlocker {
  itemIndex: string
  itemName: string
  reason: string
}

/**
 * Why an attuned item is illegal, and whether the slots are over-committed.
 *
 * `slotFull` is separate from `reasons` because the remedies differ: free a slot
 * versus change class or ancestry.
 */
export function attunementProblems(
  character: Character,
  ctx: RulesContext,
): { slotFull: boolean; overLimit: number; reasons: AttunementBlocker[] } {
  const { used, max } = attunementSlots(character, ctx)
  const classes = new Set(classIndexes(character))
  const raceIndex = character.variantHuman ? 'human' : character.raceIndex
  const reasons: AttunementBlocker[] = []

  for (const entry of character.inventory) {
    if (!entry.attuned) continue
    const resolved = parseInventoryId(entry.id, ctx)
    if (resolved?.kind !== 'magic-item') continue
    const item = resolved.entry

    if (!item.attunement.required) {
      reasons.push({
        itemIndex: item.index,
        itemName: item.name,
        reason: 'This item does not require attunement',
      })
      continue
    }

    const required = item.attunement.classes
    if (required && required.length) {
      if (!required.some((c) => classes.has(c))) {
        reasons.push({
          itemIndex: item.index,
          itemName: item.name,
          reason: `Requires attunement by ${nameList(required, ctx)}`,
        })
      }
    } else if (item.attunement.spellcaster) {
      const isCaster = [...classes].some((c) => Boolean(ctx.class.get(c)?.spellcasting))
      if (!isCaster) {
        reasons.push({
          itemIndex: item.index,
          itemName: item.name,
          reason: 'Requires attunement by a spellcaster',
        })
      }
    }

    if (item.attunement.races && item.attunement.races.length) {
      if (!item.attunement.races.includes(raceIndex)) {
        reasons.push({
          itemIndex: item.index,
          itemName: item.name,
          reason: `Requires attunement by ${nameList(item.attunement.races, ctx)}`,
        })
      }
    }
  }

  return { slotFull: used > max, overLimit: Math.max(0, used - max), reasons }
}

const nameList = (indexes: string[], ctx: RulesContext): string =>
  indexes
    .map((i) => ctx.class.get(i)?.name ?? ctx.race.get(i)?.name ?? i)
    .join(', ')

/**
 * Aggregated stat changes from every active magic item.
 *
 * `setAbilities` is cap-aware: it comes from `effectiveItemScores` so an item whose
 * "no effect if already X or higher" condition is met contributes nothing.
 */
export function itemBonuses(character: Character, ctx: RulesContext): ItemAggregate {
  const aggregate = emptyAggregate()

  for (const item of activeItems(character, ctx)) {
    const effects = item.effects
    if (!effects) continue

    aggregate.acBonus += effects.acBonus ?? 0
    aggregate.allSavesBonus += effects.allSavesBonus ?? 0
    if (effects.speedMultiplier) aggregate.speedMultiplier *= effects.speedMultiplier
    if (effects.speedSet != null) aggregate.speedSet = effects.speedSet
    aggregate.resistances.push(...(effects.resistances ?? []))
    if (effects.note) {
      aggregate.notes.push({ index: item.index, name: item.name, note: effects.note })
    }
  }

  aggregate.setAbilities = effectiveItemScores(character, ctx)

  return aggregate
}

/**
 * Scores an item actually sets, after honouring "no effect if your score is already
 * X or higher".
 *
 * The comparison is against the *wearer's* score, not the value the item sets. An
 * Amulet of Health sets Constitution to 19 but has "no effect if your Constitution
 * score is already 19 or higher", so it raises a 12 to 19 and does nothing for a 20.
 */
export function effectiveItemScores(
  character: Character,
  ctx: RulesContext,
): Partial<Record<AbilityKey, number>> {
  const own = abilityTotals(character, ctx)
  const effective: Partial<Record<AbilityKey, number>> = {}

  for (const item of activeItems(character, ctx)) {
    const effects = item.effects
    if (!effects?.abilities) continue

    for (const [ability, score] of Object.entries(effects.abilities)) {
      const key = ability as AbilityKey
      if (!(key in own)) continue

      const cap = effects.abilityCap?.[key]
      // Already at or above the item's threshold, so it contributes nothing.
      if (cap != null && own[key] >= cap) continue

      const current = effective[key]
      // PHB: two effects that set the same score do not stack.
      if (current == null || score > current) effective[key] = score
    }
  }

  return effective
}

/** Modifier contributed by the highest item-set score for an ability. */
export function itemModifier(
  character: Character,
  ctx: RulesContext,
  ability: AbilityKey,
): number {
  const score = effectiveItemScores(character, ctx)[ability]
  return score == null ? 0 : abilityModifier(score)
}

/** Flat bonus to every saving throw from active items. */
export function savingThrowItemBonus(character: Character, ctx: RulesContext): number {
  return itemBonuses(character, ctx).allSavesBonus
}

/** Magic items in the inventory that this character cannot legally attune to. */
export function unavailableAttunementItems(
  character: Character,
  ctx: RulesContext,
): { item: MagicItem; reason: string }[] {
  const classes = new Set(classIndexes(character))
  const raceIndex = character.variantHuman ? 'human' : character.raceIndex
  const result: { item: MagicItem; reason: string }[] = []

  for (const entry of character.inventory) {
    if (entry.attuned) continue
    const resolved = parseInventoryId(entry.id, ctx)
    if (resolved?.kind !== 'magic-item') continue
    const item = resolved.entry
    if (!item.attunement.required) continue

    const required = item.attunement.classes
    if (required && required.length && !required.some((c) => classes.has(c))) {
      result.push({ item, reason: `Requires attunement by ${nameList(required, ctx)}` })
      continue
    }
    if (!required?.length && item.attunement.spellcaster) {
      const isCaster = [...classes].some((c) => Boolean(ctx.class.get(c)?.spellcasting))
      if (!isCaster) result.push({ item, reason: 'Requires attunement by a spellcaster' })
      continue
    }
    if (item.attunement.races && !item.attunement.races.includes(raceIndex)) {
      result.push({ item, reason: `Requires attunement by ${nameList(item.attunement.races, ctx)}` })
    }
  }

  return result
}
