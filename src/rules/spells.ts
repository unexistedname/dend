/**
 * Spell slots, spell lists, cantrips, and the Paladin/Ranger alignment rule.
 *
 * PHB rules implemented:
 * - "Your spellcasting ability is the ability to use for your spell save DC and
 *   your spell attack bonus."
 * - Cantrips are at level 0 and do not use slots; a class learns a set number.
 * - The class level table fixes how many cantrips and spells you know and how many
 *   slots of each level you have.
 * - Prepared classes (Cleric, Druid, Paladin, Ranger) choose any spells from their
 *   list each morning; the others know a fixed number from their list.
 * - "Your spells must be of your alignment" for Paladin and Ranger, and "you must
 *   be of a good alignment and your spells must be of your alignment" for the Paladin
 *   oath traits. The curated table carries the spell-level restriction; the class
 *   entry carries the alignment requirement.
 * - Subclasses add spells to the class list, from their own level onward.
 * - "You can't cast a spell unless you have a slot of that level or higher."
 */
import type { Spell, SpellcastingProgress } from '../data/types'
import type { Character, ClassEntry } from '../state/schema'
import { cantripPool, classSpellList, levelRow, type RulesContext } from './context'
import { spellcastingNumbers } from './health'

export const GOOD_ALIGNMENTS = ['lawful-good', 'neutral-good', 'chaotic-good']
export const EVIL_ALIGNMENTS = ['lawful-evil', 'neutral-evil', 'chaotic-evil']
export const LAWFUL_ALIGNMENTS = ['lawful-good', 'lawful-neutral', 'lawful-evil']
export const NEUTRAL_ALIGNMENTS = ['neutral-good', 'true-neutral', 'neutral-evil']
export const CHAOTIC_ALIGNMENTS = ['chaotic-good', 'chaotic-neutral', 'chaotic-evil']

/** Alignment groups the PHB uses when a feature restricts alignment. */
export const ALIGNMENT_GROUPS: Record<string, string[]> = {
  good: GOOD_ALIGNMENTS,
  evil: EVIL_ALIGNMENTS,
  lawful: LAWFUL_ALIGNMENTS,
  neutral: NEUTRAL_ALIGNMENTS,
  chaotic: CHAOTIC_ALIGNMENTS,
  'any alignment': [
    'lawful-good',
    'neutral-good',
    'chaotic-good',
    'lawful-neutral',
    'true-neutral',
    'chaotic-neutral',
    'lawful-evil',
    'neutral-evil',
    'chaotic-evil',
  ],
}

export function alignmentSatisfies(alignment: string, allowed: string[] | null): boolean {
  if (!allowed || allowed.length === 0) return true
  return allowed.includes(alignment)
}

/**
 * Combined spellcasting progress across every class with levels.
 *
 * A multiclass character adds each caster's slots; cantrips and known spells are
 * tracked per class, so this returns a per-class breakdown plus the merged slot
 * pool, which is what the spell slots block displays.
 */
export function spellcastingSummary(character: Character, ctx: RulesContext) {
  const perClass = character.classes
    .filter((entry) => entry.level > 0 && ctx.class.get(entry.classIndex)?.spellcasting)
    .map((entry) => {
      const klass = ctx.class.get(entry.classIndex)!
      const row = levelRow(klass, entry.level)
      const spellcasting = row?.spellcasting ?? null
      return {
        entry,
        klass,
        progress: spellcasting,
        ability: klass.spellcasting!.ability,
        startsAt: klass.spellcasting!.startsAt,
        preparesSpells: klass.preparesSpells,
      }
    })

  const slots: Record<number, number> = {}
  for (const row of perClass) {
    if (!row.progress) continue
    for (const [level, count] of Object.entries(row.progress.slots)) {
      slots[Number(level)] = (slots[Number(level)] ?? 0) + count
    }
  }

  // Cantrips and fixed known spells accumulate across every caster, each capped by
  // its own class table at its own level.
  const cantripsKnown = perClass.reduce((sum, row) => sum + (row.progress?.cantripsKnown ?? 0), 0)
  const fixedSpellsKnown = perClass.reduce((sum, row) => sum + (row.progress?.spellsKnown ?? 0), 0)

  return {
    perClass,
    slots,
    cantripsKnown,
    fixedSpellsKnown,
    // Prepared classes choose freely from their list, so no numeric cap is applied.
    preparedSpells: character.spells.prepared.length,
    spentSlots: character.spells.slots.spent,
    spellSaveDc: spellcastingNumbers(character, ctx)?.saveDc ?? null,
  }
}

/**
 * Every spell index this character may cast, given class, subclass and race.
 *
 * Subclass grants only apply from `minClassLevel`; a character below that level does
 * not have the spells yet.
 */
export function availableSpells(character: Character, ctx: RulesContext): string[] {
  const result = new Set<string>()

  for (const entry of character.classes) {
    if (entry.level <= 0) continue
    for (const index of classSpellList(ctx, entry.classIndex, entry.subclassIndex)) {
      result.add(index)
    }
    for (const grant of ctx.spells.subclassSpellGrants[entry.subclassIndex ?? ''] ?? []) {
      if (grant.minClassLevel != null && entry.level < grant.minClassLevel) continue
      for (const index of grant.spells) result.add(index)
    }
  }

  const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
  for (const cantrip of subrace?.cantrips ?? []) result.add(cantrip)
  for (const grant of subrace?.spells ?? []) result.add(grant.index)

  return [...result]
}

