/**
 * Equipment: adding items by category (plus a custom entry for anything outside the
 * SRD), equipping, attuning, and the running weight and attunement totals.
 *
 * The rows come from `inventoryRows`, so the names, attunement requirements and
 * "is this actually in the dataset" state are the same ones the rules engine uses.
 */
import { useState } from 'react'
import type { Character } from '../../state/schema'
import type { RulesContext } from '../../rules/context'
import { deriveCharacter, inventoryRows } from '../../rules/derived'
import { Card, Select, TextInput, Tip } from '../../components/ui'

interface Props {
  character: Character
  ctx: RulesContext
  patch: (changes: Partial<Character>) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  gear: 'Gear',
  tool: 'Tool',
  'magic-item': 'Magic Item',
}

export function Equipment({ character, ctx, patch }: Props) {
  const [category, setCategory] = useState('weapon')
  const [picked, setPicked] = useState('')
  const [custom, setCustom] = useState('')

  const d = deriveCharacter(character, ctx)
  const rows = inventoryRows(character, ctx)

  const optionsFor = (kind: string): { value: string; label: string; hint?: string | null }[] => {
    const lists = {
      weapon: ctx.weapon,
      armor: ctx.armor,
      gear: ctx.gear,
      tool: ctx.tool,
      'magic-item': ctx.magicItem,
    } as const
    const list = [...lists[kind as keyof typeof lists].values()]
    return list
      .map((item) => ({
        value: item.index,
        label: item.name,
        hint: 'desc' in item && Array.isArray(item.desc) ? item.desc.join(' ') : null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  const add = (id: string, customName: string | null = null) => {
    if (character.inventory.some((entry) => entry.id === id)) return
    patch({
      inventory: [
        ...character.inventory,
        { id, quantity: 1, attuned: false, equipped: false, customName },
      ],
    })
  }

  const updateEntry = (id: string, changes: Partial<Character['inventory'][number]>) =>
    patch({
      inventory: character.inventory.map((entry) =>
        entry.id === id ? { ...entry, ...changes } : entry,
      ),
    })

  const removeEntry = (id: string) =>
    patch({ inventory: character.inventory.filter((entry) => entry.id !== id) })

  return (
    <Card
      title="Equipment"
      hint="Weight in pounds; you can carry up to your Strength score times 15 pounds."
    >
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Add</span>
          <Select
            value={category}
            onChange={(value) => {
              setCategory(value)
              setPicked('')
            }}
            options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </label>
        <label className="min-w-48 flex-1 text-sm">
          <span className="mb-1 block font-medium">Item</span>
          <Select value={picked} onChange={setPicked} options={optionsFor(category)} />
        </label>
        <button
          type="button"
          disabled={!picked}
          onClick={() => {
            add(`${category}:${picked}`)
            setPicked('')
          }}
          className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 text-sm">
          <span className="mb-1 block font-medium">Custom item (not in the SRD)</span>
          <TextInput
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. Grandfather's warhammer"
          />
        </label>
        <button
          type="button"
          disabled={!custom.trim()}
          onClick={() => {
            const name = custom.trim()
            add(`custom:${name}`, name)
            setCustom('')
          }}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-40"
        >
          Add custom
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-4 text-sm text-stone-700">
        <span>
          <Tip text="Your carrying capacity is your Strength score multiplied by 15 pounds.">
            {d.inventory.weight.carried} / {d.inventory.weight.capacity} lb
          </Tip>
          {d.inventory.weight.encumbered ? ' (encumbered)' : ''}
        </span>
        <span>
          <Tip text="You can be attuned to no more than three magic items at the same time.">
            Attunement {d.inventory.attunement.used}/{d.inventory.attunement.max}
          </Tip>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-stone-600">No equipment yet.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="min-w-40 flex-1">
                <Tip
                  text={
                    row.desc.length
                      ? row.desc.join('\n')
                      : row.known
                        ? null
                        : 'This entry is not in the System Reference Document; the name is stored as written.'
                  }
                >
                  {row.name}
                </Tip>
                <span className="ml-2 text-xs uppercase text-stone-500">{row.kind}</span>
              </span>

              <label className="flex items-center gap-1 text-xs">
                Qty
                <input
                  type="number"
                  min={1}
                  value={row.entry.quantity}
                  onChange={(e) =>
                    updateEntry(row.id, { quantity: Math.max(1, Number(e.target.value)) })
                  }
                  className="w-14 rounded border border-stone-300 px-1 py-0.5 text-center"
                />
              </label>

              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={row.entry.equipped}
                  onChange={(e) => updateEntry(row.id, { equipped: e.target.checked })}
                  className="accent-stone-700"
                />
                Equipped
              </label>

              <label
                className={`flex items-center gap-1 text-xs ${row.requiresAttunement ? '' : 'opacity-40'}`}
              >
                <input
                  type="checkbox"
                  disabled={!row.requiresAttunement}
                  checked={row.entry.attuned}
                  onChange={(e) => updateEntry(row.id, { attuned: e.target.checked })}
                  className="accent-stone-700"
                />
                <Tip
                  text={
                    row.requiresAttunement
                      ? 'Attunement requires you to spend a short rest focused on the item.'
                      : null
                  }
                >
                  Attuned
                </Tip>
              </label>

              <button
                type="button"
                onClick={() => removeEntry(row.id)}
                className="rounded border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-100"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
