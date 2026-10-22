/**
 * Character list and current selection, persisted to localStorage.
 *
 * Every write goes through `characterSchema`, so a corrupted or hand-edited payload
 * can never reach the UI: a bad entry is dropped and the rest still load. Saving is
 * debounced because the builder writes on every keystroke and localStorage is
 * synchronous on the main thread.
 *
 * The store holds the *persisted* state only. Derived values come from
 * `rules/derived.ts` at render time, so there is one source of truth for them.
 */
import { create } from 'zustand'
import { characterSchema, createCharacter, type Character, type CharacterOverrides } from './schema'

const STORAGE_KEY = 'dend.characters.v1'
const ACTIVE_KEY = 'dend.active.v1'
const SAVE_DELAY_MS = 250

/** Anything that fails validation is dropped rather than repaired. */
function readStoredCharacters(raw: string | null): Character[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const characters: Character[] = []
    for (const candidate of parsed) {
      const result = characterSchema.safeParse(candidate)
      if (result.success) characters.push(result.data)
    }
    return characters
  } catch {
    return []
  }
}

function readActiveId(raw: string | null): string | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

function write(characters: Character[], activeId: string | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(characters))
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeId))
  } catch {
    // A full or unavailable quota is not worth failing the UI over; the in-memory
    // state stays correct and the next write may succeed.
  }
}

/** Reads once at module load so the first render already sees saved characters. */
function loadInitial(): { characters: Character[]; activeId: string | null } {
  if (typeof localStorage === 'undefined') return { characters: [], activeId: null }

  const characters = readStoredCharacters(localStorage.getItem(STORAGE_KEY))
  const storedActiveId = readActiveId(localStorage.getItem(ACTIVE_KEY))
  const activeId =
    storedActiveId && characters.some((c) => c.id === storedActiveId)
      ? storedActiveId
      : (characters[0]?.id ?? null)

  return { characters, activeId }
}

const initial = loadInitial()

let saveTimer: ReturnType<typeof setTimeout> | undefined
function schedulePersist(characters: Character[], activeId: string | null): void {
  if (typeof localStorage === 'undefined') return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => write(characters, activeId), SAVE_DELAY_MS)
}

/** Flushes any pending save immediately, for navigation and unload handling. */
export function flushPersist(characters: Character[], activeId: string | null): void {
  if (typeof localStorage === 'undefined') return
  clearTimeout(saveTimer)
  write(characters, activeId)
}

export interface CharacterStore {
  characters: Character[]
  activeId: string | null
  /** Set when an import or storage read was rejected, for the UI to surface. */
  error: string | null

  activeCharacter(): Character | null
  create(overrides?: CharacterOverrides): string
  update(id: string, mutate: (current: Character) => Character): void
  remove(id: string): void
  select(id: string): void
  duplicate(id: string): string | null
  importCharacters(payload: unknown): { added: number; rejected: number }
  clearError(): void
}

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  characters: initial.characters,
  activeId: initial.activeId,
  error: null,

  activeCharacter() {
    const { characters, activeId } = get()
    if (!activeId) return null
    return characters.find((c) => c.id === activeId) ?? null
  },

  create(overrides = {}) {
    const character = createCharacter(overrides)
    const next = [...get().characters, character]
    set({ characters: next, activeId: character.id, error: null })
    schedulePersist(next, character.id)
    return character.id
  },

  update(id, mutate) {
    const current = get().characters
    let replaced = false

    const next = current.map((character) => {
      if (character.id !== id) return character
      replaced = true
      const candidate = { ...mutate(character), updatedAt: new Date().toISOString() }
      const parsed = characterSchema.safeParse(candidate)
      // Keep the previous value when a write would break the schema, so an invalid
      // intermediate state can never be persisted.
      return parsed.success ? parsed.data : character
    })

    if (!replaced) return
    set({ characters: next })
    schedulePersist(next, get().activeId)
  },

  remove(id) {
    const next = get().characters.filter((c) => c.id !== id)
    const activeId = get().activeId === id ? (next[0]?.id ?? null) : get().activeId
    set({ characters: next, activeId })
    schedulePersist(next, activeId)
  },

  select(id) {
    if (!get().characters.some((c) => c.id === id)) return
    set({ activeId: id })
    schedulePersist(get().characters, id)
  },

  duplicate(id) {
    const source = get().characters.find((c) => c.id === id)
    if (!source) return null

    const now = new Date().toISOString()
    const copy = characterSchema.parse({
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    })

    const next = [...get().characters, copy]
    set({ characters: next, activeId: copy.id, error: null })
    schedulePersist(next, copy.id)
    return copy.id
  },

  /**
   * Accepts either a bare array of characters or an object wrapping one, matching
   * what `export/export.ts` produces. Everything that fails validation is rejected
   * and reported rather than silently repaired.
   */
  importCharacters(payload) {
    const list = Array.isArray(payload) ? payload : ((payload as { characters?: unknown[] })?.characters ?? [])
    if (!Array.isArray(list)) {
      set({ error: 'That file does not contain characters.' })
      return { added: 0, rejected: 0 }
    }

    const accepted: Character[] = []
    let rejected = 0
    for (const candidate of list) {
      const result = characterSchema.safeParse(candidate)
      if (result.success) accepted.push(result.data)
      else rejected += 1
    }

    if (accepted.length === 0) {
      set({ error: 'No characters in that file could be read.' })
      return { added: 0, rejected }
    }

    // Imported characters get fresh ids so importing the same file twice cannot
    // collide with what is already stored.
    const existing = new Set(get().characters.map((c) => c.id))
    const remapped = accepted.map((character) =>
      existing.has(character.id) ? { ...character, id: crypto.randomUUID() } : character,
    )

    const next = [...get().characters, ...remapped]
    set({
      characters: next,
      error: rejected > 0 ? `${rejected} character(s) could not be read and were skipped.` : null,
    })
    schedulePersist(next, get().activeId)

    return { added: remapped.length, rejected }
  },

  clearError() {
    set({ error: null })
  },
}))

/** Saves pending changes right before the tab goes away. */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const { characters, activeId } = useCharacterStore.getState()
    flushPersist(characters, activeId)
  })
}
