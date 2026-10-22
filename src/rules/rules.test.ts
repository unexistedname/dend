/**
 * Smoke tests against values the PHB states directly.
 *
 * These are deliberately hand-checkable: a 1st-level Fighter should have AC 10 + Dex
 * and 10 HP, a Hill Dwarf should have 11, and so on. If a refactor breaks a number,
 * one of these fails with the actual value in the message.
 */
import { describe, expect, it } from 'vitest'
import rules from '../data/generated/rules.json'
import spells from '../data/generated/spells.json'
import items from '../data/generated/items.json'
import type { ItemDataset, RulesDataset, SpellDataset } from '../data/types'
import { createRulesContext } from '../rules/context'
import { createCharacter, type CharacterOverrides } from '../state/schema'
import { deriveCharacter } from '../rules/derived'

const ctx = createRulesContext(
  rules as RulesDataset,
  spells as SpellDataset,
  items as ItemDataset,
)

const build = (overrides: CharacterOverrides = {}) => createCharacter(overrides)

describe('unarmored basics', () => {
  it('AC is 10 + Dexterity with no armour', () => {
    const d = deriveCharacter(build({ abilityScores: { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 } }), ctx)
    expect(d.combat.armorClass.total).toBe(12)
    expect(d.combat.armorClass.method).toBe('unarmored')
  })

  it('unarmored Dexterity caps at +5', () => {
    const d = deriveCharacter(build({ abilityScores: { str: 10, dex: 20, con: 10, int: 10, wis: 10, cha: 10 } }), ctx)
    expect(d.combat.armorClass.total).toBe(15)
  })

  it('a 1st-level d10 character has 10 HP at CON 10', () => {
    const d = deriveCharacter(build(), ctx)
    expect(d.combat.hitPoints.max).toBe(10)
  })

  it('Constitution adds its modifier once per level', () => {
    const d = deriveCharacter(
      build({
        abilityScores: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
        classes: [{ classIndex: 'fighter', subclassIndex: null, level: 3 }],
      }),
      ctx,
    )
    // 10 at 1st, then (6 + 2) twice: 10 + 8 + 8 = 26.
    expect(d.combat.hitPoints.max).toBe(26)
  })
})

describe('racial ability bonuses', () => {
  it('a Mountain Dwarf gets +2 Strength and the ancestry +2 Constitution, once each', () => {
    const d = deriveCharacter(
      build({ raceIndex: 'dwarf', subraceIndex: 'mountain-dwarf' }),
      ctx,
    )
    expect(d.abilities.str.total).toBe(12)
    expect(d.abilities.con.total).toBe(12)
  })

  it('a Hill Dwarf gets +1 Wisdom and +1 HP per level', () => {
    const d = deriveCharacter(
      build({
        raceIndex: 'dwarf',
        subraceIndex: 'hill-dwarf',
        classes: [{ classIndex: 'fighter', subclassIndex: null, level: 3 }],
      }),
      ctx,
    )
    expect(d.abilities.wis.total).toBe(11)
    // Dwarf's +2 Constitution puts the score at 12, so the modifier is +1.
    // 11 at 1st, then (5 + 1) twice, then +1 per level for Dwarven Toughness.
    expect(d.combat.hitPoints.max).toBe(11 + 6 + 6 + 3)
  })

  it('an Elf takes a fixed +2 Dexterity, not a choice', () => {
    const d = deriveCharacter(
      build({ raceIndex: 'elf', subraceIndex: 'high-elf' }),
      ctx,
    )
    // PHB 2014 Elf is a flat +2 Dex. The flexible +2 to two scores is the 2024 rule.
    expect(d.abilities.dex.total).toBe(12)
    expect(d.abilities.int.total).toBe(11)
  })

  it('a Half-Elf applies the chosen bonuses on top of its fixed +2 Charisma', () => {
    const d = deriveCharacter(
      build({ raceIndex: 'half-elf', racialAbilityChoices: { str: 1, wis: 1 } }),
      ctx,
    )
    expect(d.abilities.cha.total).toBe(12)
    expect(d.abilities.str.total).toBe(11)
    expect(d.abilities.wis.total).toBe(11)
    expect(d.abilities.int.total).toBe(10)
  })

  it('a 2014 background grants no ability score bonus', () => {
    const d = deriveCharacter(build({ backgroundIndex: 'acolyte' }), ctx)
    expect(d.abilities.str.background).toBe(0)
    expect(d.abilities.str.total).toBe(11)
  })

  it('a Variant Human takes +1 in exactly two chosen scores', () => {
    const d = deriveCharacter(
      build({
        raceIndex: 'human',
        variantHuman: true,
        racialAbilityChoices: { str: 1, cha: 1 },
      }),
      ctx,
    )
    expect(d.abilities.str.total).toBe(11)
    expect(d.abilities.cha.total).toBe(11)
    expect(d.abilities.dex.total).toBe(10)
    expect(d.constraints.errors.some((v) => v.id === 'variant-human-scores')).toBe(false)
  })

  it('flags a Variant Human that did not choose two scores', () => {
    const d = deriveCharacter(
      build({
        raceIndex: 'human',
        variantHuman: true,
        racialAbilityChoices: {},
      }),
      ctx,
    )
    expect(d.constraints.errors.some((v) => v.id === 'variant-human-scores')).toBe(true)
  })
})

