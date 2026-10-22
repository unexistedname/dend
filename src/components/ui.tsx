/**
 * Small shared controls.
 *
 * Every label that has a rulebook explanation is wrapped in `Tip`, which renders a
 * dotted underline and puts the rulebook text in a native tooltip. Elements with no
 * rulebook text get no decoration, as required: nothing is invented to explain.
 */
import type { ReactNode } from 'react'

/** Shows a rulebook tooltip only when there is real rulebook text to show. */
export function Tip({ text, children }: { text?: string | null; children: ReactNode }) {
  if (!text) return <>{children}</>
  return (
    <span className="tip" title={text}>
      {children}
    </span>
  )
}

export function Card({
  title,
  hint,
  children,
  id,
}: {
  title: string
  hint?: string | null
  children: ReactNode
  id?: string
}) {
  return (
    <section id={id} className="rounded-lg border border-stone-300 bg-white p-4 shadow-sm print-page">
      <h2 className="mb-3 flex items-baseline gap-2 border-b border-stone-200 pb-2 text-sm font-semibold uppercase tracking-wide">
        {title}
        {hint ? (
          <span className="text-xs font-normal normal-case text-stone-500">
            <Tip text={hint}>{hint}</Tip>
          </span>
        ) : null}
      </h2>
      {children}
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string | null
  children: ReactNode
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">
        <Tip text={hint}>{label}</Tip>
      </span>
      {children}
    </label>
  )
}

const control =
  'w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ''}`} />
}

export function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      {...props}
      className={`${control} ${props.className ?? ''}`}
    />
  )
}

export function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; hint?: string | null }[]
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={control}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} title={option.hint ?? undefined}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

/**
 * A checkbox group that enforces `choose`: unchecked boxes beyond the allowance are
 * disabled so the picker cannot create an over-limit state the rules engine would
 * only have to reject.
 */
export function ChoiceList({
  options,
  selected,
  onToggle,
  choose,
  hint,
}: {
  options: { value: string; label: string }[]
  selected: string[]
  onToggle: (value: string) => void
  choose: number
  hint?: string | null
}) {
  const atLimit = selected.length >= choose

  return (
    <div className="grid gap-1 sm:grid-cols-2">
      <p className="text-xs text-stone-600 sm:col-span-2">
        <Tip text={hint}>Choose up to {choose}</Tip>
        {selected.length > 0 ? ` — ${selected.length} selected` : ''}
      </p>
      {options.map((option) => {
        const checked = selected.includes(option.value)
        const blocked = !checked && atLimit
        return (
          <label
            key={option.value}
            className={`flex items-center gap-2 text-sm ${blocked ? 'opacity-50' : ''}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={blocked}
              onChange={() => onToggle(option.value)}
              className="accent-stone-700"
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}
