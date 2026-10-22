/**
 * Ability scores: how they are assigned, what racial bonuses apply, and the
 * modifiers everything else derives from.
 *
 * Rules implemented, all from the PHB:
 * - "Your ability score is 10 + your score modifier."
 * - Point Buy: 27 points, scores 8-15 before racial bonuses.
 * - Racial ability bonuses, including the Elf/Half-Elf/Half-Orc choice.
 * - Variant Human's +1 to two different scores of choice.
 * - Ability score bonuses may not exceed +5 (score 20).
 */
import type { AbilityKey, AbilityScores } from '../data/types'
import { ABILITY_KEYS } from '../data/types'
import type { Character } from '../state/schema'
import type { RulesContext } from './context'

export const abilityModifier = (score: number): number => Math.floor((score - 10) / 2)

export const formatModifier = (value: number): string => (value >= 0 ? `+${value}` : `${value}`)

/** PHB racial ability bonuses for the character's ancestry, ignoring class ASI. */
export function racialBonuses(character: Character, ctx: RulesContext) {
  const bonuses = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 0])) as AbilityScores

  const apply = (partial: Partial<AbilityScores>) => {
    for (const key of ABILITY_KEYS) bonuses[key] += partial[key] ?? 0
  }

  if (character.variantHuman) {
    // 2014 Variant Human: +1 to two *different* scores of your choice. The picks are
    // stored per-character in `racialAbilityChoices`, the same field Half-Elf uses.
    for (const [ability, amount] of Object.entries(character.racialAbilityChoices)) {
      if (ability in bonuses && amount > 0) bonuses[ability as AbilityKey] += amount
    }
    return bonuses
  }

  const race = ctx.race.get(character.raceIndex)
  if (!race) return bonuses

  // The fixed bonus always applies. Some ancestries (Half-Elf) additionally offer a
  // choice of smaller bonuses on top of it, so the options never replace the fixed
  // part; Elf, Half-Orc and the SRD's remaining ancestries have options set to null
  // and are handled by the branch above.
  apply(race.abilityBonuses)

  if (race.abilityBonusOptions) {
    // Half-Elf: +1 to two scores of your choice.
    for (const [ability, amount] of Object.entries(character.racialAbilityChoices)) {
      if (ability in bonuses) bonuses[ability as AbilityKey] += amount
    }
  }

  const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
  if (subrace?.abilityBonuses) apply(subrace.abilityBonuses)

  return bonuses
}

/**
 * Reserved field: the 2014 PHB grants no ability score increase from a background,
 * so this is always zero. Kept so the breakdown shape matches what old exports
 * understood as a background column.
 */
const NO_BACKGROUND_BONUS: AbilityScores = Object.fromEntries(
  ABILITY_KEYS.map((k) => [k, 0]),
) as AbilityScores

/** ASIs taken at class levels, plus the Variant Human bonus feat. */
export function asiBonuses(character: Character) {
  const bonuses = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 0])) as AbilityScores
  for (const entry of character.classes) {
    for (const asi of entry.asi) {
      if (asi.asiType === 'feat') continue
      for (const [ability, amount] of Object.entries(asi.abilityBonuses)) {
        if (ability in bonuses) bonuses[ability as AbilityKey] += amount
      }
    }
  }
  return bonuses
}

/**
 * Final scores: base choice plus racial, background and ASI bonuses.
 *
 * Magic items that *set* a score are applied separately in `items.ts` because they
 * are equipment state rather than a permanent character property.
 */
export function finalAbilityScores(
  character: Character,
  ctx: RulesContext,
): Record<AbilityKey, { base: number; racial: number; background: number; asi: number; total: number; modifier: number }> {
  const racial = racialBonuses(character, ctx)
  const background = NO_BACKGROUND_BONUS
  const asi = asiBonuses(character)

  return Object.fromEntries(
    ABILITY_KEYS.map((key) => {
      const base = character.abilityScores[key]
      const total = base + racial[key] + background[key] + asi[key]
      return [
        key,
        {
          base,
          racial: racial[key],
          background: background[key],
          asi: asi[key],
          total,
          modifier: abilityModifier(total),
        },
      ]
    }),
  ) as ReturnType<typeof finalAbilityScores>
}

export type AbilityBreakdown = ReturnType<typeof finalAbilityScores>

/** Convenience: only the totals, for code that does not need the breakdown. */
export function abilityTotals(character: Character, ctx: RulesContext): AbilityScores {
  const breakdown = finalAbilityScores(character, ctx)
  return Object.fromEntries(
    ABILITY_KEYS.map((key) => [key, breakdown[key].total]),
  ) as AbilityScores
}

export function abilityModifiers(character: Character, ctx: RulesContext): AbilityScores {
  const breakdown = finalAbilityScores(character, ctx)
  return Object.fromEntries(
    ABILITY_KEYS.map((key) => [key, breakdown[key].modifier]),
  ) as AbilityScores
}

// ---------------------------------------------------------------------------
// Point Buy
// ---------------------------------------------------------------------------

export function pointBuyCost(ctx: RulesContext, score: number): number | null {
  if (score < ctx.rules.pointBuy.min || score > ctx.rules.pointBuy.maxBeforeRacial) return null
  return ctx.rules.pointBuy.costs[String(score)] ?? null
}

export function pointBuyTotal(ctx: RulesContext, scores: AbilityScores): number {
  let total = 0
  for (const key of ABILITY_KEYS) {
    // A score of 0 means "not assigned yet" and costs nothing.
    if (scores[key] < ctx.rules.pointBuy.min) continue
    total += pointBuyCost(ctx, scores[key]) ?? 0
  }
  return total
}

export function pointBuyRemaining(ctx: RulesContext, scores: AbilityScores): number {
  return ctx.rules.pointBuy.budget - pointBuyTotal(ctx, scores)
}

/** True when every score sits inside the legal point-buy range. */
export function isValidPointBuy(ctx: RulesContext, scores: AbilityScores): boolean {
  return ABILITY_KEYS.every((key) => pointBuyCost(ctx, scores[key]) !== null)
}

/** The standard array, descending, for drag-to-assign UIs. */
export function standardArray(ctx: RulesContext): number[] {
  return [...ctx.rules.standardArray].sort((a, b) => b - a)
}

/** 4d6 drop lowest, six times. `random` is injectable so tests stay deterministic. */
export function rollAbilityScores(
  roll: () => number = Math.random,
): number[] {
  const result: number[] = []
  for (let group = 0; group < 6; group += 1) {
    const dice = Array.from({ length: 4 }, () => Math.floor(roll() * 6) + 1)
    dice.sort((a, b) => b - a)
    result.push(dice[0] + dice[1] + dice[2])
  }
  return result.sort((a, b) => b - a)
}

/**
 * PHB, under "Ability Score Improvements": a bonus may not take a score above 20.
 * Returns the offending scores so the UI can explain the cap.
 */
export function scoresOverCap(character: Character, ctx: RulesContext): AbilityKey[] {
  const breakdown = finalAbilityScores(character, ctx)
  return ABILITY_KEYS.filter((key) => breakdown[key].total > ctx.rules.maxAbilityScore)
}
