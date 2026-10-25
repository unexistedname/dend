/**
 * Ability scores: the four PHB methods, live point-buy budget, and the derived
 * breakdown so racial and ASI bonuses are visible rather than silently applied.
 *
 * The inputs edit the *base* score the player chose; everything else comes from the
 * rules engine, which is also what validates the result.
 */
import { useEffect, useRef, useState } from 'react'
import { ABILITY_KEYS, type AbilityKey } from '../../data/types'
import { abilityLabels, type AsiEntry, type Character } from '../../state/schema'
import {
  abilityModifier,
  formatModifier,
  pointBuyRemaining,
  rollAbilityScores,
} from '../../rules/abilities'
import type { RulesContext } from '../../rules/context'
import { deriveCharacter } from '../../rules/derived'
import { Card, Field, NumberInput, Select, Tip } from '../../components/ui'

interface Props {
  character: Character
  ctx: RulesContext
  patch: (changes: Partial<Character>) => void
}

const METHODS = [
  { value: 'point-buy', label: 'Point buy (27 points)' },
  { value: 'standard-array', label: 'Standard array (15, 14, 13, 12, 10, 8)' },
  { value: 'rolled', label: 'Rolled (4d6 drop lowest)' },
  { value: 'manual', label: 'Manual' },
]

const STANDARD = [15, 14, 13, 12, 10, 8]

/** Slot-machine values shown while a real 4d6 result is already stored. */
const previewScores = (): Record<AbilityKey, number> =>
  Object.fromEntries(
    ABILITY_KEYS.map((key) => [key, 8 + Math.floor(Math.random() * 11)]),
  ) as Record<AbilityKey, number>

