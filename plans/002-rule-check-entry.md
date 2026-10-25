# 002 — Rule Check entry feedback

Status: done
Base commit: `ba3dd99`

## Goal

A newly broken rule should ease in (opacity + 6 px) instead of appearing instantly, and the restored “No rule violations.” line should enter the same way. Existing rows must not re-animate while the user types, and printing must be untouched.

## Files

- `src/components/ConstraintPanel.tsx`
- `src/index.css`

## Current code

`ConstraintPanel.tsx`:

```tsx
  if (!errors.length && !warnings.length && !infos.length) {
    return (
      <p className="text-sm text-emerald-400">
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
```

The component is also rendered on the sheet (`Sheet.tsx:354`), so the animation must be screen-only.

## Changes

### 1. Class names

Success line:

```tsx
      <p className="rule-check-success text-sm text-emerald-400">
```

List wrapper:

```tsx
    <div className="rule-check grid gap-2">
```

Nothing else in the component changes.

### 2. CSS

Append in `src/index.css` after the spell-disclosure block added by plan 003 (or after the `.btn` reduced-motion block if plan 003 is applied later):

```css
/* A new rule violation eases in, and so does the restored all-clear line.
   Existing rows keep their DOM node, so typing never replays the entrance. */
@media screen {
  .rule-check > *,
  .rule-check-success {
    transition: opacity 160ms ease-out;
  }

  @starting-style {
    .rule-check > *,
    .rule-check-success {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .rule-check > *,
    .rule-check-success {
      transition:
        opacity 160ms ease-out,
        translate 160ms ease-out;
    }

    @starting-style {
      .rule-check > *,
      .rule-check-success {
        opacity: 0;
        translate: 0 6px;
      }
    }
  }
}
```

Under reduced motion only the opacity fade remains (no movement), which is the required fallback.

## Why this works

- `@starting-style` applies only when an element is first rendered, so a row added by a new violation animates; rows that merely re-render (typing, reordering) do not.
- The keys are stable (`id-rule`), so no element is recreated on every keystroke.
- The success line is mounted only when the list is empty, so the all-clear also animates.
- No exit animation: a resolved violation disappearing immediately is the feedback.

## Hard constraints

- Screen only (`@media screen`); the printed sheet must never start at `opacity: 0`.
- No JavaScript, no new state, no dependency.
- `prefers-reduced-motion: reduce` keeps opacity only; no translate.
- If `@starting-style` is dropped by the build, stop and report it (do not replace it with a keyframe without approval).

## Verification

```
npx tsc -b --noEmit
npx eslint .
npx vitest run
npm run build
```

Orchestrator: confirm the built CSS still contains `@starting-style` and `.rule-check`; in the browser, create a violation and sample computed `opacity`/`translate` immediately and after ~200 ms; emulate print and check the rows are opaque.
