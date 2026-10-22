/**
 * Spell selection and slot spending.
 *
 * Selection is bound to the same limits the rules engine verifies: cantrips are
 * capped by the class table, fixed-list classes are capped by "spells known", and
 * classes that prepare from their list are not capped numerically. Every spell row
 * expands to its full rule text (casting time, range, components, duration,
 * scaling), since the character is not much use without it.
 */
import { useMemo, useState } from 'react'
import type { Character } from '../../state/schema'
import type { RulesContext } from '../../rules/context'
import {
  availableCantrips,
  availableSpells,
  alignmentBlockedSpells,
} from '../../rules/spells'
import { deriveCharacter } from '../../rules/derived'
import { Card, Tip } from '../../components/ui'

interface Props {
  character: Character
  ctx: RulesContext
  patch: (changes: Partial<Character>) => void
}

export function Spells({ character, ctx, patch }: Props) {
  const [filter, setFilter] = useState('')
  const d = deriveCharacter(character, ctx)
  const sc = d.spellcasting

  const racialCantrips = useMemo(() => {
    const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
    return new Set(subrace?.cantrips ?? [])
  }, [character.subraceIndex, ctx])

  const pool = useMemo(() => {
    if (!sc) return { cantrips: [] as string[], spells: [] as string[] }
    return {
      cantrips: availableCantrips(character, ctx)
        .filter((index) => !racialCantrips.has(index))
        .sort((a, b) => (ctx.spell.get(a)?.name ?? '').localeCompare(ctx.spell.get(b)?.name ?? '')),
      spells: availableSpells(character, ctx)
        .filter((index) => !racialCantrips.has(index))
        .sort(
          (a, b) =>
            (ctx.spell.get(a)?.level ?? 0) - (ctx.spell.get(b)?.level ?? 0) ||
            (ctx.spell.get(a)?.name ?? '').localeCompare(ctx.spell.get(b)?.name ?? ''),
        ),
    }
  }, [character, ctx, sc, racialCantrips])

  if (!sc) return null

  const prepares = sc.perClass.some((row) => row.preparesSpells)
  const known = prepares ? character.spells.prepared : character.spells.known
  const knownField = prepares ? 'prepared' : 'known'

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const toggleKnown = (value: string) =>
    patch({
      spells: { ...character.spells, [knownField]: toggle(known, value) },
    })

  const toggleCantrip = (value: string) =>
    patch({ spells: { ...character.spells, cantrips: toggle(character.spells.cantrips, value) } })

  const setSpent = (level: number, value: number) =>
    patch({
      spells: {
        ...character.spells,
        slots: {
          spent: {
            ...character.spells.slots.spent,
            [level]: Math.max(0, Math.min(sc.slots[level] ?? 0, value)),
          },
        },
      },
    })

  const matches = (index: string) => {
    const spell = ctx.spell.get(index)
    if (!spell) return false
    if (!filter) return true
    return spell.name.toLowerCase().includes(filter.toLowerCase())
  }

  const blocked = alignmentBlockedSpells(character, ctx)
  const grantedCantrips = [...racialCantrips]
    .map((index) => ctx.spell.get(index))
    .filter((spell): spell is NonNullable<typeof spell> => Boolean(spell))

  return (
    <>
      <Card title="Spells">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span>
            <Tip text="Spell save DC = 8 + proficiency bonus + spellcasting ability modifier.">
              Save DC {sc.numbers.saveDc}
            </Tip>
          </span>
          <span>
            <Tip text="Spell attack modifier = proficiency bonus + spellcasting ability modifier.">
              Attack {sc.numbers.attackBonus >= 0 ? '+' : ''}
              {sc.numbers.attackBonus}
            </Tip>
          </span>
          <span>Ability {sc.numbers.ability.toUpperCase()}</span>
          <span className="text-muted">
            {prepares
              ? sc.perClass.some((row) => row.entry.classIndex === 'wizard')
                ? 'Prepares from its spellbook; the builder lists every wizard spell.'
                : 'Prepares from its class list.'
              : `Knows ${character.spells.known.length} of ${sc.fixedSpellsKnown} fixed spells.`}
          </span>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-9">
          {Object.entries(sc.slots)
            .filter(([, total]) => total > 0)
            .map(([level, total]) => (
              <label key={level} className="text-center text-sm">
                <span className="block text-xs uppercase text-muted">Level {level}</span>
                <input
                  type="number"
                  min={0}
                  max={total}
                  value={character.spells.slots.spent[Number(level)] ?? 0}
                  onChange={(e) => setSpent(Number(level), Number(e.target.value))}
                  className="w-full rounded border border-line px-2 py-1 text-center"
                />
                <span className="text-xs text-muted">of {total} left</span>
              </label>
            ))}
        </div>

        <h3 className="mb-1 text-sm font-semibold">
          <Tip text="At each level in a class, you gain one or more cantrips. The number of cantrips you know is given in the class table.">
            Cantrips ({character.spells.cantrips.length}/{sc.cantripsKnown})
          </Tip>
        </h3>
        <div className="mb-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {pool.cantrips.map((index) => (
            <SpellOption
              key={index}
              ctx={ctx}
              index={index}
              checked={character.spells.cantrips.includes(index)}
              atLimit={character.spells.cantrips.length >= sc.cantripsKnown}
              onToggle={toggleCantrip}
            />
          ))}
        </div>
        {grantedCantrips.length ? (
          <p className="mb-3 text-xs text-muted">
            Granted by ancestry:{' '}
            {grantedCantrips.map((spell, i) => (
              <span key={spell.index}>
                {i > 0 ? ', ' : ''}
                <Tip text={spell.desc.join(' ')}>{spell.name}</Tip>
              </span>
            ))}
          </p>
        ) : null}

        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">
            {prepares ? 'Prepared Spells' : 'Spells Known'} ({known.length}
            {prepares ? '' : `/${sc.fixedSpellsKnown}`})
          </h3>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter spells"
            className="rounded border border-line px-2 py-1 text-sm"
          />
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {pool.spells.filter(matches).map((index) => (
            <SpellOption
              key={index}
              ctx={ctx}
              index={index}
              checked={known.includes(index)}
              atLimit={!prepares && known.length >= sc.fixedSpellsKnown}
              onToggle={toggleKnown}
            />
          ))}
        </div>

        {blocked.length ? (
          <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-300">
            {blocked.map((entry) => (
              <p key={entry.spellIndex}>
                <strong>{entry.spellName}</strong> is restricted to:{' '}
                {entry.allowed.join(', ')} alignment.
              </p>
            ))}
          </div>
        ) : null}
      </Card>
    </>
  )
}

