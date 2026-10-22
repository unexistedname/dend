/**
 * The persisted character shape.
 *
 * This is the single source of truth for what a character is. `rules/` reads it,
 * `export/` serialises it, and the store validates every write through it, so a
 * bad `localStorage` payload can never reach the UI.
 *
 * Choices worth noting:
 * - Ability scores are stored as the *base* score chosen at creation, before
 *   racial and item modifiers. The rules engine layers those on top, which keeps
 *   "how did I build this" recoverable after equipping an Amulet of Health.
 * - `proficiencies` holds granted proficiencies only; anything the class, race or
 *   background grants automatically is derived, never stored.
 * - Nothing here is validated against the rulebook. That is `rules/validate.ts`'s
 *   job, and it returns warnings rather than throwing, so a half-finished
 *   character is always loadable.
 */
import { z } from 'zod'
import { ABILITY_KEYS } from '../data/types'

const abilityScoresSchema = z.object({
  str: z.number().int(),
  dex: z.number().int(),
  con: z.number().int(),
  int: z.number().int(),
  wis: z.number().int(),
  cha: z.number().int(),
})

const abilityMethodNameSchema = z.enum(['point-buy', 'standard-array', 'rolled', 'manual'])

/** Which of the PHB's four ability-score methods this character used. */
export const abilityMethodSchema = z.object({
  method: abilityMethodNameSchema,
  /**
   * For `rolled`: the six 4d6-drop-lowest totals (3-18), before assignment to
   * specific abilities. Not the individual dice, which are discarded.
   */
  rolls: z.array(z.number().int().min(3).max(18)).length(6).optional(),
  /** Points left over, cached so the UI can show the remaining budget. */
  pointsRemaining: z.number().int().optional(),
})

/** A single ASI or feat pick. Feat indexes come from the PHB (not in the SRD). */
const asiSchema = z.object({
  level: z.number().int().min(1).max(20),
  /** Ability index -> bonus chosen at this level. */
  abilityBonuses: z.record(z.string(), z.number().int()).default({}),
  feat: z.string().nullable().default(null),
  asiType: z.enum(['ability', 'feat']).default('ability'),
})

const classEntrySchema = z.object({
  classIndex: z.string(),
  subclassIndex: z.string().nullable().default(null),
  level: z.number().int().min(1).max(20).default(1),
  /** Subclass is only legal from its own level; the engine checks the number. */
  subclassLevel: z.number().int().min(1).max(20).nullable().default(null),
  /** Skill picks from the class's `skillChoices`, e.g. ['skill-arcana']. */
  skillChoices: z.array(z.string()).default([]),
  instrumentChoices: z.array(z.string()).default([]),
  toolChoices: z.array(z.string()).default([]),
  /** Hit die manually overridden when the player rolls HP instead of averaging. */
  hitDieOverride: z.number().int().min(1).nullable().default(null),
  asi: z.array(asiSchema).default([]),
})

const spellSlotsSchema = z.object({
  /** 1-based spell level -> number of slots spent. */
  spent: z.record(z.string(), z.number().int().min(0)).default({}),
})

const spellsSchema = z.object({
  cantrips: z.array(z.string()).default([]),
  /** Spells known for a class that keeps a fixed list (wizard, sorcerer, ...). */
  known: z.array(z.string()).default([]),
  /** Spells prepared for a class that prepares from its list. */
  prepared: z.array(z.string()).default([]),
  slots: spellSlotsSchema.default({ spent: {} }),
  /** Innate/known-at-will spells from a subclass, e.g. Druid bonus cantrips. */
  alwaysPrepared: z.array(z.string()).default([]),
})

const equipmentSchema = z.object({
  /** `weapon:<index>` / `armor:<index>` / `gear:<index>` / `magic-item:<index>`. */
  id: z.string(),
  quantity: z.number().int().min(1).default(1),
  attuned: z.boolean().default(false),
  equipped: z.boolean().default(false),
  /** Set when the item's index is not in the SRD, e.g. a homebrew or PHB-only item. */
  customName: z.string().nullable().default(null),
})

const featuresSchema = z.object({
  /** Class and racial features the player has ticked off. */
  selected: z.array(z.string()).default([]),
})

