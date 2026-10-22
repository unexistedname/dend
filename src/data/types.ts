/**
 * Types describing the generated dataset in `src/data/generated/`.
 *
 * These mirror what `scripts/build-dataset.mjs` emits. They are hand-written
 * rather than inferred because the three chunks are large and are loaded lazily.
 */

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type AbilityKey = (typeof ABILITY_KEYS)[number]

export type AbilityScores = Record<AbilityKey, number>
export type AbilityBonuses = Partial<AbilityScores>

export interface TextEntry {
  index: string
  name: string
  desc: string[]
}

export interface ChoiceGroup {
  desc: string | null
  choose: number
  type: string | null
  options: string[]
}

export interface Skill {
  index: string
  name: string
  ability: AbilityKey
  desc: string[]
}

/**
 * An entry whose SRD description is one paragraph rather than a list of lines.
 * Alignments and magic schools both ship this way.
 */
export interface ParagraphEntry {
  index: string
  name: string
  desc: string
}

/**
 * An alignment. Retained as a named alias so the rules code reads clearly, even
 * though its shape matches `ParagraphEntry`.
 */
export type Alignment = ParagraphEntry

export interface Trait extends TextEntry {  proficiencies: string[]
  proficiencyChoices: ChoiceGroup[]
  languageOptions: { choose: number; options: string[] } | null
  races: string[]
  subraces: string[]
}

export interface Race {
  index: string
  name: string
  speed: number
  size: string
  sizeDescription: string | null
  abilityBonuses: AbilityScores
  abilityBonusOptions: { choose: number; options: { ability: AbilityKey; bonus: number }[] } | null
  languages: string[]
  languageOptions: { choose: number; options: string[] } | null
  languageDescription: string | null
  traits: string[]
  traitChoices: ChoiceGroup[]
  subraceIndexes: string[]
  age: string | null
  alignment: string | null
}

export interface Subrace {
  index: string
  name: string
  raceIndex: string
  abilityBonuses: AbilityBonuses | null
  traits: string[]
  hitPointsBonus: string | null
  proficiencies: { armor?: string[]; weapons?: string[] } | null
  cantrips: string[]
  spells: { index: string; minClassLevel: number | null; uses: string | null }[]
  languages: string[]
  speedOverride: number | null
  desc: string[]
  textAvailable: boolean
}

export interface Background {
  index: string
  name: string
  skillProficiencies: string[]
  toolProficiencies: string[]
  languages: number
  languageOptions: { choose: number; options: string[] } | null
  startingGold: number | null
  equipment: { name: string; cost: string | null; quantity?: number | null }[]
  feature: { name: string | null; desc: string[] }
  featAbilityBonus: number
  textAvailable: boolean
  desc: string[]
}

export interface SpellcastingProgress {
  cantripsKnown: number
  spellsKnown: number | null
  slots: Record<number, number>
}

export interface FeatureEntry extends TextEntry {
  level: number | null
  prerequisites: string[]
}

export interface ClassLevel {
  level: number
  profBonus: number
  asiCount: number
  spellcasting: SpellcastingProgress | null
  features: FeatureEntry[]
  classSpecific: Record<string, number>
}

export interface CharacterClass {
  index: string
  name: string
  hitDie: number
  savingThrows: AbilityKey[]
  armorProficiencies: string[]
  weaponProficiencies: string[]
  grantedToolProficiencies: string[]
  skillChoices: ChoiceGroup[]
  instrumentChoices: ChoiceGroup[]
  toolChoices: ChoiceGroup[]
  spellcasting: { ability: AbilityKey; startsAt: number; info: TextEntry[] } | null
  preparesSpells: boolean
  subclassIndexes: string[]
  levels: ClassLevel[]
  multiClassing: Record<string, unknown>
  startingEquipment: { equipment: string; quantity: number }[]
  startingEquipmentOptions: unknown[]
}

export interface SpellGrant {
  minClassLevel: number | null
  cantrip: boolean
  choose?: number
  spellList?: string
  spells: string[]
}