/** One selectable spell with its full rule text behind a disclosure. */
function SpellOption({
  ctx,
  index,
  checked,
  atLimit,
  onToggle,
}: {
  ctx: RulesContext
  index: string
  checked: boolean
  atLimit: boolean
  onToggle: (index: string) => void
}) {
  const spell = ctx.spell.get(index)
  if (!spell) return null
  const school = spell.school ? ctx.magicSchool.get(spell.school) : null

  return (
    <details className="rounded border border-line-soft px-2 py-1 text-sm">
      <summary className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          disabled={!checked && atLimit}
          onChange={() => onToggle(index)}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="font-medium">{spell.name}</span>
        <span className="text-xs text-muted">
          {spell.level === 0 ? 'cantrip' : `level ${spell.level}`}
          {school ? ` · ${school.name}` : ''}
        </span>
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {spell.castingTime ? (
          <>
            <dt className="font-semibold">Casting Time</dt>
            <dd>{spell.castingTime}</dd>
          </>
        ) : null}
        {spell.range ? (
          <>
            <dt className="font-semibold">Range</dt>
            <dd>{spell.range}</dd>
          </>
        ) : null}
        {spell.components.length ? (
          <>
            <dt className="font-semibold">Components</dt>
            <dd>
              {spell.components.join(', ')}
              {spell.material ? ` (${spell.material})` : ''}
            </dd>
          </>
        ) : null}
        {spell.duration ? (
          <>
            <dt className="font-semibold">Duration</dt>
            <dd>
              {spell.duration}
              {spell.concentration ? ' (concentration)' : ''}
            </dd>
          </>
        ) : null}
        {spell.ritual ? (
          <>
            <dt className="font-semibold">Ritual</dt>
            <dd>Yes</dd>
          </>
        ) : null}
        {spell.attackType ? (
          <>
            <dt className="font-semibold">Attack</dt>
            <dd>{spell.attackType}</dd>
          </>
        ) : null}
        <div className="col-span-2 mt-1 whitespace-pre-line">{spell.desc.join('\n\n')}</div>
        {spell.higherLevel.length ? (
          <div className="col-span-2 whitespace-pre-line">
            <span className="font-semibold">At Higher Levels: </span>
            {spell.higherLevel.join(' ')}
          </div>
        ) : null}
      </dl>
    </details>
  )
}
