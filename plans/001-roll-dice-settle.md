# 001 — “Roll 4d6” settle animation

Status: done
Base commit: `ba3dd99`

## Goal

Clicking **Roll 4d6** should feel like rolling dice: the six score boxes flicker preview numbers for ~450 ms, then the six cards pop in a 40 ms stagger. The roll is written to the store exactly once, immediately, so the rules engine never sees intermediate scores and switching tabs mid-animation cannot lose the result.

## Files

- `src/views/builder/Abilities.tsx`
- `src/index.css`

Do not change `rollAbilityScores`, the store, the schema, or the sheet.

## Current code

`Abilities.tsx`:

```tsx
import { useState } from 'react'
...
export function Abilities({ character, ctx, patch }: Props) {
  const derived = deriveCharacter(character, ctx)
  const method = character.abilityMethod.method
...
  const useRolled = () => {
    const rolls = rollAbilityScores()
    const [str, dex, con, int, wis, cha] = rolls
    patch({
      abilityScores: { str, dex, con, int, wis, cha },
      abilityMethod: { method: 'rolled', rolls },
    })
  }
...
          <button
            type="button"
            onClick={useRolled}
            className="btn"
          >
            Roll 4d6
          </button>
...
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {ABILITY_KEYS.map((key) => {
          const row = derived.abilities[key]
          return (
            <div key={key} className="rounded border border-line-soft p-2 text-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                {key}
              </div>
              <NumberInput
                aria-label={abilityLabels[key]}
                value={character.abilityScores[key]}
                min={method === 'point-buy' ? 8 : 1}
                max={method === 'point-buy' ? 15 : 30}
                onChange={(e) => setScore(key, Number(e.target.value))}
                className="text-center"
              />
              <div className="mt-1 text-lg font-bold">
                {formatModifier(abilityModifier(row.total))}
              </div>
              <div className="text-[11px] leading-tight text-muted">
                total {row.total}
                {row.racial ? ` (+${row.racial})` : ''}
                {row.asi ? ` (ASI +${row.asi})` : ''}
              </div>
            </div>
          )
        })}
      </div>
```

## Changes

### 1. Imports

```tsx
import { useEffect, useRef, useState } from 'react'
```

### 2. Preview helper (module level, after `const STANDARD = ...`)

```tsx
/** Slot-machine values shown while a real 4d6 result is already stored. */
const previewScores = (): Record<AbilityKey, number> =>
  Object.fromEntries(
    ABILITY_KEYS.map((key) => [key, 8 + Math.floor(Math.random() * 11)]),
  ) as Record<AbilityKey, number>
```

`AbilityKey` is already imported in this file.

### 3. State, timers, cleanup

Insert directly after `const method = character.abilityMethod.method`:

```tsx
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
```

### 4. Replace `useRolled`

```tsx
  const useRolled = () => {
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
```

### 5. Button

```tsx
          <button
            type="button"
            onClick={() => {
              if (!preview) useRolled()
            }}
            className={`btn ${preview ? 'opacity-50' : ''}`}
            aria-disabled={preview !== null}
          >
            {preview ? 'Rolling…' : 'Roll 4d6'}
          </button>
```

The button stays focusable on purpose (`aria-disabled` + guard, not `disabled`), so keyboard focus is not lost.

### 6. Grid, card, values

```tsx
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
```

### 7. CSS

Append in `src/index.css` immediately after the existing `.btn` reduced-motion block (after the rule that sets `.btn:not(:disabled):active { scale: 1 }`), before the `/* Character sheet ... */` section:

```css
/* “Roll 4d6”: the cards flicker previews, then settle one after another. */
@keyframes dice-settle {
  0%,
  100% {
    scale: 1;
  }
  45% {
    scale: 1.06;
  }
}

@media screen and (prefers-reduced-motion: no-preference) {
  .ability-card {
    transition: border-color 150ms ease-out;
  }

  .dice-rolling .ability-card {
    border-color: var(--color-gold);
  }

  .dice-settled .ability-card {
    animation: dice-settle 320ms ease-out both;
  }

  .dice-settled .ability-card:nth-child(2) {
    animation-delay: 40ms;
  }

  .dice-settled .ability-card:nth-child(3) {
    animation-delay: 80ms;
  }

  .dice-settled .ability-card:nth-child(4) {
    animation-delay: 120ms;
  }

  .dice-settled .ability-card:nth-child(5) {
    animation-delay: 160ms;
  }

  .dice-settled .ability-card:nth-child(6) {
    animation-delay: 200ms;
  }
}
```

## Hard constraints

- No `window`/`matchMedia`/timers during render: the SSR test calls `renderToString(<Builder />)`, and `window` does not exist there.
- Reduced motion: store the roll and return; no preview, no timers.
- Exactly one `patch()` per roll, before the animation.
- Print is unaffected (CSS is screen-scoped; the builder is never printed).
- No new dependency.

## Verification

```
npx tsc -b --noEmit
npx eslint .
npx vitest run
npm run build
```

Then the orchestrator verifies in the browser: the six inputs change during the roll, the button reads “Rolling…”, the stored scores equal the final inputs, the rule check never reports a temporary score, and the class `dice-settled` is removed afterwards. With reduced motion emulated, the values change in one step.

## Deviation

The executor renamed `useRolled` to `applyRolled`: ESLint's `react-hooks/rules-of-hooks` rejects calling a `use*`-named function from the click handler. The store write order, timing, and CSS are unchanged.
