/**
 * The choices a character must make: class skills, class tools and instruments, and
 * bonus languages.
 *
 * Each picker is bound to the group that offers it, so a pick the rules engine will
 * reject (a skill the class does not offer) cannot be created here. The remaining
 * rule check still verifies the counts independently.
 */
import type { Character, ClassEntry } from '../../state/schema'
import type { RulesContext } from '../../rules/context'
import { Card, ChoiceList } from '../../components/ui'

interface Props {
  character: Character
  ctx: RulesContext
  patch: (changes: Partial<Character>) => void
}

const skillName = (index: string, ctx: RulesContext) =>
  ctx.skill.get(index.replace('skill-', ''))?.name ?? index.replace('skill-', '')

export function Proficiencies({ character, ctx, patch }: Props) {
  const entry = character.classes[0]
  const klass = ctx.class.get(entry.classIndex)
  const background = ctx.background.get(character.backgroundIndex)
  const race = ctx.race.get(character.raceIndex)

  const setEntry = (changes: Partial<ClassEntry>) =>
    patch({ classes: [{ ...entry, ...changes }] })

  const toggleInto = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const backgroundLanguageOptions = ctx.rules.languages.map((language) => ({
    value: language.index,
    label: language.name,
    hint: language.desc[0],
  }))

  return (
    <>
      <Card title="Class Skills">
        {(klass?.skillChoices ?? []).map((group, groupIndex) => (
          <div key={groupIndex} className="mb-3 last:mb-0">
            <ChoiceList
              hint={group.desc}
              choose={group.choose}
              options={group.options.map((option) => ({
                value: option,
                label: skillName(option, ctx),
              }))}
              selected={entry.skillChoices}
              onToggle={(value) =>
                setEntry({ skillChoices: toggleInto(entry.skillChoices, value) })
              }
            />
          </div>
        ))}
        {klass?.skillChoices.length === 0 ? (
          <p className="text-sm text-stone-600">This class grants no skill choices.</p>
        ) : null}
      </Card>

      <Card title="Tools and Instruments">
        {(klass?.instrumentChoices ?? []).length === 0 &&
        (klass?.toolChoices ?? []).length === 0 ? (
          <p className="text-sm text-stone-600">This class grants no tool choices.</p>
        ) : (
          <>
            {(klass?.instrumentChoices ?? []).map((group, groupIndex) => (
              <div key={`i${groupIndex}`} className="mb-3 last:mb-0">
                <ChoiceList
                  hint={group.desc}
                  choose={group.choose}
                  options={group.options.map((option) => ({
                    value: option,
                    label: option.replace(/-/g, ' '),
                  }))}
                  selected={entry.instrumentChoices}
                  onToggle={(value) =>
                    setEntry({
                      instrumentChoices: toggleInto(entry.instrumentChoices, value),
                    })
                  }
                />
              </div>
            ))}
            {(klass?.toolChoices ?? []).map((group, groupIndex) => (
              <div key={`t${groupIndex}`} className="mb-3 last:mb-0">
                <ChoiceList
                  hint={group.desc}
                  choose={group.choose}
                  options={group.options.map((option) => ({
                    value: option,
                    label: option.replace(/-/g, ' '),
                  }))}
                  selected={entry.toolChoices}
                  onToggle={(value) => setEntry({ toolChoices: toggleInto(entry.toolChoices, value) })}
                />
              </div>
            ))}
          </>
        )}
      </Card>

      <Card title="Languages">
        {background && background.languages > 0 ? (
          <div className="mb-3">
            <ChoiceList
              hint={`${background.name} grants ${background.languages} language(s) of your choice.`}
              choose={background.languages}
              options={backgroundLanguageOptions}
              selected={character.backgroundLanguages}
              onToggle={(value) =>
                patch({ backgroundLanguages: toggleInto(character.backgroundLanguages, value) })
              }
            />
          </div>
        ) : null}

        {race?.languageOptions ? (
          <ChoiceList
            hint={`${race.name} grants ${race.languageOptions.choose} language(s) of your choice.`}
            choose={race.languageOptions.choose}
            options={race.languageOptions.options.map((index) => ({
              value: index,
              label: ctx.language.get(index)?.name ?? index,
            }))}
            selected={character.racialLanguages}
            onToggle={(value) =>
              patch({ racialLanguages: toggleInto(character.racialLanguages, value) })
            }
          />
        ) : null}

        {!background?.languages && !race?.languageOptions ? (
          <p className="text-sm text-stone-600">
            No bonus languages to choose for this combination.
          </p>
        ) : null}
      </Card>
    </>
  )
}