export function Abilities({ character, ctx, patch }: Props) {
  const derived = deriveCharacter(character, ctx)
  const method = character.abilityMethod.method
  const [preview, setPreview] = useState<Record<AbilityKey, number> | null>(null)
  const [settling, setSettling] = useState(false)
  const rollTimer = useRef<number | null>(null)
  const settleTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (rollTimer.current) window.clearInterval(rollTimer.current)
      if (settleTimer.current) window.clearTimeout(settleTimer.current)
    },
    [],
  )

  const setScore = (ability: AbilityKey, value: number) => {
    if (Number.isNaN(value)) return
    patch({ abilityScores: { ...character.abilityScores, [ability]: value } })
  }

  const useStandardArray = () => {
    const [str, dex, con, int, wis, cha] = STANDARD
    patch({
      abilityScores: { str, dex, con, int, wis, cha },
      abilityMethod: { method: 'standard-array' },
    })
  }

  const applyRolled = () => {
    const rolls = rollAbilityScores()
    const [str, dex, con, int, wis, cha] = rolls
    // Store the result first: the flicker is display-only, so leaving the tab
    // mid-animation still keeps the roll and the rule check never sees previews.
    patch({
      abilityScores: { str, dex, con, int, wis, cha },
      abilityMethod: { method: 'rolled', rolls },
    })

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    if (rollTimer.current) window.clearInterval(rollTimer.current)
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
    setSettling(false)
    setPreview(previewScores())

    const end = Date.now() + 450
    rollTimer.current = window.setInterval(() => {
      if (Date.now() >= end) {
        window.clearInterval(rollTimer.current!)
        rollTimer.current = null
        setPreview(null)
        setSettling(true)
        settleTimer.current = window.setTimeout(() => setSettling(false), 620)
        return
      }
      setPreview(previewScores())
    }, 55)
  }

  const remaining = pointBuyRemaining(ctx, character.abilityScores)
  const overBudget = method === 'point-buy' && remaining < 0

  const entry = character.classes[0]
  const klass = ctx.class.get(entry.classIndex)

  const upsertAsi = (level: number, changes: Omit<AsiEntry, 'level'>) => {
    const asi = entry.asi.some((a) => a.level === level)
      ? entry.asi.map((a) => (a.level === level ? { ...a, ...changes, level } : a))
      : [...entry.asi, { ...changes, level }]
    patch({ classes: [{ ...entry, asi }] })
  }

  const clearAsi = (level: number) =>
    patch({ classes: [{ ...entry, asi: entry.asi.filter((a) => a.level !== level) }] })

  const asiLevels = (klass?.levels ?? [])
    .filter((l) => l.level <= entry.level && l.asiCount > 0)
    .map((l) => l.level)

  return (
    <Card title="Ability Scores">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Method">
          <Select
            value={method}
            onChange={(value) => patch({ abilityMethod: { method: value as typeof method } })}
            options={METHODS}
          />
        </Field>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={useStandardArray}
            className="btn"
          >
            Standard array
          </button>
          <button
            type="button"
            onClick={() => {
              if (!preview) applyRolled()
            }}
            className={`btn ${preview ? 'opacity-50' : ''}`}
            aria-disabled={preview !== null}
          >
            {preview ? 'Rolling…' : 'Roll 4d6'}
          </button>
          {method === 'point-buy' ? (
            <span
              className={`ml-auto text-sm ${overBudget ? 'font-semibold text-red-400' : 'text-muted'}`}
              title="Your ability scores start at 8. You have 27 points to spend."
            >
              {remaining} points left
            </span>
          ) : null}
        </div>
      </div>

      <div
        className={`mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 ${
          preview ? 'dice-rolling' : ''
        } ${settling ? 'dice-settled' : ''}`}
      >
        {ABILITY_KEYS.map((key) => {
          const row = derived.abilities[key]
          const base = preview ? preview[key] : row.base
          const total = preview ? base + row.racial + row.asi : row.total
          return (
            <div key={key} className="ability-card rounded border border-line-soft p-2 text-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                {key}
              </div>
              <NumberInput
                aria-label={abilityLabels[key]}
                value={base}
                min={method === 'point-buy' ? 8 : 1}
                max={method === 'point-buy' ? 15 : 30}
                readOnly={preview !== null}
                onChange={(e) => setScore(key, Number(e.target.value))}
                className="text-center tabular-nums"
              />
              <div className="mt-1 text-lg font-bold">
                {formatModifier(abilityModifier(total))}
              </div>
              <div className="text-[11px] leading-tight text-muted">
                total {total}
                {row.racial ? ` (+${row.racial})` : ''}
                {row.asi ? ` (ASI +${row.asi})` : ''}
              </div>
            </div>
          )
        })}
      </div>

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-line-soft text-left text-xs uppercase text-muted">
            <th className="py-1">Score</th>
            <th className="py-1 text-right">Base</th>
            <th className="py-1 text-right">Racial</th>
            <th className="py-1 text-right">ASI</th>
            <th className="py-1 text-right">Total</th>
            <th className="py-1 text-right">Modifier</th>
          </tr>
        </thead>
        <tbody>
          {ABILITY_KEYS.map((key) => {
            const row = derived.abilities[key]
            return (
              <tr key={key} className="border-b border-line-soft">
                <td className="py-1">{abilityLabels[key]}</td>
                <td className="py-1 text-right">{row.base}</td>
                <td className="py-1 text-right">{row.racial || '—'}</td>
                <td className="py-1 text-right">{row.asi || '—'}</td>
                <td className="py-1 text-right font-semibold">{row.total}</td>
                <td className="py-1 text-right">
                  <Tip text="Your ability modifier is half your ability score minus 10, rounded down.">
                    {formatModifier(row.modifier)}
                  </Tip>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {character.variantHuman ? (
        <AsiRow
          key={`${entry.classIndex}-variant-human`}
          label="Variant Human feat (1st level)"
          current={entry.asi.find((a) => a.level === 1 && a.asiType === 'feat') ?? null}
          allowAbilityMode={false}
          onUpsert={(changes) => upsertAsi(1, changes)}
          onClear={() => clearAsi(1)}
        />
      ) : null}

      {asiLevels.length ? (
        <div className="mt-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Ability Score Improvements
          </h3>
          <p className="mb-2 text-xs text-muted">
            The class table grants one at certain levels; a feat may be taken instead.
          </p>
          <div className="grid gap-2">
            {asiLevels.map((level) => (
              <AsiRow
                key={`${entry.classIndex}-${level}`}
                label={`Level ${level}`}
                current={entry.asi.find(
                  (a) => a.level === level && !(a.asiType === 'feat' && a.level === 1),
                ) ?? null}
                allowAbilityMode
                onUpsert={(changes) => upsertAsi(level, changes)}
                onClear={() => clearAsi(level)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

/**
 * One improvement slot: +2 to one score, +1 to two different scores, or a feat
 * (the feat's text lives in the Player's Handbook, which is not in the SRD, so the
 * name is recorded as written and never explained by the app).
 */
function AsiRow({
  label,
  current,
  allowAbilityMode,
  onUpsert,
  onClear,
}: {
  label: string
  current: AsiEntry | null
  allowAbilityMode: boolean
  onUpsert: (changes: Omit<AsiEntry, 'level'>) => void
  onClear: () => void
}) {
  const [mode, setMode] = useState<'ability' | 'feat'>(
    allowAbilityMode ? (current?.asiType ?? 'ability') : 'feat',
  )

  const bonuses = current?.abilityBonuses ?? {}
  const picked = ABILITY_KEYS.filter((key) => (bonuses[key] ?? 0) > 0)
  const first = picked[0] ?? ''
  const second = picked[1] ?? ''

  const setPair = (a: string, b: string) => {
    if (!a) {
      if (current) onClear()
      return
    }
    const next = a && b && a !== b ? { [a]: 1, [b]: 1 } : { [a]: 2 }
    onUpsert({ abilityBonuses: next, feat: null, asiType: 'ability' })
  }

  const abilityOptions = [
    { value: '', label: '—' },
    ...ABILITY_KEYS.map((key) => ({ value: key, label: abilityLabels[key] })),
  ]

  return (
    <div className="rounded border border-line-soft p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-3">
          {allowAbilityMode ? (
            <label className="flex items-center gap-1 text-xs">
              <input
                type="radio"
                name={`mode-${label}`}
                checked={mode === 'ability'}
                onChange={() => setMode('ability')}
              />
              Ability
            </label>
          ) : null}
          <label className="flex items-center gap-1 text-xs">
            <input
              type="radio"
              name={`mode-${label}`}
              checked={mode === 'feat'}
              onChange={() => setMode('feat')}
            />
            Feat
          </label>
          {current ? (
            <button
              type="button"
              onClick={onClear}
              className="btn text-xs"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {mode === 'feat' ? (
        <input
          type="text"
          value={current?.feat ?? ''}
          onChange={(e) => {
            const name = e.target.value
            if (!name) onClear()
            else onUpsert({ abilityBonuses: {}, feat: name, asiType: 'feat' })
          }}
          placeholder="Feat name (from the Player's Handbook — feats are not in the SRD)"
          className="mt-2 w-full rounded border border-line px-2 py-1 text-sm"
        />
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Select value={first} onChange={(value) => setPair(value, second)} options={abilityOptions} />
          <span className="text-xs text-muted">and</span>
          <Select
            value={second}
            onChange={(value) => setPair(first, value)}
            options={abilityOptions}
          />
          <span className="text-xs text-muted">
            Same score or none = +2; two different scores = +1 each.
          </span>
        </div>
      )}
    </div>
  )
}
