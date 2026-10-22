/**
 * Golden checks against the Markdown export, guarding the AI-consumption contract:
 * every section is present, numbers appear once with their derived value, and XML
 * tags mark absent optional fields.
 */
import { describe, expect, it } from 'vitest'
import rules from '../data/generated/rules.json'
import spells from '../data/generated/spells.json'
import items from '../data/generated/items.json'
import { createRulesContext } from '../rules/context'
import { createCharacter } from '../state/schema'
import { characterToMarkdown } from './markdown'

const ctx = createRulesContext(rules as never, spells as never, items as never)

describe('markdown export', () => {
  it('renders a 1st-level human fighter', () => {
    const character = createCharacter({ name: 'Thorn' })
    const md = characterToMarkdown(character, ctx)

    expect(md).toContain('# Thorn')
    expect(md).toContain('<level>1</level>')
    expect(md).toContain('<class>Fighter</class>')
    expect(md).toContain('<race>Human</race>')
    expect(md).toContain('<background>Acolyte</background>')
    expect(md).toContain('**Hit Points:** 10 current / 10 max')
    expect(md).toContain('**Proficiency Bonus:** +2')
    expect(md).toContain('| STR | 11 | +0 | 10 | 1 | 0 | 0 |')
    expect(md).not.toContain('### Violations')
  })

  it('shows a wizard save DC and cantrips', () => {
    const character = createCharacter({
      name: 'Wiz',
      raceIndex: 'human',
      abilityScores: { str: 8, dex: 14, con: 14, int: 16, wis: 10, cha: 12 },
      abilityMethod: { method: 'point-buy', pointsRemaining: 0 },
      classes: [{ classIndex: 'wizard', subclassIndex: null, level: 1 }],
      spells: {
        cantrips: ['fire-bolt', 'mage-hand', 'ray-of-frost'],
        known: ['detect-magic', 'mage-armor', 'magic-missile', 'shield'],
        prepared: [],
        slots: { spent: {} },
        alwaysPrepared: [],
      },
    })
    const md = characterToMarkdown(character, ctx)

    expect(md).toContain('<ability>INT</ability>')
    expect(md).toContain('<save-dc>13</save-dc>')
    expect(md).toContain('<attack-bonus>+5</attack-bonus>')
    expect(md).toContain('**Spell slots** (remaining/total): L1 2/2')
    for (const spell of ['Fire Bolt', 'Mage Hand', 'Ray of Frost', 'Detect Magic', 'Mage Armor', 'Magic Missile', 'Shield']) {
      expect(md).toContain(`**${spell}**`)
    }
  })

  it('flags a rule violation with its verbatim rule text', () => {
    const character = createCharacter({
      name: 'Pal',
      raceIndex: 'human',
      alignmentIndex: 'chaotic-evil',
      classes: [{ classIndex: 'paladin', subclassIndex: null, level: 2 }],
    })
    const md = characterToMarkdown(character, ctx)

    expect(md).toContain('### Violations')
    expect(md).toContain('**Paladin** — A Paladin must be of a good alignment.')
    expect(md).toMatch(/paladin must be of a good alignment \(lawful, neutral, or chaotic good\)/)
  })

  it('marks strong equipment with encumbrance and attunement lines', () => {
    const character = createCharacter({
      name: 'Tank',
      classes: [{ classIndex: 'fighter', subclassIndex: null, level: 1 }],
      inventory: [
        { id: 'armor:plate-armor', quantity: 1, attuned: false, equipped: true, customName: null },
      ],
    })
    const md = characterToMarkdown(character, ctx)

    expect(md).toContain('<carried>')
    expect(md).toMatch(/capacity/)
    expect(md).toContain('| Plate Armor | armor | yes | no | — |')
  })
})