export const characterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  /** Player-facing nickname; optional. */
  playerName: z.string().max(120).default(''),

  /** Base ability scores before racial, item or magic modifiers. */
  abilityScores: abilityScoresSchema,
  abilityMethod: abilityMethodSchema,

  raceIndex: z.string(),
  subraceIndex: z.string().nullable().default(null),
  /** True when the Variant Human option is chosen instead of a plain Human. */
  variantHuman: z.boolean().default(false),
  /** Ability index -> bonus, for races with a choice (Elf, Half-Elf, Half-Orc, Variant Human). */
  racialAbilityChoices: z.record(z.string(), z.number().int()).default({}),
  racialLanguages: z.array(z.string()).default([]),
  /** Trait indexes ticked for traits that are opt-in (e.g. Skill choices). */
  selectedTraits: z.array(z.string()).default([]),

  alignmentIndex: z.string().default('true-neutral'),
  backgroundIndex: z.string().default('acolyte'),
  /**
   * Reserved for 2024-style exports. The 2014 PHB grants no ability bonus from a
   * background, so the engine reads this as zero and the builder never writes it.
   */
  backgroundAbilityBonus: z.record(z.string(), z.number().int()).default({}),
  backgroundLanguages: z.array(z.string()).default([]),

  /**
   * Every class the character has levels in. The UI defaults to a single class,
   * which is the common case, but the PHB defines multiclassing and the engine
   * implements it, so the shape stays an array.
   */
  classes: z.array(classEntrySchema).min(1),

  /** Skill proficiencies bought from the "any other two" background allowance. */
  skillProficiencies: z.array(z.string()).default([]),
  toolProficiencies: z.array(z.string()).default([]),

  spells: spellsSchema.default({
    cantrips: [],
    known: [],
    prepared: [],
    slots: { spent: {} },
    alwaysPrepared: [],
  }),

  /** Armour, weapons and magic items. `equipped` drives AC and attunement. */
  inventory: z.array(equipmentSchema).default([]),

  features: featuresSchema.default({ selected: [] }),

  /**
   * `max` is null when the player has not overridden the computed value, which is the
   * normal case; `rules/health.ts` derives it from the class table and Constitution.
   */
  hp: z
    .object({
      max: z.number().int().min(1).nullable().default(null),
      temporary: z.number().int().default(0),
    })
    .default({ max: null, temporary: 0 }),

  notes: z.string().max(5000).default(''),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Character = z.infer<typeof characterSchema>
export type ClassEntry = z.infer<typeof classEntrySchema>
export type AsiEntry = z.infer<typeof asiSchema>
export type EquipmentEntry = z.infer<typeof equipmentSchema>
export type SpellSelection = z.infer<typeof spellsSchema>
export type AbilityMethod = z.infer<typeof abilityMethodSchema>

/**
 * Recursively optional, for building a character without restating every field of
 * every nested entry. `Partial<Character>` is shallow and would force callers to
 * supply all ten class-entry fields to change just the level.
 */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

export type CharacterOverrides = DeepPartial<Omit<Character, 'id' | 'createdAt' | 'updatedAt'>>

/** A blank 1st-level character, used when the player starts a new one. */
export function createCharacter(overrides: CharacterOverrides = {}): Character {
  const now = new Date().toISOString()
  return characterSchema.parse({
    id: crypto.randomUUID(),
    name: 'Unnamed Character',
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    abilityMethod: { method: 'point-buy', pointsRemaining: 27 },
    raceIndex: 'human',
    subraceIndex: null,
    alignmentIndex: 'true-neutral',
    backgroundIndex: 'acolyte',
    classes: [{ classIndex: 'fighter', subclassIndex: null, level: 1 }],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  })
}

/** Total character level, which is the cap on every PHB class. */
export function totalLevel(character: Character): number {
  return character.classes.reduce((sum, entry) => sum + entry.level, 0)
}

export function primaryClass(character: Character): ClassEntry {
  // The first entry is the character's starting class; it defines the sheet order.
  return character.classes[0]
}

export const abilityLabels: Record<(typeof ABILITY_KEYS)[number], string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
}