export interface Subclass {
  index: string
  srdIndex: string | null
  name: string
  classIndex: string
  level: number | null
  flavor: string | null
  grantsExtraSpellSlots: boolean
  spellGrants: SpellGrant[]
  levelRows: { level: number; subclassSpecific: Record<string, number> }[]
  features: FeatureEntry[]
  desc: string[]
  textAvailable: boolean
}

export interface Weapon {
  index: string
  name: string
  category: 'Simple' | 'Martial' | null
  range: string | null
  cost: string | null
  weight: number | null
  damage: string | null
  throwRange: { normal: number; long: number } | null
  twoHandedDamage: string | null
  properties: string[]
  desc: string[]
}

export interface Armor {
  index: string
  name: string
  category: 'Light' | 'Medium' | 'Heavy' | 'Shield' | string
  baseAC: number | null
  dexBonus: boolean
  maxDexBonus: number | null
  strMinimum: number
  stealthDisadvantage: boolean
  cost: string | null
  weight: number | null
}

export interface Gear {
  index: string
  name: string
  category: string | null
  cost: string | null
  weight: number | null
  quantity: number | null
  contents: string | null
  desc: string[]
}

export interface Tool {
  index: string
  name: string
  category: string | null
  cost: string | null
  weight: number | null
  desc: string[]
}

export interface ItemEffect {
  abilities?: Partial<Record<AbilityKey, number>>
  abilityCap?: Partial<Record<AbilityKey, number>>
  acBonus?: number
  allSavesBonus?: number
  speedMultiplier?: number
  speedSet?: number
  resistances?: string[]
  note?: string
}

export interface MagicItem {
  index: string
  name: string
  category: string | null
  rarity: string | null
  attunement: {
    required: boolean
    classes: string[] | null
    races: string[] | null
    spellcaster: boolean
    source: string | null
  }
  effects: ItemEffect | null
  variants: string[]
  isVariant: boolean
  desc: string[]
}

export interface Spell {
  index: string
  name: string
  level: number
  school: string | null
  castingTime: string | null
  range: string | null
  components: string[]
  material: string | null
  duration: string | null
  ritual: boolean
  concentration: boolean
  attackType: string | null
  damage: unknown[]
  areaOfEffect: unknown
  dc: unknown
  desc: string[]
  higherLevel: string[]
  classes: string[]
  subclasses: string[]
}

export interface RulesDataset {
  meta: { generator: string; ruleset: string; source: string; licence: string }
  abilities: { index: AbilityKey; name: string; desc: string[] }[]
  alignments: Alignment[]
  conditions: TextEntry[]
  damageTypes: TextEntry[]
  languages: { index: string; name: string; type: string; desc: string[] }[]
  magicSchools: ParagraphEntry[]
  skills: Skill[]
  weaponProperties: TextEntry[]
  proficiencies: {
    index: string
    name: string
    type: string
    classes: string[]
    races: string[]
    reference: string | null
  }[]
  traits: Trait[]
  races: Race[]
  variantHuman: {
    index: string
    name: string
    abilityBonuses: AbilityScores
    featAbilityBonus: number
    extraFeat: boolean
    rulebookSource: string
    description: string
  }
  subraces: Subrace[]
  backgrounds: Background[]
  classes: CharacterClass[]
  subclasses: Subclass[]
  pointBuy: {
    budget: number
    min: number
    maxBeforeRacial: number
    costs: Record<string, number>
  }
  standardArray: number[]
  rolling: { expression: string; groups: number; rulebookText: string }
  maxAbilityScore: number
  constants: {
    maxAttunementSlots: number
    proficiencyBonusByLevel: Record<string, number>
    acUnarmoredDexCap: number
    shieldAcBonus: number
    attunementSlotsPerLevelUpTo3: number
  }
}

export interface SpellDataset {
  meta: RulesDataset['meta']
  spells: Spell[]
  /** Per class (paladin, ranger): spell index -> allowed alignment indexes. */
  spellAlignment: Record<string, Record<string, string[]>>
  subclassSpellGrants: Record<string, SpellGrant[]>
}

export interface ItemDataset {
  meta: RulesDataset['meta']
  weapons: Weapon[]
  armor: Armor[]
  gear: Gear[]
  tools: Tool[]
  magicItems: MagicItem[]
}
