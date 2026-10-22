import { describe, expect, it, beforeEach } from 'vitest'
import { useCharacterStore, type CharacterStore } from './store'
import { serialize, unsupportedVersion } from '../export/json'
import type { Character } from './schema'

/** Fresh state before each test so ordering does not leak between tests. */
function reset(overrides: Partial<CharacterStore> = {}): void {
  useCharacterStore.setState(
    {
      characters: [],
      activeId: null,
      error: null,
      ...overrides,
    },
    false,
  )
}

describe('character store', () => {
  beforeEach(() => reset())

  it('creates a character and selects it', () => {
    const id = useCharacterStore.getState().create({ name: 'Thorn' })
    const state = useCharacterStore.getState()
    expect(state.activeId).toBe(id)
    expect(state.activeCharacter()?.name).toBe('Thorn')
    expect(state.activeCharacter()?.classes[0]).toMatchObject({ classIndex: 'fighter', level: 1 })
  })

  it('updates a character fully through the schema', () => {
    const id = useCharacterStore.getState().create({ name: 'Thorn' })
    useCharacterStore.getState().update(id, (c) => ({ ...c, name: 'Thorn Oakleaf', notes: 'Drinks ale.' }))
    const updated = useCharacterStore.getState().activeCharacter()
    expect(updated?.name).toBe('Thorn Oakleaf')
    expect(updated?.notes).toBe('Drinks ale.')
  })

  it('keeps the previous value when an update would break the schema', () => {
    const id = useCharacterStore.getState().create({ name: 'Thorn' })
    const before = useCharacterStore.getState().activeCharacter()

    // `classes` has a `.min(1)`, so an empty list is a shape violation the schema catches.
    useCharacterStore
      .getState()
      .update(id, (c) => ({ ...c, classes: [] }) as Character)

    const after = useCharacterStore.getState().activeCharacter()
    expect(after?.name).toBe(before?.name)
    expect(after?.classes[0].classIndex).toBe('fighter')
  })

  it('deletes a character and falls back to the first remaining', () => {
    const a = useCharacterStore.getState().create({ name: 'A' })
    const b = useCharacterStore.getState().create({ name: 'B' })
    useCharacterStore.getState().select(a)
    useCharacterStore.getState().remove(a)
    const state = useCharacterStore.getState()
    expect(state.characters).toHaveLength(1)
    expect(state.activeId).toBe(b)
  })

  it('duplicates a character into a new id with a (copy) suffix', () => {
    const id = useCharacterStore.getState().create({ name: 'Thorn' })
    const copyId = useCharacterStore.getState().duplicate(id)
    const state = useCharacterStore.getState()
    expect(copyId).not.toBe(id)
    expect(state.characters).toHaveLength(2)
    expect(state.activeCharacter()?.name).toBe('Thorn (copy)')
  })

  it('imports valid characters and reports rejected ones', () => {
    useCharacterStore.getState().create({ name: 'Thorn' })
    useCharacterStore.getState().create({ name: 'Ash' })
    const payload = serialize([
      ...useCharacterStore.getState().characters,
      { name: 'broken' } as Character,
    ])

    reset()
    const result = useCharacterStore.getState().importCharacters(JSON.parse(payload))

    expect(result.added).toBe(2)
    expect(result.rejected).toBe(1)
    expect(useCharacterStore.getState().characters.map((c) => c.name).sort()).toEqual(['Ash', 'Thorn'])
    expect(useCharacterStore.getState().error).toContain('1 character')
  })

  it('imports the same file twice without id collisions', () => {
    const id = useCharacterStore.getState().create({ name: 'Thorn' })
    const payload = serialize([useCharacterStore.getState().characters.find((c) => c.id === id)!])

    useCharacterStore.getState().importCharacters(JSON.parse(payload))
    useCharacterStore.getState().importCharacters(JSON.parse(payload))

    const ids = useCharacterStore.getState().characters.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('surfaces an empty future export and flags its version', () => {
    reset()
    const result = useCharacterStore.getState().importCharacters({
      app: 'dend',
      version: 99,
      characters: [],
    })
    expect(result).toMatchObject({ added: 0, rejected: 0 })
    expect(useCharacterStore.getState().error).toContain('No characters')
    expect(unsupportedVersion({ app: 'dend', version: 99 })).toBe(true)
    expect(unsupportedVersion({ app: 'dend', version: 1 })).toBe(false)
  })

  it('stores plain data round-trip through JSON', () => {
    const id = useCharacterStore.getState().create({ name: 'Vex', alignmentIndex: 'chaotic-evil' })
    const character = useCharacterStore.getState().characters.find((c) => c.id === id)!
    const reparsed = JSON.parse(serialize([character])) as { characters: Character[] }
    expect(reparsed.characters[0].name).toBe('Vex')
    expect(reparsed.characters[0].alignmentIndex).toBe('chaotic-evil')
  })

  it('duplicate keeps the source selectable and rejects unknown ids', () => {
    expect(useCharacterStore.getState().duplicate('missing-id')).toBeNull()
    useCharacterStore.getState().select('missing-id')
    expect(useCharacterStore.getState().activeId).toBeNull()
  })
})