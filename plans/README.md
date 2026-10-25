# Animation plans

Base commit: `ba3dd99`

All four plans are independent in behaviour but edit `src/index.css`, so apply them in the order below. No dependency is added; motion is CSS + one local React state in `Abilities.tsx`.

| Plan | Status | Files | Depends on |
| --- | --- | --- | --- |
| [001 — Roll 4d6 settle](001-roll-dice-settle.md) | done | `src/views/builder/Abilities.tsx`, `src/index.css` | — |
| [002 — Rule Check entry](002-rule-check-entry.md) | done | `src/components/ConstraintPanel.tsx`, `src/index.css` | 003 (only for the CSS insertion point) |
| [003 — Spell unfold](003-spell-unfold.md) | done | `src/index.css` | — |
| [004 — Checkbox press](004-checkbox-press.md) | done | `src/index.css` | — |

## Execution order

1. 003 (details rule)
2. 001 (dice rule)
3. 002 (rule-check rule, after 003)
4. 004 (input rule edits)

## Shared constraints

- `prefers-reduced-motion`: movement is removed; opacity may remain. The dice roll commits instantly.
- Print: the new sheet/motion CSS is `@media screen` only. The hand-tuned `@media print` block must not change.
- SSR: `vitest` renders the app with `renderToString`; no `window`, timers, or `matchMedia` during render.
- No new dependency, no `transition: all`, no animation on hover or on high-frequency typing.
- Verification for every plan: `npx tsc -b --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build`, plus the browser checks listed in the plan.
