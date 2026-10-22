/**
 * Contract for the shared checkbox group: at the limit the *unselected* options are
 * disabled, but the selected ones stay enabled so the pick can be undone — the
 * behaviour the class-skill picker has and the language picker was missing.
 */
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ChoiceList } from './ui'

const options = ['dwarvish', 'elvish', 'orc'].map((value) => ({ value, label: value }))

describe('ChoiceList', () => {
  it('keeps selected options enabled at the limit so they can be un-toggled', () => {
    const html = renderToString(
      <ChoiceList
        options={options}
        selected={['dwarvish', 'elvish']}
        onToggle={() => {}}
        choose={2}
        hint={null}
      />,
    )
    const labels = html.split('<label')
    const picked = labels.find((chunk) => chunk.includes('dwarvish'))
    expect(picked).toBeDefined()
    expect(picked).toContain('checked')
    expect(picked).not.toContain('disabled')
    const remaining = labels.find((chunk) => chunk.includes('orc'))
    expect(remaining).toBeDefined()
    expect(remaining).toContain('disabled')
  })
})
