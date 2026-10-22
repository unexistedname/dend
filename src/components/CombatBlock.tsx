/**
 * The combat and proficiency readout, shared by the builder and the sheet so both
 * show exactly what `deriveCharacter` computed.
 */
import type { Character } from '../state/schema'
import type { RulesContext } from '../rules/context'
import { deriveCharacter } from '../rules/derived'
import { formatModifier } from '../rules/abilities'
import { Tip } from './ui'

export function CombatBlock({ character, ctx }: { character: Character; ctx: RulesContext }) {
  const d = deriveCharacter(character, ctx)
  const armor = d.combat.armorClass

  const acTip = [
    armor.armorName
      ? `${armor.armorName} base ${armor.armorBase}`
      : 'Base 10 (no armour)',
    armor.dexBonus ? `+${armor.dexBonus} Dexterity` : null,
    armor.shieldBonus ? `+${armor.shieldBonus} shield` : null,
    armor.itemBonus ? `+${armor.itemBonus} from items` : null,
  ]
    .filter(Boolean)
    .join(', ')

  const stats = [
    {
      label: 'Armor Class',
      value: armor.total,
      tip: acTip,
    },
    {
      label: 'Hit Points',
      value: d.combat.hitPoints.max,
      tip: 'Hit Points: you start with a maximum number of hit points determined by your Hit Die, plus your Constitution modifier.',
    },
    {
      label: 'Speed',
      value: `${d.combat.speed} ft`,
      tip: 'Your walking speed is the base number of feet you can move in a round.',
    },
    {
      label: 'Initiative',
      value: formatModifier(d.combat.initiative),
      tip: 'Add your Dexterity modifier to your initiative rolls.',
    },
    {
      label: 'Proficiency',
      value: formatModifier(d.combat.proficiencyBonus),
      tip: 'Your proficiency bonus is determined by your character level.',
    },
    {
      label: 'Passive Perception',
      value: d.combat.passivePerception,
      tip: 'Passive Perception: 10 + your Wisdom modifier + your proficiency bonus if you are proficient in Perception.',
    },
  ]

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded border border-line-soft bg-night-2 p-2 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted">
              <Tip text={stat.tip}>{stat.label}</Tip>
            </div>
            <div className="font-display text-2xl font-bold text-gold">{stat.value}</div>
          </div>
        ))}
      </div>

      <p className="mt-2 text-sm text-body">
        Hit dice:{' '}
        {d.combat.hitDice.byClass
          .map((entry) => `${entry.count}d${entry.die}`)
          .join(' + ') || '—'}
        {armor.armorName ? ` · wearing ${armor.armorName}` : ''}
        {armor.shieldBonus ? ' · shield +2' : ''}
      </p>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="label-caps mb-1">
            Saving Throws
          </h3>
          <ul className="grid grid-cols-2 gap-x-4 text-sm">
            {d.savingThrows.map((save) => (
              <li key={save.ability} className="flex justify-between border-b border-line-soft py-1">
                <span>{save.ability.toUpperCase()}</span>
                <span className={save.proficient ? 'font-semibold' : 'text-muted'}>
                  {formatModifier(save.total)}
                  {save.proficient ? ' ●' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="label-caps mb-1">
            Skills
          </h3>
          <ul className="grid grid-cols-2 gap-x-4 text-sm">
            {d.skills.map((skill) => (
              <li
                key={skill.skill}
                className="flex justify-between border-b border-line-soft py-1"
              >
                <span className={skill.proficient ? '' : 'text-muted'}>
                  <Tip text={`${skill.ability.toUpperCase()} check; your ${skill.name} bonus.`}>
                    {skill.name}
                  </Tip>
                </span>
                <span className={skill.proficient ? 'font-semibold' : 'text-muted'}>
                  {formatModifier(skill.total)}
                  {skill.proficient ? ' ●' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}