/** Cantrips this character may choose from. */
export function availableCantrips(character: Character, ctx: RulesContext): string[] {
  const pools = new Set<string>()

  for (const entry of character.classes) {
    if (entry.level <= 0) continue
    const klass = ctx.class.get(entry.classIndex)
    if (!klass?.spellcasting || entry.level < klass.spellcasting.startsAt) continue
    for (const index of cantripPool(ctx, entry.classIndex, entry.subclassIndex, [])) {
      pools.add(index)
    }
  }

  const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
  for (const cantrip of subrace?.cantrips ?? []) pools.add(cantrip)

  return [...pools].filter((i) => ctx.spell.get(i)?.level === 0)
}

/**
 * Cantrips granted for free by the ancestry. PHB: these are "known" without
 * spending a cantrip slot, so they sit outside `cantripsKnown`.
 */
export function racialCantrips(character: Character, ctx: RulesContext): string[] {
  const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
  return subrace?.cantrips ?? []
}

/** Spells granted outright by the ancestry, outside the class spell list. */
export function racialSpells(character: Character, ctx: RulesContext): string[] {
  const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
  return (subrace?.spells ?? []).map((grant) => grant.index)
}

/**
 * "Your spells must be of your alignment." Returns the spell indexes on this
 * character's list that its alignment forbids.
 */
export function alignmentBlockedSpells(
  character: Character,
  ctx: RulesContext,
): { spellIndex: string; spellName: string; allowed: string[] }[] {
  const blocked: { spellIndex: string; spellName: string; allowed: string[] }[] = []

  for (const entry of character.classes) {
    if (entry.level <= 0) continue
    const table = ctx.spells.spellAlignment[entry.classIndex]
    if (!table) continue

    for (const [spellIndex, allowed] of Object.entries(table)) {
      if (!allowed.includes(character.alignmentIndex)) continue
      blocked.push({
        spellIndex,
        spellName: ctx.spell.get(spellIndex)?.name ?? spellIndex,
        allowed,
      })
    }
  }

  return blocked
}

/** Whether a Paladin may take an oath at all. PHB: "a paladin must be of a good alignment". */
export function paladinOathRequirement(character: Character): {
  required: boolean
  satisfied: boolean
  rulebookText: string
} {
  const isPaladin = character.classes.some((c) => c.classIndex === 'paladin')
  return {
    required: isPaladin,
    satisfied: GOOD_ALIGNMENTS.includes(character.alignmentIndex),
    rulebookText:
      'A paladin must be of a good alignment (lawful, neutral, or chaotic good).',
  }
}

/** Subclass minimum levels, so the builder can gate the choice. */
export function subclassUnlockLevel(subclassIndex: string, ctx: RulesContext): number | null {
  return ctx.subclass.get(subclassIndex)?.level ?? null
}

export function isSubclassUnlocked(
  entry: ClassEntry,
  subclassIndex: string,
  ctx: RulesContext,
): boolean {
  const required = subclassUnlockLevel(subclassIndex, ctx)
  return required == null || entry.level >= required
}

/** Spells of a given level this character may cast, ready for a picker. */
export function spellsAtLevel(
  character: Character,
  ctx: RulesContext,
  level: number,
): Spell[] {
  return availableSpells(character, ctx)
    .map((index) => ctx.spell.get(index))
    .filter((s): s is Spell => Boolean(s))
    .filter((s) => s.level === level)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Slots remaining at each level after the recorded spends. */
export function slotsRemaining(character: Character, ctx: RulesContext): Record<number, number> {
  const { slots, spentSlots } = spellcastingSummary(character, ctx)
  const result: Record<number, number> = {}
  for (let level = 1; level <= 9; level += 1) {
    const total = slots[level] ?? 0
    const used = spentSlots[String(level)] ?? 0
    result[level] = Math.max(0, total - used)
  }
  return result
}

/** Whether a spell of a level can be cast with the slots the character has left. */
export function canCastLevel(character: Character, ctx: RulesContext, spellLevel: number): boolean {
  if (spellLevel === 0) return true
  const remaining = slotsRemaining(character, ctx)
  // Cantrips aside, you need a slot of that level or higher (PHB "using a slot").
  for (let level = spellLevel; level <= 9; level += 1) {
    if ((remaining[level] ?? 0) > 0) return true
  }
  return false
}

/**
 * Progress for a class at the character's level, or null before it can cast.
 *
 * Subclasses that grant extra spell slots (Eldritch Knight, Arcane Trickster) are
 * flagged in the dataset, but the SRD publishes no per-subclass slot numbers for the
 * 34 subclasses it omits, so no invented numbers are added here.
 */
export function progressFor(
  entry: ClassEntry,
  ctx: RulesContext,
): SpellcastingProgress | null {
  const klass = ctx.class.get(entry.classIndex)
  if (!klass?.spellcasting || entry.level < klass.spellcasting.startsAt) return null
  return levelRow(klass, entry.level)?.spellcasting ?? null
}