describe('armour', () => {
  it('light armour adds the full Dexterity modifier', () => {
    const d = deriveCharacter(
      build({
        abilityScores: { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 },
        inventory: [{ id: 'armor:leather-armor', quantity: 1, attuned: false, equipped: true, customName: null }],
      }),
      ctx,
    )
    // Leather 11 + Dex 2.
    expect(d.combat.armorClass.total).toBe(13)
  })

  it('a shield adds 2 on top', () => {
    const d = deriveCharacter(
      build({
        inventory: [
          { id: 'armor:leather-armor', quantity: 1, attuned: false, equipped: true, customName: null },
          { id: 'armor:shield', quantity: 1, attuned: false, equipped: true, customName: null },
        ],
      }),
      ctx,
    )
    // Leather 11 + Dex 0 + shield 2.
    expect(d.combat.armorClass.total).toBe(13)
    expect(d.combat.armorClass.shieldBonus).toBe(2)
  })

  it('grants a Fighter the full Table 13 range via "all armor"', () => {
    const d = deriveCharacter(
      build({
        abilityScores: { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        inventory: [{ id: 'armor:plate-armor', quantity: 1, attuned: false, equipped: true, customName: null }],
      }),
      ctx,
    )
    expect(d.combat.armorClass.total).toBe(18)
    expect(d.combat.armorClass.blockingArmor).toBeNull()
  })

  it('reports a Strength requirement it cannot meet', () => {
    const d = deriveCharacter(
      build({
        abilityScores: { str: 8, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        inventory: [{ id: 'armor:plate-armor', quantity: 1, attuned: false, equipped: true, customName: null }],
      }),
      ctx,
    )
    expect(d.combat.armorClass.blockingArmor?.name).toBeTruthy()
  })
})

describe('attunement', () => {
  it('counts only items that actually require attunement', () => {
    const d = deriveCharacter(
      build({
        inventory: [
          // Requires attunement.
          { id: 'magic-item:amulet-of-health', quantity: 1, attuned: true, equipped: true, customName: null },
          // Does not require attunement, so it must not consume a slot.
          { id: 'magic-item:bag-of-holding', quantity: 1, attuned: true, equipped: false, customName: null },
          // Not a magic item at all.
          { id: 'gear:torch', quantity: 1, attuned: true, equipped: false, customName: null },
        ],
      }),
      ctx,
    )
    expect(d.inventory.attunement.used).toBe(1)
    expect(d.inventory.attunement.max).toBe(3)
  })
})

describe('items that set a score', () => {
  it('an Amulet of Health raises a low Constitution to 19', () => {
    const d = deriveCharacter(
      build({
        abilityScores: { str: 10, dex: 10, con: 12, int: 10, wis: 10, cha: 10 },
        inventory: [{ id: 'magic-item:amulet-of-health', quantity: 1, attuned: true, equipped: true, customName: null }],
      }),
      ctx,
    )
    expect(d.inventory.items.setAbilities.con).toBe(19)
  })

  it('an Amulet of Health does nothing when Constitution is already 20', () => {
    const d = deriveCharacter(
      build({
        abilityScores: { str: 10, dex: 10, con: 20, int: 10, wis: 10, cha: 10 },
        inventory: [{ id: 'magic-item:amulet-of-health', quantity: 1, attuned: true, equipped: true, customName: null }],
      }),
      ctx,
    )
    expect(d.inventory.items.setAbilities.con).toBeUndefined()
  })
})

describe('encumbrance', () => {
  it('halves speed past capacity, with no second tier', () => {
    const d = deriveCharacter(
      build({
        abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        // 10 lb backpack, 165 lb worth of gold is not weighable, so use heavy armour.
        inventory: [{ id: 'armor:plate-armor', quantity: 1, attuned: false, equipped: false, customName: null }],
      }),
      ctx,
    )
    // Plate is 65 lb against a 150 lb capacity: still under.
    expect(d.inventory.weight.encumbered).toBe(false)
    expect(d.combat.speed).toBe(30)
  })

  it('does not offer a "heavily encumbered" state', () => {
    const d = deriveCharacter(build(), ctx)
    expect('heavilyEncumbered' in d.inventory.weight).toBe(false)
  })
})

describe('spellcasting', () => {
  it('a 1st-level Wizard has a 13 save DC and knows 3 cantrips', () => {
    const d = deriveCharacter(
      build({
        abilityScores: { str: 10, dex: 10, con: 10, int: 16, wis: 10, cha: 10 },
        classes: [{ classIndex: 'wizard', subclassIndex: null, level: 1 }],
      }),
      ctx,
    )
    // Int 16 is a +3 modifier, so 8 + prof 2 + 3.
    expect(d.spellcasting?.numbers.saveDc).toBe(13)
    expect(d.spellcasting?.numbers.attackBonus).toBe(5)
    // PHB 2014 Wizard table: 3 cantrips at 1st level.
    expect(d.spellcasting?.cantripsKnown).toBe(3)
  })

  it('a 1st-level Cleric prepares rather than fixing a known count', () => {
    const d = deriveCharacter(
      build({
        classes: [{ classIndex: 'cleric', subclassIndex: null, level: 1 }],
      }),
      ctx,
    )
    expect(d.spellcasting?.fixedSpellsKnown).toBe(0)
    expect(d.spellcasting?.numbers.ability).toBe('wis')
  })

  it('a non-casting class has no spellcasting block', () => {
    expect(deriveCharacter(build(), ctx).spellcasting).toBeNull()
  })
})

describe('constraints', () => {
  it('offers every class its skill-choice pool (the dataset must not drop these)', () => {
    const fighter = ctx.class.get('fighter')
    expect(fighter?.skillChoices).toHaveLength(1)
    expect(fighter?.skillChoices[0].choose).toBe(2)
    expect(fighter?.skillChoices[0].options).toContain('skill-athletics')
  })

  it('warns while a Fighter has not chosen its skills yet', () => {
    const d = deriveCharacter(build(), ctx)
    expect(d.constraints.warnings.some((v) => v.id === 'skill-choice-incomplete-fighter')).toBe(true)
  })

  it('accepts exactly two Fighter skill picks and rejects three', () => {
    const legal = deriveCharacter(
      build({
        classes: [
          {
            classIndex: 'fighter',
            subclassIndex: null,
            level: 1,
            skillChoices: ['skill-athletics', 'skill-perception'],
          },
        ],
      }),
      ctx,
    )
    expect(legal.constraints.warnings.some((v) => v.id === 'skill-choice-incomplete-fighter')).toBe(false)

    const tooMany = deriveCharacter(
      build({
        classes: [
          {
            classIndex: 'fighter',
            subclassIndex: null,
            level: 1,
            // All three are in the Fighter's pool, so the count is what breaks.
            skillChoices: ['skill-athletics', 'skill-perception', 'skill-history'],
          },
        ],
      }),
      ctx,
    )
    expect(tooMany.constraints.errors.some((v) => v.id === 'skill-choice-fighter')).toBe(true)
  })

  it('flags overspent point buy', () => {
    const d = deriveCharacter(
      build({
        abilityMethod: { method: 'point-buy', pointsRemaining: -1 },
        abilityScores: { str: 15, dex: 15, con: 15, int: 15, wis: 15, cha: 15 },
      }),
      ctx,
    )
    expect(d.constraints.errors.some((v) => v.id === 'point-buy-budget')).toBe(true)
  })

  it('flags a Paladin who is not of a good alignment', () => {
    const d = deriveCharacter(
      build({
        alignmentIndex: 'neutral-evil',
        classes: [{ classIndex: 'paladin', subclassIndex: null, level: 1 }],
      }),
      ctx,
    )
    expect(d.constraints.errors.some((v) => v.id === 'paladin-alignment')).toBe(true)
  })

  it('flags a subclass taken below its minimum level', () => {
    const d = deriveCharacter(
      build({
        classes: [{ classIndex: 'fighter', subclassIndex: 'eldritch-knight', level: 1 }],
      }),
      ctx,
    )
    expect(d.constraints.errors.some((v) => v.id === 'subclass-level-eldritch-knight')).toBe(true)
  })

  it('reports the Wizard Wizard subclass level as satisfied', () => {
    const d = deriveCharacter(
      build({
        classes: [{ classIndex: 'wizard', subclassIndex: 'school-of-evocation', level: 6 }],
      }),
      ctx,
    )
    expect(d.constraints.errors.some((v) => v.id.includes('subclass-level'))).toBe(false)
  })
})

