# Licences and attribution

## System Reference Document 5.1

The rule text, spell descriptions, monster and item descriptions, class tables and
racial trait text under `src/data/srd/` and the derived files under
`src/data/generated/` come from the **Dungeons & Dragons System Reference Document
5.1**, published by Wizards of the Coast.

> *This work is licensed under the Creative Commons Attribution 4.0 International
> License (CC BY 4.0). To view a copy of this license, visit
> <https://creativecommons.org/licenses/by/4.0/> or send a letter to Creative
> Commons, PO Box 1866, Mountain View, CA 94042, USA.*

The JSON files were obtained from the community mirror
[`5e-bits/5e-database`](https://github.com/5e-bits/5e-database/tree/main/src/2014/en),
which redistributes the SRD content under that same licence. `scripts/sync-srd.mjs`
records the upstream revision it fetched.

## Curated supplements: `src/data/curated/`

These files are original work and were written for this project. They are **not**
copied from the SRD.

| File | Contents | Upstream basis |
| --- | --- | --- |
| `subraces.json` | The five PHB subraces the SRD omits | PHB 2014 racial trait names and numbers |
| `backgrounds.json` | The twelve PHB backgrounds the SRD omits | PHB 2014 background table |
| `subclasses.json` | Subclass spell-grant tables | PHB 2014 domain, circle, oath, patron and school tables |
| `spell-alignments.json` | Paladin and Ranger spell alignment tags | PHB 2014 Paladin and Ranger spell lists |
| `armor-overrides.json` | Strength requirements the SRD under-reports | PHB 2014 Table 13: Armor |
| `magic-item-effects.json` | Stat changes for items that alter a sheet field | PHB 2014 and DMG item descriptions |

Each curated file repeats its own `source` and `notes` fields, and any place where it
disagrees with the SRD is recorded there rather than silently reconciled.

### Deliberate omissions

Some Player's Handbook content is **not** part of the SRD 5.1 and is therefore not
bundled here:

- **Background feature text.** Curated backgrounds ship the feature *name* only, with
  `feature.desc` empty and `featureTextAvailable` false.
- **Feat text.** `Feats` is not in the vendored SRD set, so the app cannot show feat
  descriptions. Feats are tracked by name only.
- **Optional/supplemental rules.** Tasha's Cauldron of Everything, Eberron, Forge of
  Foes, Xanathar's Guide and other supplements are out of scope. Where the curated
  subclass tables were checked against them, non-PHB subclasses were left out; the
  Outlander background was removed for the same reason.
- **Adventuring gear descriptions** beyond the SRD entries.

### Known upstream discrepancies

- **Chain mail, ring mail and half plate.** `5e-SRD-Equipment.json` reports Strength
  requirements of 13, 0 and 0. The PHB says 15, 13 and 13. `armor-overrides.json` wins,
  because Armour Class and carrying capacity both depend on the number.
- **Faerie Fire.** The PHB makes it a drow cantrip; SRD 5.1.2 files it as a 1st-level
  spell. The PHB grouping is kept and `validate-srd.mjs` reports the mismatch.
- **Paladin and Ranger at 1st level.** The SRD emits an all-zero `spellcasting` object
  for those rows even though neither class casts at 1st level.
- **Warlock spell slots.** The SRD records them in the column for the highest unlocked
  slot level, matching the PHB's "your spell slots are all the same level" rule.

## Not included

- D&D Beyond content.
- The Player's Handbook as a whole.
- Any generated artwork or images; none are bundled.
