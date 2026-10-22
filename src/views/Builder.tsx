/**
 * The build view: every choice a character can make, in sheet order, with the rule
 * check pinned at the top so violations surface as soon as a choice creates them.
 */
import type { Character } from '../state/schema'
import type { RulesContext } from '../rules/context'
import { useCharacterStore } from '../state/store'
import { Card } from '../components/ui'
import { CombatBlock } from '../components/CombatBlock'
import { ConstraintPanel } from '../components/ConstraintPanel'
import { Identity } from './builder/Identity'
import { Abilities } from './builder/Abilities'
import { Proficiencies } from './builder/Proficiencies'
import { Spells } from './builder/Spells'
import { Equipment } from './builder/Equipment'

export function Builder({ character, ctx }: { character: Character; ctx: RulesContext }) {
  const update = useCharacterStore((state) => state.update)
  const patch = (changes: Partial<Character>) => update(character.id, (current) => ({ ...current, ...changes }))

  return (
    <div className="grid gap-4">
      <Card
        title="Rule Check"
        hint="Every entry is checked against the Player's Handbook as you build."
      >
        <ConstraintPanel character={character} ctx={ctx} />
      </Card>

      <Identity character={character} ctx={ctx} patch={patch} />
      <Abilities character={character} ctx={ctx} patch={patch} />
      <Proficiencies character={character} ctx={ctx} patch={patch} />

      <Card title="Combat">
        <CombatBlock character={character} ctx={ctx} />
      </Card>

      <Spells character={character} ctx={ctx} patch={patch} />
      <Equipment character={character} ctx={ctx} patch={patch} />

      <Card title="Notes">
        <textarea
          value={character.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={4}
          maxLength={5000}
          className="w-full rounded border border-line p-2 text-sm"
          placeholder="Background, personality, anything the sheet does not cover."
        />
        <p className="mt-1 text-xs text-muted">{character.notes.length}/5000</p>
      </Card>
    </div>
  )
}
