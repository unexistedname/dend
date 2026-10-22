/**
 * The auto-constraint readout: every rule the character currently breaks, warns
 * about, or has an open question on, each with the verbatim rulebook text that
 * justifies it.
 *
 * Nothing here is phrased by the app; messages come from the rules engine and the
 * quoted text comes from the rulebook.
 */
import type { Character } from '../state/schema'
import type { RulesContext } from '../rules/context'
import { deriveCharacter } from '../rules/derived'
import { Tip } from './ui'

const SEVERITY_STYLE = {
  error: 'border-red-300 bg-red-50 text-red-800',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-sky-300 bg-sky-50 text-sky-900',
} as const

const SEVERITY_LABEL = { error: 'Violation', warning: 'Warning', info: 'Note' } as const

export function ConstraintPanel({
  character,
  ctx,
}: {
  character: Character
  ctx: RulesContext
}) {
  const d = deriveCharacter(character, ctx)
  const { errors, warnings, infos } = d.constraints

  if (!errors.length && !warnings.length && !infos.length) {
    return (
      <p className="text-sm text-emerald-700">
        <Tip text="The character builder checks your choices against the rules of the game.">
          No rule violations.
        </Tip>
      </p>
    )
  }

  return (
    <div className="grid gap-2">
      {[...errors, ...warnings, ...infos].map((violation) => (
        <div
          key={`${violation.id}-${violation.rule}`}
          className={`rounded border px-3 py-2 text-sm ${SEVERITY_STYLE[violation.severity]}`}
        >
          <p>
            <span className="font-semibold">{SEVERITY_LABEL[violation.severity]} · </span>
            <Tip text={violation.rulebookText}>
              <span className="font-semibold">{violation.rule}</span>
            </Tip>
            {' — '}
            {violation.message}
          </p>
          {violation.rulebookText ? (
            <p className="mt-1 border-l-2 border-current/30 pl-2 text-xs italic opacity-90">
              {violation.rulebookText}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
