/**
 * Shell: character list, the import/export/print actions, and the Build ⇄ Sheet
 * switch. The rules dataset is loaded once in `lib/rulesContext` and passed down,
 * so every view reads from the same context object.
 */
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { RulesContext } from './rules/context'
import type { Character } from './state/schema'
import { useCharacterStore } from './state/store'
import { characterToMarkdown } from './export/markdown'
import { download, downloadMarkdown } from './export/json'
import { deriveCharacter } from './rules/derived'
import { Builder } from './views/Builder'
import { Sheet } from './views/Sheet'

export function App({ ctx }: { ctx: RulesContext }) {
  const characters = useCharacterStore((state) => state.characters)
  const activeId = useCharacterStore((state) => state.activeId)
  const error = useCharacterStore((state) => state.error)
  const store = useCharacterStore.getState

  const active = characters.find((character) => character.id === activeId) ?? null
  const [tab, setTab] = useState<'build' | 'sheet'>('build')
  const fileInput = useRef<HTMLInputElement>(null)

  // The window title follows the character so printed PDFs are named after it.
  useEffect(() => {
    document.title = active ? `${active.name || 'Unnamed'} — dend` : 'dend'
  }, [active])

  const onImportFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        store().importCharacters(JSON.parse(String(reader.result)))
      } catch {
        store().importCharacters(null)
      }
      if (fileInput.current) fileInput.current.value = ''
    }
    reader.readAsText(file)
  }

  const action = 'btn'
  const tabButton = (value: 'build' | 'sheet', label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setTab(value)}
      className={`rounded px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.08em] transition-colors duration-150 ${
        tab === value ? 'bg-brand text-white' : 'text-muted hover:bg-panel-2 hover:text-parchment'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-night text-body">
      <header className="no-print sticky top-0 z-10 border-b border-line bg-night/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5">
          <h1 className="mr-1 flex items-center gap-2 text-xl font-bold">
            <span className="grid h-8 w-8 place-items-center rounded bg-brand font-brand text-base text-white shadow-[0_0_18px_rgb(228_7_18_/_0.4)]">
              D
            </span>
            <span className="font-brand tracking-normal">dend</span>
          </h1>
          <span className="mr-auto text-[11px] uppercase tracking-[0.18em] text-gold">
            D&amp;D 5e &middot; 2014 rules
          </span>

          <div className="flex rounded border border-line bg-night-2 p-0.5">
            {tabButton('build', 'Build')}
            {tabButton('sheet', 'Sheet')}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => useCharacterStore.getState().create()}
            >
              New
            </button>
            <button
              type="button"
              className={action}
              disabled={!active}
              onClick={() => active && useCharacterStore.getState().duplicate(active.id)}
            >
              Duplicate
            </button>
            <button
              type="button"
              className={action}
              disabled={!active}
              onClick={() => {
                if (!active) return
                if (window.confirm(`Delete ${active.name || 'this character'}?`)) {
                  useCharacterStore.getState().remove(active.id)
                }
              }}
            >
              Delete
            </button>
            <button type="button" className={action} onClick={() => fileInput.current?.click()}>
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => onImportFile(e.target.files?.[0])}
            />
            <button
              type="button"
              className={action}
              disabled={!active}
              onClick={() =>
                active && downloadMarkdown(characterToMarkdown(active, ctx), `${slug(active.name)}.md`)
              }
            >
              Export MD
            </button>
            <button
              type="button"
              className={action}
              disabled={!active}
              onClick={() => active && download([active])}
            >
              Export JSON
            </button>
            <button
              type="button"
              className={action}
              disabled={!active}
              onClick={() => {
                // Printing is for the finished sheet, not the form.
                flushSync(() => setTab('sheet'))
                window.print()
              }}
            >
              Print
            </button>
          </div>
        </div>

        {error ? (
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 bg-red-500/10 px-4 py-1.5 text-sm text-red-300">
            <span>{error}</span>
            <button type="button" className="text-xs underline" onClick={() => useCharacterStore.getState().clearError()}>
              Dismiss
            </button>
          </div>
        ) : null}
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row">
        <aside className="no-print w-full shrink-0 sm:w-56">
          <nav className="rounded border border-line bg-panel p-2 shadow-[0_1px_2px_rgb(0_0_0_/_0.45)]">
            <h2 className="label-caps px-1 py-1">Characters</h2>
            <ul className="grid gap-0.5">
              {characters.map((character) => (
                <li key={character.id}>
                  <button
                    type="button"
                    onClick={() => useCharacterStore.getState().select(character.id)}
                    className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors duration-150 ${
                      character.id === activeId
                        ? 'bg-panel-2 text-parchment shadow-[inset_3px_0_0_var(--color-brand)]'
                        : 'hover:bg-panel-2'
                    }`}
                  >
                    <span className="block truncate font-medium">{character.name || 'Unnamed'}</span>
                    <span className="block truncate text-xs text-muted">{summary(character, ctx)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!characters.length ? (
              <p className="px-1 py-2 text-xs text-muted">No characters yet.</p>
            ) : null}
            <button
              type="button"
              className={`${action} mt-1 w-full`}
              onClick={() => useCharacterStore.getState().create()}
            >
              + New character
            </button>
            <p className="mt-2 border-t border-line-soft px-1 pt-2 text-[11px] leading-relaxed text-muted">
              A PNG sheet cannot be generated; use <strong>Print</strong> → “Save as PDF”
              for a PDF sheet. Markdown (for AI use) and JSON (backup) download from the
              header.
            </p>
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {active ? (
            tab === 'build' ? (
              <Builder key={active.id} character={active} ctx={ctx} />
            ) : (
              <Sheet key={active.id} character={active} ctx={ctx} />
            )
          ) : (
            <div className="rounded border border-line bg-panel p-8 text-center shadow-[0_1px_2px_rgb(0_0_0_/_0.45)]">
              <h2 className="text-lg font-semibold">Nothing selected</h2>
              <p className="mt-1 text-sm text-muted">
                Create a character to start building. Everything is saved in this browser.
              </p>
              <button
                type="button"
                className="btn btn-primary mt-4"
                onClick={() => useCharacterStore.getState().create()}
              >
                Create character
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character'
}

function summary(character: Character, ctx: RulesContext): string {
  const d = deriveCharacter(character, ctx)
  return `${d.identity.className} ${d.identity.level} · ${d.identity.raceName}`
}
