/**
 * Vendors the SRD 5.1 JSON files published by 5e-bits/5e-database into
 * src/data/srd/. Run once (`npm run sync:srd`); the results are committed so the
 * app builds with no network access.
 *
 * Source: https://github.com/5e-bits/5e-database/tree/main/src/2014/en
 * The content is Wizards of the Coast's SRD 5.1, licensed CC-BY-4.0. See
 * src/data/LICENSES.md for the required attribution.
 */
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'src', 'data', 'srd')

/**
 * Pinned to a commit SHA so the vendored data is reproducible. Bump deliberately
 * and review the diff: `npm run data` regenerates and revalidates everything.
 *
 * a6212beb4b278917c2cff41c2b04c4ef4f3e0d6f (main, 2026-10-02)
 */
const COMMIT = 'a6212beb4b278917c2cff41c2b04c4ef4f3e0d6f'
const BASE = `https://raw.githubusercontent.com/5e-bits/5e-database/${COMMIT}/src/2014/en`

const FILES = [
  '5e-SRD-Ability-Scores.json',
  '5e-SRD-Alignments.json',
  '5e-SRD-Backgrounds.json',
  '5e-SRD-Classes.json',
  '5e-SRD-Conditions.json',
  '5e-SRD-Damage-Types.json',
  '5e-SRD-Equipment.json',
  '5e-SRD-Features.json',
  '5e-SRD-Languages.json',
  '5e-SRD-Levels.json',
  '5e-SRD-Magic-Items.json',
  '5e-SRD-Magic-Schools.json',
  '5e-SRD-Proficiencies.json',
  '5e-SRD-Races.json',
  '5e-SRD-Skills.json',
  '5e-SRD-Spells.json',
  '5e-SRD-Subclasses.json',
  '5e-SRD-Subraces.json',
  '5e-SRD-Traits.json',
  '5e-SRD-Weapon-Properties.json',
]

async function download(name) {
  const url = `${BASE}/${name}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  const text = await res.text()
  try {
    JSON.parse(text)
  } catch {
    throw new Error(`${name} is not valid JSON`)
  }
  return text
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const existing = new Set(await readdir(OUT_DIR))
  let changed = 0
  let bytes = 0
  const digests = []

  for (const name of FILES) {
    process.stdout.write(`fetching ${name} ... `)
    const text = await download(name)
    const pretty = `${JSON.stringify(JSON.parse(text), null, 2)}\n`
    const target = join(OUT_DIR, name)
    const already = existing.has(name)
    if (already && (await readFile(target, 'utf8')) === pretty) {
      console.log('unchanged')
      bytes += pretty.length
      digests.push(createHash('sha256').update(pretty).digest('hex').slice(0, 12))
      continue
    }
    await writeFile(target, pretty, 'utf8')
    changed += 1
    bytes += pretty.length
    const hash = createHash('sha256').update(pretty).digest('hex').slice(0, 12)
    digests.push(hash)
    console.log(`written (${hash})`)
  }

  // Recorded so the vendored snapshot can be identified from the repo alone.
  const manifest = {
    source: 'https://github.com/5e-bits/5e-database',
    commit: COMMIT,
    path: 'src/2014/en',
    licence: 'CC-BY-4.0 (Dungeons & Dragons System Reference Document 5.1)',
    files: FILES.map((name, i) => ({ name, sha256_12: digests[i] })),
  }
  await writeFile(join(OUT_DIR, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  console.log(`\n${changed} file(s) updated, ${bytes} bytes total, commit ${COMMIT.slice(0, 12)}`)
  console.log('Next: npm run build:data && npm run validate:srd')
}

await main()