/**
 * Indexed access to the generated dataset.
 *
 * Everything in `rules/` takes a `RulesContext` instead of importing the JSON
 * directly, so the data can be loaded lazily and the lookups stay O(1) instead of
 * scanning arrays on every render.
 */
import type {
  AbilityKey,
  Alignment,
  Armor,
  Background,
  CharacterClass,
  ClassLevel,
  Gear,
  ItemDataset,
  MagicItem,
  ParagraphEntry,
  Race,
  RulesDataset,
  Skill,
  Spell,
  SpellDataset,
  Subclass,
  Subrace,
  TextEntry,
  Tool,
  Trait,
  Weapon,
} from '../data/types'

export interface RulesContext {
  rules: RulesDataset
  spells: SpellDataset
  items: ItemDataset

  ability: Map<AbilityKey, { index: AbilityKey; name: string; desc: string[] }>
  skill: Map<string, Skill>
  language: Map<string, TextEntry>
  trait: Map<string, Trait>
  race: Map<string, Race>
  subrace: Map<string, Subrace>
  background: Map<string, Background>
  class: Map<string, CharacterClass>
  subclass: Map<string, Subclass>
  weapon: Map<string, Weapon>
  armor: Map<string, Armor>
  gear: Map<string, Gear>
  tool: Map<string, Tool>
  magicItem: Map<string, MagicItem>
  spell: Map<string, Spell>
  damageType: Map<string, TextEntry>
  proficiency: Map<string, RulesDataset['proficiencies'][number]>
  alignment: Map<string, Alignment>
  condition: Map<string, TextEntry>
  magicSchool: Map<string, ParagraphEntry>
}

const byIndex = <T extends { index: string }>(list: T[]) => new Map(list.map((x) => [x.index, x]))

export function createRulesContext(
  rules: RulesDataset,
  spells: SpellDataset,
  items: ItemDataset,
): RulesContext {
  return {
    rules,
    spells,
    items,
    ability: byIndex(rules.abilities) as RulesContext['ability'],
    skill: byIndex(rules.skills),
    language: byIndex(rules.languages),
    trait: byIndex(rules.traits),
    race: byIndex(rules.races),
    subrace: byIndex(rules.subraces),
    background: byIndex(rules.backgrounds),
    class: byIndex(rules.classes),
    subclass: byIndex(rules.subclasses),
    weapon: byIndex(items.weapons),
    armor: byIndex(items.armor),
    gear: byIndex(items.gear),
    tool: byIndex(items.tools),
    magicItem: byIndex(items.magicItems),
    spell: byIndex(spells.spells),
    damageType: byIndex(rules.damageTypes),
    proficiency: byIndex(rules.proficiencies),
    alignment: byIndex(rules.alignments),
    condition: byIndex(rules.conditions),
    magicSchool: byIndex(rules.magicSchools),
  }
}

/**
 * PHB "Armor": a weapon proficiency covers simple or martial weapons, not
 * individual weapon indexes. These are the SRD proficiency indexes that mean
 * "any weapon of this kind".
 */
export const SIMPLE_WEAPON_PROFICIENCY = 'simple-weapons'
export const MARTIAL_WEAPON_PROFICIENCY = 'martial-weapons'

export function levelRow(klass: CharacterClass, level: number): ClassLevel | undefined {
  return klass.levels.find((l) => l.level === level)
}

/** Class and subclass list a spell, accounting for subclass-only expansions. */
export function classSpellList(
  ctx: RulesContext,
  classIndex: string,
  subclassIndex: string | null,
): string[] {
  const indexes = new Set<string>()
  for (const spell of ctx.spells.spells) {
    if (spell.classes.includes(classIndex)) indexes.add(spell.index)
  }
  if (subclassIndex) {
    for (const grant of ctx.spells.subclassSpellGrants[subclassIndex] ?? []) {
      for (const spellIndex of grant.spells) indexes.add(spellIndex)
    }
  }
  return [...indexes]
}

/** Cantrips a class may know, from its own list plus racial grants. */
export function cantripPool(
  ctx: RulesContext,
  classIndex: string,
  subclassIndex: string | null,
  racialCantrips: string[],
): string[] {
  const indexes = new Set(racialCantrips)
  for (const spell of ctx.spells.spells) {
    if (spell.level !== 0) continue
    if (spell.classes.includes(classIndex)) indexes.add(spell.index)
  }
  for (const grant of ctx.spells.subclassSpellGrants[subclassIndex ?? ''] ?? []) {
    if (!grant.cantrip) continue
    for (const spellIndex of grant.spells) indexes.add(spellIndex)
  }
  return [...indexes].filter((i) => ctx.spell.get(i)?.level === 0)
}

/**
 * Resolves an inventory id of the form `kind:index`. Inventories mix equipment
 * with custom entries, so callers must handle a null result.
 */
export function parseInventoryId(
  id: string,
  ctx: RulesContext,
):
  | { kind: 'weapon'; entry: Weapon }
  | { kind: 'armor'; entry: Armor }
  | { kind: 'gear'; entry: Gear }
  | { kind: 'tool'; entry: Tool }
  | { kind: 'magic-item'; entry: MagicItem }
  | null {
  const separator = id.indexOf(':')
  if (separator < 0) return null
  const kind = id.slice(0, separator)
  const index = id.slice(separator + 1)
  switch (kind) {
    case 'weapon':
      return ctx.weapon.has(index) ? { kind, entry: ctx.weapon.get(index)! } : null
    case 'armor':
      return ctx.armor.has(index) ? { kind, entry: ctx.armor.get(index)! } : null
    case 'gear':
      return ctx.gear.has(index) ? { kind, entry: ctx.gear.get(index)! } : null
    case 'tool':
      return ctx.tool.has(index) ? { kind, entry: ctx.tool.get(index)! } : null
    case 'magic-item':
      return ctx.magicItem.has(index) ? { kind, entry: ctx.magicItem.get(index)! } : null
    default:
      return null
  }
}
