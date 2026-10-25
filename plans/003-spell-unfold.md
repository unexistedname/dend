# 003 — Spell explanations unfold

Status: done
Base commit: `ba3dd99`

## Goal

The spell row’s chevron already rotates over 150 ms, but the explanation snaps open and the row jumps. Make the disclosure grow/collapse over 200 ms so the motion and the content agree. Browsers without `::details-content` must keep the native instant open.

## Files

- `src/index.css` only.

Only spell rows use `<details>` (`src/views/builder/Spells.tsx:228`), so a global `details` rule is safe.

## Current code

```css
summary::after {
  ...
  rotate: -45deg;
  transition: rotate 150ms ease-out;
}

details[open] > summary::after {
  rotate: 135deg;
}

details {
  transition: border-color 150ms ease-out;
}
```

## Change

Add in `src/index.css` immediately after the existing `@media (prefers-reduced-motion: reduce)` block for `summary::after`/`details` (the block that currently ends with `}` after `details { transition: none; }`):

```css
/* Spell explanations unfold instead of snapping; a browser without
   ::details-content keeps the native instant open. */
@media screen {
  details {
    interpolate-size: allow-keywords;
  }

  details::details-content {
    block-size: 0;
    opacity: 0;
    overflow-y: hidden;
    transition:
      block-size 200ms ease-out,
      opacity 160ms ease-out,
      content-visibility 200ms allow-discrete;
  }

  details[open]::details-content {
    block-size: auto;
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    details::details-content {
      transition: none;
    }
  }
}
```

## Hard constraints

- `@media screen` only: printing a sheet while a disclosure is mid-animation must not clip its text. Do not add this to the print block.
- No JavaScript, no markup change, no dependency.
- The chevron’s existing 150 ms rotation is unchanged.
- `interpolate-size: allow-keywords` is the only way `block-size: auto` can interpolate; if the build drops it, the panel simply opens instantly (acceptable fallback, do not replace with a JS height animation).

## Verification

```
npx tsc -b --noEmit
npx eslint .
npx vitest run
npm run build
```

Orchestrator: open a spell, sample `getComputedStyle(details, '::details-content').blockSize` over ~250 ms (0 → growing → used height), confirm no text is clipped after the transition, and emulate print with a spell open to confirm the full description is present.
