# 004 — Checkbox and radio press cue

Status: done
Base commit: ba3dd99

## Goal

The builder is mostly checkbox/radio picking, but the controls only change colour. Give a pressed control a short `scale(0.9)` so the click feels tactile, and leave reduced-motion users with the colour-only transition.

## Files

- `src/index.css` only.

## Current code

```css
input[type='checkbox'],
input[type='radio'] {
  ...
  transition-property: background-color, border-color;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
  width: 1rem;
}

input[type='radio'] {
  border-radius: 50%;
}
...
input[type='checkbox']:disabled,
input[type='radio']:disabled {
  background-color: transparent;
  border-color: var(--color-line);
  cursor: not-allowed;
}
...
@media (prefers-reduced-motion: reduce) {
  summary::after,
  details {
    transition: none;
  }
}
```

## Changes

### 1. Add `scale` to the transition

In the shared checkbox/radio rule:

```css
  transition-property: background-color, border-color, scale;
  transition-duration: 150ms, 150ms, 100ms;
  transition-timing-function: ease-out;
```

### 2. Pressed state

Add immediately after the `:disabled` rule:

```css
input[type='checkbox']:not(:disabled):active,
input[type='radio']:not(:disabled):active {
  scale: 0.9;
}
```

`.btn` already uses `0.96`; a 16 px control needs a slightly stronger press to read.

### 3. Reduced-motion fallback

Extend the existing block so the colour transition stays and the scale does not run:

```css
@media (prefers-reduced-motion: reduce) {
  summary::after,
  details {
    transition: none;
  }

  input[type='checkbox'],
  input[type='radio'] {
    transition-property: background-color, border-color;
  }

  input[type='checkbox']:not(:disabled):active,
  input[type='radio']:not(:disabled):active {
    scale: 1;
  }
}
```

## Hard constraints

- Do not change the checked/hover colours, disabled styling, or sizes.
- No dependency, no markup change.
- The `:not(:disabled)` guard mirrors `.btn` and keeps disabled choices static.

## Verification

```
npx tsc -b --noEmit
npx eslint .
npx vitest run
npm run build
```

Orchestrator: hold the mouse down on a class-skill checkbox, confirm computed `scale` is `0.9`; release; confirm `1`. Emulate reduced motion and confirm `scale` stays `1` while the colour still transitions.
