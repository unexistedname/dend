/**
 * Markdown export for AI consumption.
 *
 * Generated from `deriveCharacter`, never hand-written, so every number on the sheet
 * appears here with the same value the UI shows. Optional fields are wrapped in
 * XML-style tags (`<attunement>...</attunement>`) so an AI can distinguish a value
 * that is present from one that is absent, and every section is self-describing.
 *
 * Nothing here re-implements a rule; it only formats.
 */
import type { Character } from '../state/schema'
import { deriveCharacter, inventoryRows } from '../rules/derived'
import { alignmentBlockedSpells, availableSpells, racialCantrips } from '../rules/spells'
import type { RulesContext } from '../rules/context'

const MOD = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

const rulebookLines = (violations: { rule: string; message: string; rulebookText?: string }[]) =>
  violations.map((v) =>
    v.rulebookText ? `- **${v.rule}** — ${v.message}\n  > ${v.rulebookText}` : `- **${v.rule}** — ${v.message}`,
  )

/** Full character document. Section order matches the character sheet. */
export function characterToMarkdown(character: Character, ctx: RulesContext): string {
  const d = deriveCharacter(character, ctx)
  const lines: string[] = []

  lines.push(`# ${d.identity.name}`)
  lines.push('')
  lines.push(`<id>${d.identity.id}</id>`)
  lines.push(
    `<player>${d.identity.playerName || '—'}</player>` +
      `<level>${d.identity.level}</level>` +
      `<class>${d.identity.className}</class>` +
      (d.identity.subclassName ? `<subclass>${d.identity.subclassName}</subclass>` : ''),
  )
  lines.push(
    `<race>${d.identity.raceName}${d.identity.subraceName ? ` (${d.identity.subraceName})` : ''}</race>` +
      `<background>${d.identity.backgroundName}</background>` +
      `<alignment>${d.identity.alignmentName}</alignment>`,
  )
  lines.push('')

  // --- Ability scores ---------------------------------------------------------
  lines.push('## Ability Scores')
  lines.push('')
  lines.push('| Ability | Score | Modifier | Base | Racial | Background | ASI |')
  lines.push('|---|---:|---:|---:|---:|---:|---:|')
  for (const [key, row] of Object.entries(d.abilities)) {
    const label = key.toUpperCase()
    lines.push(
      `| ${label} | ${row.total} | ${MOD(row.modifier)} | ${row.base} | ${row.racial} | ${row.background} | ${row.asi} |`,
    )
  }
  lines.push('')

  // --- Combat ----------------------------------------------------------------
  lines.push('## Combat')
  lines.push('')
  lines.push(
    `- **Armor Class:** ${d.combat.armorClass.total} ` +
      `(${d.combat.armorClass.armorName ?? 'no armour'}${d.combat.armorClass.shieldBonus ? ', shield +2' : ''})`,
  )
  lines.push(`- **Hit Points:** ${d.combat.hitPoints.max} current / ${d.combat.hitPoints.max} max`)
  if (d.combat.hitPoints.temporary) lines.push(`- **Temporary Hit Points:** ${d.combat.hitPoints.temporary}`)
  lines.push(`- **Speed:** ${d.combat.speed} feet`)
  lines.push(`- **Initiative:** ${MOD(d.combat.initiative)}`)
  lines.push(`- **Proficiency Bonus:** ${MOD(d.combat.proficiencyBonus)}`)
  lines.push(`- **Passive Perception:** ${d.combat.passivePerception}`)
  lines.push(
    `- **Hit Dice:** ${d.combat.hitDice.byClass.map((c) => `${c.count}d${c.die}`).join(' + ')}`,
  )
  lines.push('')
  lines.push('### Saving Throws')
  lines.push('')
  for (const save of d.savingThrows) {
    lines.push(`- ${save.ability.toUpperCase()}: ${MOD(save.total)}${save.proficient ? ' (proficient)' : ''}`)
  }
  lines.push('')

  // --- Skills ----------------------------------------------------------------
  lines.push('## Skills')
  lines.push('')
  for (const skill of d.skills) {
    lines.push(
      `- **${skill.name}** (${skill.ability.toUpperCase()}): ${MOD(skill.total)}` +
        (skill.proficient ? ` [proficient]` : ''),
    )
  }
  lines.push('')

  // --- Spellcasting -----------------------------------------------------------
  if (d.spellcasting) {
    const { numbers } = d.spellcasting
    lines.push('## Spellcasting')
    lines.push('')
    lines.push(`<ability>${numbers.ability.toUpperCase()}</ability>`)
    lines.push(`<save-dc>${numbers.saveDc}</save-dc>`)
    lines.push(`<attack-bonus>${MOD(numbers.attackBonus)}</attack-bonus>`)
    lines.push('')

    const levels = Object.entries(d.spellcasting.slots)
      .filter(([, total]) => total > 0)
      .map(([level, total]) => `L${level} ${d.slotsRemaining[Number(level)] ?? 0}/${total}`)
    if (levels.length) {
      lines.push(`**Spell slots** (remaining/total): ${levels.join(' | ')}`)
      lines.push('')
    }

    const known = d.spellcasting.perClass.find((c) => c.progress?.spellsKnown != null)
    if (known?.progress?.spellsKnown != null) {
      lines.push(`**Spells known:** ${d.spellcasting.fixedSpellsKnown}`)
      lines.push('')
    }

    const spells = spellSections(character, ctx)
    for (const section of spells) {
      lines.push(`### ${section.title}`)
      lines.push('')
      if (section.spells.length === 0) lines.push('*None yet.*')
      for (const spell of section.spells) {
        lines.push(`- **${spell.name}** (level ${spell.level}${spell.ritual ? ', ritual' : ''})`)
      }
      lines.push('')
    }

    const blocked = alignmentBlockedSpells(character, ctx)
    if (blocked.length) {
      lines.push('<alignment-restricted>')
      for (const b of blocked) {
        lines.push(`- ${b.spellName} is restricted to: ${b.allowed.join(', ')}`)
      }
      lines.push('</alignment-restricted>')
      lines.push('')
    }
  }

  // --- Proficiencies ----------------------------------------------------------
  lines.push('## Proficiencies')
  lines.push('')
  lines.push(`- **Armour:** ${d.proficiencies.armor.length ? d.proficiencies.armor.map((a) => a.replace(/-/g, ' ')).join(', ') : '—'}`)
  lines.push(`- **Weapons:** ${[...d.proficiencies.weapons].length ? [...d.proficiencies.weapons].map((w) => w.replace(/-/g, ' ')).join(', ') : '—'}`)
  lines.push(`- **Tools:** ${d.proficiencies.tools.length ? d.proficiencies.tools.join(', ') : '—'}`)
  lines.push(`- **Languages:** ${d.proficiencies.languages.length ? d.proficiencies.languages.join(', ') : '—'}`)
  lines.push('')

  // --- Equipment --------------------------------------------------------------
  lines.push('## Equipment')
  lines.push('')
  lines.push(
    `<carried>${d.inventory.weight.carried} lb / capacity ${d.inventory.weight.capacity} lb` +
      `${d.inventory.weight.encumbered ? ' (encumbered)' : ''}</carried>`,
  )
  lines.push(`<attunement>${d.inventory.attunement.used} of ${d.inventory.attunement.max}</attunement>`)
  lines.push('')

  const rows = inventoryRows(character, ctx)
  if (rows.length === 0) {
    lines.push('*No equipment.*')
  } else {
    lines.push('| Item | Type | Equipped | Attuned | Notes |')
    lines.push('|---|---|---|---|---|')
    for (const row of rows) {
      const notes: string[] = []
      if (row.requiresAttunement && !row.known) notes.push('attunement')
      if (row.entry.attuned && row.requiresAttunement) notes.push('attuned')
      if (!row.known) notes.push('custom entry')
      lines.push(
        `| ${row.name} | ${row.kind} | ${row.entry.equipped ? 'yes' : 'no'} | ` +
          `${row.entry.attuned ? 'yes' : 'no'} | ${notes.join(', ') || '—'} |`,
      )
    }
  }
  lines.push('')

  const itemNotes = d.inventory.items.notes
  if (itemNotes.length) {
    lines.push('<magic-item-effects>')
    for (const note of itemNotes) lines.push(`- **${note.name}:** ${note.note}`)
    lines.push('</magic-item-effects>')
    lines.push('')
  }

  // --- Constraints ------------------------------------------------------------
  const { errors, warnings, infos } = d.constraints
  if (errors.length || warnings.length || infos.length) {
    lines.push('## Rule Check')
    lines.push('')
    if (errors.length) {
      lines.push('### Violations')
      lines.push(...rulebookLines(errors))
      lines.push('')
    }
    if (warnings.length) {
      lines.push('### Warnings')
      lines.push(...rulebookLines(warnings))
      lines.push('')
    }
    if (infos.length) {
      lines.push('### Notes')
      lines.push(...rulebookLines(infos))
      lines.push('')
    }
  } else {
    lines.push('## Rule Check')
    lines.push('')
    lines.push('No rule violations.')
    lines.push('')
  }

  if (character.notes.trim()) {
    lines.push('## Notes')
    lines.push('')
    lines.push(character.notes.trim())
    lines.push('')
  }

  lines.push('<generated>scripts/export/markdown.ts from src/data/generated/</generated>')
  lines.push('')

  return lines.join('\n')
}

function spellSections(character: Character, ctx: RulesContext) {
  const available = new Set(availableSpells(character, ctx))
  const cantrips = new Set(racialCantrips(character, ctx))
  const known = character.spells.known.length ? character.spells.known : character.spells.prepared

  const spell = (index: string) => ctx.spell.get(index)

  return [
    {
      title: 'Cantrips',
      spells: [...character.spells.cantrips].map(spell).filter((s): s is NonNullable<typeof s> => Boolean(s)),
    },
    {
      title: available.size && known.length ? 'Known or Prepared Spells' : 'Spells',
      spells: [...known].map(spell).filter((s): s is NonNullable<typeof s> => Boolean(s)),
    },
    {
      title: 'Innate or Ancestry Spells',
      spells: [...cantrips]
        .filter((i) => !character.spells.cantrips.includes(i))
        .map(spell)
        .filter((s): s is NonNullable<typeof s> => Boolean(s)),
    },
  ]
}
