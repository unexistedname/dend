/**
 * Name, ancestry, class, background and alignment.
 *
 * Choosing an option resets whatever depends on it (a new race clears the subrace
 * and the racial picks), so the character is never left pointing at a choice the new
 * base does not offer. Limits such as the subclass's minimum level are applied at
 * selection time; the rules engine still verifies them independently.
 */
import { ABILITY_KEYS } from '../../data/types'
import type { Character, ClassEntry } from '../../state/schema'
import type { RulesContext } from '../../rules/context'
import { Card, ChoiceList, Field, Select, TextInput, Tip } from '../../components/ui'
import { abilityLabels } from '../../state/schema'

interface Props {
  character: Character
  ctx: RulesContext
  patch: (changes: Partial<Character>) => void
}

export function Identity({ character, ctx, patch }: Props) {
  const entry = character.classes[0]
  const race = ctx.race.get(character.raceIndex)
  const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
  const klass = ctx.class.get(entry.classIndex)
  const background = ctx.background.get(character.backgroundIndex)
  const alignment = ctx.alignment.get(character.alignmentIndex)

  const setEntry = (changes: Partial<ClassEntry>) =>
    patch({ classes: [{ ...entry, ...changes }] })

  const chooseRace = (raceIndex: string) => {
    const next = ctx.race.get(raceIndex)
    patch({
      raceIndex,
      subraceIndex: next?.subraceIndexes[0] ?? null,
      variantHuman: false,
      racialAbilityChoices: {},
      racialLanguages: [],
    })
  }

  const chooseClass = (classIndex: string) => {
    // Skill, instrument and tool picks belong to the class that offered them; ASIs
    // belong to the old class's level table; a subclass only exists from its own
    // level — all three reset with the class.
    setEntry({
      classIndex,
      subclassIndex: null,
      subclassLevel: null,
      skillChoices: [],
      instrumentChoices: [],
      toolChoices: [],
      hitDieOverride: null,
      asi: [],
    })
  }

  const chooseLevel = (level: number) => {
    // Recorded ASIs and the subclass must still fit the new level.
    const subclass =
      entry.subclassIndex && (ctx.subclass.get(entry.subclassIndex)?.level ?? 1) <= level
        ? entry.subclassIndex
        : null
    setEntry({
      level,
      asi: entry.asi.filter((asi) => asi.level <= level),
      subclassIndex: subclass,
      subclassLevel: subclass ? ctx.subclass.get(subclass)?.level ?? null : null,
    })
  }

  const chooseSubclass = (subclassIndex: string) => {
    if (!subclassIndex) {
      setEntry({ subclassIndex: null, subclassLevel: null })
      return
    }
    const subclass = ctx.subclass.get(subclassIndex)
    setEntry({ subclassIndex, subclassLevel: subclass?.level ?? null })
  }

  const classOptions = ctx.rules.classes.map((c) => ({
    value: c.index,
    label: c.name,
    hint: `Hit Die d${c.hitDie}`,
  }))

  const subclassEntry = entry.subclassIndex ? ctx.subclass.get(entry.subclassIndex) : null
  const subclassOptions = (klass?.subclassIndexes ?? [])
    .map((index) => ctx.subclass.get(index))
    .filter((subclass): subclass is NonNullable<typeof subclass> => Boolean(subclass))
    .filter((subclass) => entry.level >= (subclass.level ?? 1))
    .map((subclass) => ({ value: subclass.index, label: subclass.name }))

  // Variant Human replaces the plain human +1-to-every-score with +1 to two chosen
  // scores; races such as the Half-Elf offer the same kind of choice.
  const abilityChoiceSource = character.variantHuman
    ? {
        choose: 2,
        options: ABILITY_KEYS.map((ability) => ({ ability, bonus: 1 })),
      }
    : race?.abilityBonusOptions ?? null

  const chosenPicks = Object.entries(character.racialAbilityChoices).filter(
    ([, amount]) => amount > 0,
  )

  const toggleAbilityPick = (ability: string) => {
    const next = { ...character.racialAbilityChoices }
    if (next[ability]) next[ability] = 0
    else next[ability] = abilityChoiceSource?.options.find((o) => o.ability === ability)?.bonus ?? 1
    patch({ racialAbilityChoices: next })
  }

  return (
    <>
      <Card title="Character">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <TextInput
              value={character.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Character name"
            />
          </Field>
          <Field label="Player">
            <TextInput
              value={character.playerName}
              onChange={(e) => patch({ playerName: e.target.value })}
              placeholder="Player name"
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Ancestry"
        hint={race?.traits.length ? 'Racial traits are listed on the sheet.' : null}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Race">
            <Select
              value={character.raceIndex}
              onChange={chooseRace}
              options={ctx.rules.races.map((r) => ({
                value: r.index,
                label: r.name,
                hint: r.sizeDescription,
              }))}
            />
          </Field>

          <Field label="Subrace" hint={subrace?.desc.join(' ') ?? null}>
            <Select
              value={character.subraceIndex ?? ''}
              disabled={!race?.subraceIndexes.length}
              onChange={(value) => patch({ subraceIndex: value || null })}
              options={[
                { value: '', label: race?.subraceIndexes.length ? '—' : 'None available' },
                ...(race?.subraceIndexes ?? []).map((index) => ({
                  value: index,
                  label: ctx.subrace.get(index)?.name ?? index,
                })),
              ]}
            />
          </Field>
        </div>

        {character.raceIndex === 'human' ? (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={character.variantHuman}
              onChange={(e) =>
                patch({ variantHuman: e.target.checked, racialAbilityChoices: {} })
              }
              className="accent-stone-700"
            />
            <Tip text="Two different ability scores of your choice increase by 1, you gain proficiency in one skill of your choice, and you gain one feat of your choice.">
              Variant Human
            </Tip>
          </label>
        ) : null}

        {abilityChoiceSource && (character.variantHuman || race?.abilityBonusOptions) ? (
          <div className="mt-3">
            <ChoiceList
              hint={
                character.variantHuman
                  ? 'Two different ability scores of your choice increase by 1.'
                  : null
              }
              choose={abilityChoiceSource.choose}
              options={abilityChoiceSource.options.map((option) => ({
                value: option.ability,
                label: `${abilityLabels[option.ability]} +${option.bonus}`,
              }))}
              selected={chosenPicks.map(([ability]) => ability)}
              onToggle={toggleAbilityPick}
            />
          </div>
        ) : null}
      </Card>

      <Card title="Class">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Class" hint={klass?.spellcasting ? 'Spellcasting class.' : null}>
            <Select value={entry.classIndex} onChange={chooseClass} options={classOptions} />
          </Field>

          <Field label="Level">
            <Select
              value={String(entry.level)}
              onChange={(value) => chooseLevel(Number(value))}
              options={Array.from({ length: 20 }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              }))}
            />
          </Field>

          <Field label="Subclass" hint={subclassEntry?.flavor ?? null}>
            <Select
              value={entry.subclassIndex ?? ''}
              disabled={subclassOptions.length === 0}
              onChange={chooseSubclass}
              options={[
                { value: '', label: entry.subclassIndex ? '—' : `Not yet available` },
                ...subclassOptions,
              ]}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-stone-600">
          Hit Die d{klass?.hitDie ?? 10}
          {klass?.savingThrows.length
            ? ` · saving throws ${klass.savingThrows
                .map((s) => s.replace('saving-throw-', '').toUpperCase())
                .join(', ')}`
            : ''}
        </p>
      </Card>

      <Card title="Background" hint={background?.feature.name ?? null}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Background">
            <Select
              value={character.backgroundIndex}
              onChange={(value) => patch({ backgroundIndex: value, backgroundLanguages: [] })}
              options={ctx.rules.backgrounds.map((b) => ({
                value: b.index,
                label: b.name,
                hint: b.feature.desc?.join(' ') ?? null,
              }))}
            />
          </Field>

          <Field label="Alignment" hint={alignment?.desc ?? null}>
            <Select
              value={character.alignmentIndex}
              onChange={(value) => patch({ alignmentIndex: value })}
              options={ctx.rules.alignments.map((a) => ({
                value: a.index,
                label: a.name,
                hint: a.desc,
              }))}
            />
          </Field>
        </div>

        <p className="mt-2 text-xs text-stone-600">
          Grants:{' '}
          {background?.skillProficiencies
            .map((skill) => ctx.skill.get(skill.replace('skill-', ''))?.name ?? skill)
            .join(', ') ?? '—'}
          {background?.languages ? ` · ${background.languages} language(s) of your choice` : ''}
        </p>
      </Card>
    </>
  )
}
