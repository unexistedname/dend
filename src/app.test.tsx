/**
 * Smoke test: the real shell, views and generated dataset render without throwing.
 *
 * Server rendering is enough here — no DOM is needed to prove the component tree
 * and the dataset agree. The shell is rendered in its initial (empty) state because
 * `renderToString` reads zustand's initial snapshot by design; the views are driven
 * straight from a freshly created character for the same reason.
 */
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { App } from './App'
import { Builder } from './views/Builder'
import { Sheet } from './views/Sheet'
import { Proficiencies } from './views/builder/Proficiencies'
import { rulesContext } from './lib/rulesContext'
import { createCharacter } from './state/schema'

describe('app shell', () => {
  it('renders the empty state when there is no character', () => {
    const html = renderToString(<App ctx={rulesContext} />)
    expect(html).toContain('Nothing selected')
    expect(html).toContain('No characters yet')
  })

  it('renders the builder for a fresh character', () => {
    const character = createCharacter({ name: 'Smoke' })
    const html = renderToString(<Builder character={character} ctx={rulesContext} />)
    expect(html).toContain('Smoke')
    expect(html).toContain('Rule Check')
    expect(html).toContain('Ability Scores')
    expect(html).toContain('Class Skills')
    expect(html).toContain('Equipment')
  })

  it('renders the sheet for a fresh character', () => {
    const character = createCharacter({ name: 'Smoke' })
    const html = renderToString(<Sheet character={character} ctx={rulesContext} />)
    expect(html).toContain('Smoke')
    expect(html).toContain('Combat')
    expect(html).toContain('Proficiencies &amp; Languages')
    expect(html).toContain('Rule Check')
  })

  it('keeps picked background languages visible so they can be un-toggled', () => {
    const character = createCharacter({ name: 'Sage' })
    character.backgroundIndex = 'sage'
    character.backgroundLanguages = ['dwarvish', 'elvish']
    const html = renderToString(
      <Proficiencies character={character} ctx={rulesContext} patch={() => {}} />,
    )
    expect(html).toContain('Dwarvish')
    expect(html).toContain('Elvish')
  })
})
