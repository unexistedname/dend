/**
 * The read-only sheet: everything the builder produced, laid out for reading and
 * printing (File → Print → Save as PDF is the supported "PDF export"; no PNG path).
 *
 * Every block is `deriveCharacter` output, so sheet and builder cannot disagree.
 * Rule text is quoted from the rulebook wherever it is shown.
 */
import type { Character } from '../state/schema'
import type { RulesContext } from '../rules/context'
import { useState } from 'react'
import { deriveCharacter, inventoryRows } from '../rules/derived'
import { formatModifier } from '../rules/abilities'
import { abilityLabels } from '../state/schema'
import { ABILITY_KEYS } from '../data/types'
import { Card, Tip } from '../components/ui'
import { CombatBlock } from '../components/CombatBlock'
import { ConstraintPanel } from '../components/ConstraintPanel'

const PAPER_KEY = 'dend.sheet.paper'

/** Light paper is a display choice, not part of the character. */
function readPaper(): boolean {
  try {
    return localStorage.getItem(PAPER_KEY) === 'light'
  } catch {
    return false
  }
}

export function Sheet({ character, ctx }: { character: Character; ctx: RulesContext }) {
  const [paper, setPaper] = useState(readPaper)
  const d = deriveCharacter(character, ctx)
  const entry = character.classes[0]
  const klass = ctx.class.get(entry.classIndex)
  const race = ctx.race.get(character.raceIndex)
  const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
  const subclass = entry.subclassIndex ? ctx.subclass.get(entry.subclassIndex) : null
  const background = ctx.background.get(character.backgroundIndex)

  const pretty = (index: string, map?: Map<string, { name: string }>) =>
    map?.get(index)?.name ?? index.replace(/-/g, ' ')

  const togglePaper = () => {
    const next = !paper
    setPaper(next)
    try {
      localStorage.setItem(PAPER_KEY, next ? 'light' : 'dark')
    } catch {
      // The choice only restores a look; a blocked write may forget it.
    }
  }

  const traitIndexes = [...(race?.traits ?? []), ...(subrace?.traits ?? [])]
  const traits = traitIndexes
    .map((index) => ctx.trait.get(index))
    .filter((trait): trait is NonNullable<typeof trait> => Boolean(trait))

  const classFeatures = (klass?.levels ?? [])
    .filter((level) => level.level <= entry.level)
    .flatMap((level) => level.features.map((feature) => ({ level: level.level, feature })))

  const rows = inventoryRows(character, ctx)
  const sc = d.spellcasting

  const facts: { label: string; value: string; tip?: string | null }[] = [
    { label: 'Player', value: d.identity.playerName || '—' },
    {
      label: 'Race',
      value: d.identity.subraceName
        ? `${d.identity.raceName} (${d.identity.subraceName})`
        : d.identity.raceName,
      tip: race?.sizeDescription ?? null,
    },
    { label: 'Background', value: d.identity.backgroundName },
    { label: 'Alignment', value: d.identity.alignmentName },
  ]

  return (
    <div className={`print-page sheet grid gap-4${paper ? ' paper-light' : ''}`}>
      <header className="print-page sheet-header">
        <div className="flex items-start justify-between gap-3">
          <p className="label-caps">Character sheet</p>
          <button
            type="button"
            className="btn no-print"
            onClick={togglePaper}
            title={paper ? 'Switch the sheet to dark paper' : 'Switch the sheet to light paper'}
          >
            {paper ? 'Dark' : 'Light'}
          </button>
        </div>
        <h1 className="sheet-name">{character.name || 'Unnamed character'}</h1>
        <p className="sheet-subtitle">
          <Tip text={subclass?.flavor}>
            Level {d.identity.level} &middot; {d.identity.className}
            {d.identity.subclassName ? ` — ${d.identity.subclassName}` : ''}
          </Tip>
        </p>
        <div className="sheet-rule" aria-hidden />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="label-caps">{fact.label}</dt>
              <dd className="font-medium">
                <Tip text={fact.tip}>{fact.value}</Tip>
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <Card title="Combat">
        <CombatBlock character={character} ctx={ctx} />
      </Card>

      <Card title="Ability Scores">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="label-caps border-b border-line text-left font-semibold">
              <th className="py-1 font-semibold">Score</th>
              <th className="py-1 text-right font-semibold">Base</th>
              <th className="py-1 text-right font-semibold">Racial</th>
              <th className="py-1 text-right font-semibold">ASI</th>
              <th className="py-1 text-right font-semibold">Total</th>
              <th className="py-1 text-right font-semibold">Mod</th>
              <th className="py-1 text-right font-semibold">Save</th>
            </tr>
          </thead>
          <tbody>
            {ABILITY_KEYS.map((key) => {
              const row = d.abilities[key]
              const save = d.savingThrows.find((s) => s.ability === key)
              return (
                <tr key={key} className="border-b border-line-soft last:border-0">
                  <td className="py-1">{abilityLabels[key]}</td>
                  <td className="py-1 text-right">{row.base}</td>
                  <td className="py-1 text-right">{row.racial || '—'}</td>
                  <td className="py-1 text-right">{row.asi || '—'}</td>
                  <td className="py-1 text-right font-display text-base font-bold text-parchment">
                    {row.total}
                  </td>
                  <td className="py-1 text-right font-semibold text-gold">
                    {formatModifier(row.modifier)}
                  </td>
                  <td className={`py-1 text-right ${save?.proficient ? 'font-semibold' : 'text-muted'}`}>
                    {save ? formatModifier(save.total) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Proficiencies & Languages">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <ProficiencyRow
            label="Armor"
            values={d.proficiencies.armor.map((index) => pretty(index, ctx.armor))}
          />
          <ProficiencyRow
            label="Weapons"
            values={[...d.proficiencies.weapons].map((index) =>
              pretty(index, ctx.weapon),
            )}
          />
          <ProficiencyRow
            label="Tools"
            values={d.proficiencies.tools.map((index) => pretty(index, ctx.tool))}
          />
          <ProficiencyRow
            label="Languages"
            values={d.proficiencies.languages.map((index) => pretty(index, ctx.language))}
          />
          <ProficiencyRow
            label="Saving throws"
            values={
              klass?.savingThrows.map((save) =>
                save.replace('saving-throw-', '').toUpperCase(),
              ) ?? []
            }
          />
        </dl>
      </Card>

      <Card title="Features">
        {traits.length || background?.feature.name || classFeatures.length ? (
          <div className="features-grid grid gap-3 text-sm md:grid-cols-2">
            <div>
              <h3 className="label-caps mb-1">
                Ancestry
              </h3>
              {traits.map((trait) => (
                <div key={trait.index} className="mb-2">
                  <div className="font-medium">{trait.name}</div>
                  <p className="text-xs leading-relaxed text-body">
                    {trait.desc.join(' ')}
                  </p>
                </div>
              ))}
            </div>

            <div>
              <h3 className="label-caps mb-1">
                Class Features
              </h3>
              {classFeatures.map(({ level, feature }) => (
                <div key={`${level}-${feature.name}`} className="mb-2">
                  <div className="font-medium">
                    {feature.name}
                    <span className="ml-2 text-xs font-normal text-muted">
                      level {level}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-body">
                    {feature.desc.join(' ')}
                  </p>
                </div>
              ))}
              {subclass?.features.length ? (
                <div className="mt-2 rounded border border-line-soft p-2">
                  <div className="font-brand text-sm text-parchment">
                    {subclass.name}
                  </div>
                  {subclass.features.map((feature) => (
                    <div key={feature.name} className="mb-1">
                      <div className="font-medium">{feature.name}</div>
                      <p className="text-xs leading-relaxed text-body">
                        {feature.desc.join(' ')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {background?.feature.name ? (
              <div className="md:col-span-2">
                <h3 className="label-caps mb-1">
                  Background Feature
                </h3>
                <div className="font-medium">{background.feature.name}</div>
                <p className="text-xs leading-relaxed text-body">
                  {background.feature.desc.join(' ')}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">No features recorded yet.</p>
        )}
      </Card>

      {sc ? (
        <Card title="Spellcasting">
          <div className="mb-2 flex flex-wrap gap-4 text-sm">
            <span>
              <Tip text="Spell save DC = 8 + proficiency bonus + spellcasting ability modifier.">
                Save DC {sc.numbers.saveDc}
              </Tip>
            </span>
            <span>
              <Tip text="Spell attack modifier = proficiency bonus + spellcasting ability modifier.">
                Attack {formatModifier(sc.numbers.attackBonus)}
              </Tip>
            </span>
            <span>Ability {sc.numbers.ability.toUpperCase()}</span>
          </div>

          <table className="mb-3 w-full text-sm tabular-nums">
            <thead>
              <tr className="label-caps border-b border-line-soft text-left font-semibold">
                <th className="py-1">Slot level</th>
                <th className="py-1 text-right">Total</th>
                <th className="py-1 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(sc.slots)
                .filter(([, total]) => total > 0)
                .map(([level, total]) => (
                  <tr key={level} className="border-b border-line-soft">
                    <td className="py-1">Level {level}</td>
                    <td className="py-1 text-right">{total}</td>
                    <td className="py-1 text-right">{d.slotsRemaining[Number(level)] ?? total}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          <SpellList
            ctx={ctx}
            title={`Cantrips (${character.spells.cantrips.length})`}
            indexes={character.spells.cantrips}
          />
          <SpellList
            ctx={ctx}
            title={
              sc.perClass.some((row) => row.preparesSpells)
                ? `Prepared (${character.spells.prepared.length})`
                : `Known (${character.spells.known.length})`
            }
            indexes={sc.perClass.some((row) => row.preparesSpells)
              ? character.spells.prepared
              : character.spells.known}
          />
        </Card>
      ) : null}

      <Card title="Equipment">
        <div className="mb-2 flex gap-4 text-xs text-muted">
          <span>
            {d.inventory.weight.carried} / {d.inventory.weight.capacity} lb
            {d.inventory.weight.encumbered ? ' (encumbered)' : ''}
          </span>
          <span>
            Attunement {d.inventory.attunement.used}/{d.inventory.attunement.max}
          </span>
        </div>
        {rows.length ? (
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="label-caps border-b border-line-soft text-left font-semibold">
                <th className="py-1">Item</th>
                <th className="py-1">Type</th>
                <th className="py-1 text-right">Qty</th>
                <th className="py-1 text-center">Equipped</th>
                <th className="py-1 text-center">Attuned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line-soft">
                  <td className="py-1">
                    <Tip
                      text={row.desc.length ? row.desc.join('\n') : row.known ? null : 'Not in the System Reference Document; recorded as written.'}
                    >
                      {row.name}
                    </Tip>
                  </td>
                  <td className="py-1 text-xs uppercase text-muted">{row.kind}</td>
                  <td className="py-1 text-right">{row.entry.quantity}</td>
                  <td className="py-1 text-center">{row.entry.equipped ? '●' : ''}</td>
                  <td className="py-1 text-center">{row.entry.attuned ? '●' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">No equipment.</p>
        )}
      </Card>

      <Card title="Rule Check">
        <ConstraintPanel character={character} ctx={ctx} />
      </Card>

      {character.notes ? (
        <Card title="Notes">
          <p className="whitespace-pre-line text-sm">{character.notes}</p>
        </Card>
      ) : null}
    </div>
  )
}

function ProficiencyRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="border-b border-line-soft py-1">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd>{values.length ? values.join(', ') : '—'}</dd>
    </div>
  )
}

function SpellList({
  ctx,
  title,
  indexes,
}: {
  ctx: RulesContext
  title: string
  indexes: string[]
}) {
  return (
    <div className="mb-2">
      <h3 className="label-caps">{title}</h3>
      {indexes.length ? (
        <p className="text-sm">
          {indexes.map((index, i) => {
            const spell = ctx.spell.get(index)
            return (
              <span key={index}>
                {i > 0 ? ', ' : ''}
                <Tip text={spell ? spell.desc.join(' ') : null}>
                  {spell?.name ?? index.replace(/-/g, ' ')}
                </Tip>
              </span>
            )
          })}
        </p>
      ) : (
        <p className="text-sm text-muted">None.</p>
      )}
    </div>
  )
}
