/**
 * Auto-constraints.
 *
 * Every rule here comes from the SRD 5.1 or the 2014 Player's Handbook, and each
 * violation carries the text that justifies it so the UI can show a hover rather
 * than asserting a rule the player cannot check. Nothing is inferred, and nothing
 * is reported as an error when the character is simply unfinished.
 *
 * Severity:
 * - `error`: the character breaks a rule as configured.
 * - `warning`: legal but suspicious, or a rule the app cannot fully evaluate.
 * - `info`:  a limit the player is currently under.
 */
import type { Character } from '../state/schema'
import { isValidPointBuy, pointBuyRemaining, scoresOverCap } from './abilities'
import { armorBlocker, carryingCapacity, weaponProficiencyFor } from './armor'
import { parseInventoryId, type RulesContext } from './context'
import { effectiveMaxHitPoints } from './health'
import { attunementProblems } from './items'
import {
  alignmentBlockedSpells,
  availableSpells,
  GOOD_ALIGNMENTS,
  slotsRemaining,
} from './spells'

export type Severity = 'error' | 'warning' | 'info'

export interface Violation {
  id: string
  severity: Severity
  /** Short rule name, e.g. "Point Buy". */
  rule: string
  message: string
  /** Verbatim rulebook text, used as the hover explanation. */
  rulebookText?: string
  /** Field or picker this belongs to, so the UI can link to it. */
  field?: string
}

export interface ConstraintReport {
  violations: Violation[]
  errors: Violation[]
  warnings: Violation[]
  infos: Violation[]
  valid: boolean
}

const report = (violations: Violation[]): ConstraintReport => ({
  violations,
  errors: violations.filter((v) => v.severity === 'error'),
  warnings: violations.filter((v) => v.severity === 'warning'),
  infos: violations.filter((v) => v.severity === 'info'),
  valid: violations.every((v) => v.severity !== 'error'),
})

/** PHB "Assigning Ability Scores", Point Buy: 27 points, scores 8-15. */
function checkPointBuy(character: Character, ctx: RulesContext, out: Violation[]) {
  if (character.abilityMethod.method !== 'point-buy') return

  if (!isValidPointBuy(ctx, character.abilityScores)) {
    out.push({
      id: 'point-buy-range',
      severity: 'error',
      rule: 'Point Buy',
      field: 'abilityScores',
      message: 'Ability scores must be between 8 and 15 before racial bonuses.',
      rulebookText:
        'Your ability scores start at 8. You have 27 points to spend. A score can be raised to a maximum of 15 before you apply racial bonuses.',
    })
  }

  const remaining = pointBuyRemaining(ctx, character.abilityScores)
  if (remaining < 0) {
    out.push({
      id: 'point-buy-budget',
      severity: 'error',
      rule: 'Point Buy',
      field: 'abilityScores',
      message: `Point buy is overspent by ${Math.abs(remaining)} point(s).`,
      rulebookText: 'You have 27 points to spend.',
    })
  } else if (remaining > 0) {
    out.push({
      id: 'point-buy-remaining',
      severity: 'info',
      rule: 'Point Buy',
      field: 'abilityScores',
      message: `${remaining} point(s) still unspent.`,
    })
  }
}

/** PHB: rolling is 4d6, drop the lowest die, once per ability score. */
function checkRolled(character: Character, out: Violation[]) {
  if (character.abilityMethod.method !== 'rolled') return

  if (character.abilityMethod.rolls?.length !== 6) {
    out.push({
      id: 'rolled-count',
      severity: 'error',
      rule: 'Rolling Ability Scores',
      field: 'abilityScores',
      message: 'Rolling requires six results from 4d6, dropping the lowest die.',
      rulebookText:
        'Roll four six-sided dice. Drop the lowest one. Assign the new character\u2019s six results to the six ability scores.',
    })
  }
}

/** PHB: "Your ability score can't be raised above 20." */
function checkAbilityCap(character: Character, ctx: RulesContext, out: Violation[]) {
  for (const key of scoresOverCap(character, ctx)) {
    out.push({
      id: `ability-cap-${key}`,
      severity: 'error',
      rule: 'Ability Score Improvements',
      field: 'abilityScores',
      message: `${key.toUpperCase()} is above 20, which an ASI cannot produce.`,
      rulebookText:
        "An ability score can't be increased above 20 with an Ability Score Improvement.",
    })
  }
}

/** PHB "Multiclassing": "you can't take a level in the same class twice". */
function checkMulticlass(character: Character, out: Violation[]) {
  const seen = new Set<string>()
  for (const entry of character.classes) {
    if (seen.has(entry.classIndex)) {
      out.push({
        id: `multiclass-duplicate-${entry.classIndex}`,
        severity: 'error',
        rule: 'Multiclassing',
        field: 'classes',
        message: 'A character cannot take two levels in the same class.',
        rulebookText:
          "You can't take a level in the same class twice. If you're already a Barbarian, you can't become a Barbarian again.",
      })
    }
    seen.add(entry.classIndex)
  }
}

/** A character's level can never exceed 20, and ASI cannot exceed +5 per score. */
function checkLevels(character: Character, out: Violation[]) {
  const total = character.classes.reduce((sum, c) => sum + c.level, 0)
  if (total > 20) {
    out.push({
      id: 'level-cap',
      severity: 'error',
      rule: 'Level',
      field: 'classes',
      message: `Total level is ${total}; the maximum is 20.`,
      rulebookText: 'The range of levels a character can attain is 1-20.',
    })
  }
}

/** Subclasses have a minimum level, published in the PHB subclass table. */
function checkSubclassLevels(character: Character, ctx: RulesContext, out: Violation[]) {
  for (const entry of character.classes) {
    if (!entry.subclassIndex) continue
    const subclass = ctx.subclass.get(entry.subclassIndex)
    if (!subclass) {
      out.push({
        id: `subclass-unknown-${entry.subclassIndex}`,
        severity: 'error',
        rule: 'Subclass',
        field: 'classes',
        message: `Unknown subclass ${entry.subclassIndex}.`,
      })
      continue
    }
    if (subclass.classIndex !== entry.classIndex) {
      out.push({
        id: `subclass-class-${entry.subclassIndex}`,
        severity: 'error',
        rule: 'Subclass',
        field: 'classes',
        message: `${subclass.name} is a ${ctx.class.get(subclass.classIndex)?.name ?? subclass.classIndex} subclass.`,
      })
    }
    if (subclass.level != null && entry.level < subclass.level) {
      out.push({
        id: `subclass-level-${entry.subclassIndex}`,
        severity: 'error',
        rule: 'Subclass',
        field: 'classes',
        message: `${subclass.name} requires ${ctx.class.get(entry.classIndex)?.name} level ${subclass.level}; this character is level ${entry.level}.`,
      })
    }
  }
}

/** PHB Barbarian: "a paladin must be of a good alignment" also gates the Paladin oath. */
function checkAlignment(character: Character, out: Violation[]) {
  const isPaladin = character.classes.some((c) => c.classIndex === 'paladin')
  if (!isPaladin) return
  if (!GOOD_ALIGNMENTS.includes(character.alignmentIndex)) {
    out.push({
      id: 'paladin-alignment',
      severity: 'error',
      rule: 'Paladin',
      field: 'alignmentIndex',
      message: 'A Paladin must be of a good alignment.',
      rulebookText: 'A paladin must be of a good alignment (lawful, neutral, or chaotic good).',
    })
  }
}

/** PHB: "your spells must be of your alignment" for Paladin and Ranger. */
function checkSpellAlignment(character: Character, ctx: RulesContext, out: Violation[]) {
  const allowed = new Set(availableSpells(character, ctx))
  const chosen = [
    ...character.spells.known,
    ...character.spells.prepared,
    ...character.spells.cantrips,
  ]

  for (const blocked of alignmentBlockedSpells(character, ctx)) {
    if (!chosen.includes(blocked.spellIndex)) continue
    out.push({
      id: `spell-alignment-${blocked.spellIndex}`,
      severity: 'error',
      rule: 'Spell Alignment',
      field: 'spells',
      message: `${blocked.spellName} is not of this character's alignment.`,
      rulebookText: 'Your spells must be of your alignment.',
    })
  }

  // Every chosen spell must be on a list this character can actually cast from.
  for (const index of chosen) {
    if (allowed.has(index)) continue
    if (!ctx.spell.has(index)) continue
    out.push({
      id: `spell-unavailable-${index}`,
      severity: 'error',
      rule: 'Spell List',
      field: 'spells',
      message: `${ctx.spell.get(index)!.name} is not on this character's spell list.`,
    })
  }
}

/** Cantrip and known-spell limits come from the class level table. */
function checkSpellCounts(character: Character, ctx: RulesContext, out: Violation[]) {
  const casters = character.classes.filter(
    (c) => c.level > 0 && ctx.class.get(c.classIndex)?.spellcasting,
  )
  if (casters.length === 0) {
    if (character.spells.cantrips.length || character.spells.known.length || character.spells.prepared.length) {
      out.push({
        id: 'spells-without-caster',
        severity: 'error',
        rule: 'Spellcasting',
        field: 'spells',
        message: 'This character has no spellcasting class.',
      })
    }
    return
  }

  const cantripsAllowed = casters.reduce((sum, entry) => {
    const klass = ctx.class.get(entry.classIndex)!
    const row = klass.levels.find((l) => l.level === entry.level)
    const fromLevel = row?.spellcasting?.cantripsKnown ?? 0
    // A subclass may grant extra cantrips; those are counted separately and allowed.
    return sum + fromLevel
  }, 0)

  // Cantrips granted for free by the ancestry do not consume a cantrip slot.
  const racialCantripCount = character.subraceIndex
    ? (ctx.subrace.get(character.subraceIndex)?.cantrips ?? []).length
    : 0

  const chosenCantrips = character.spells.cantrips
  const cantripAllowance = cantripsAllowed + racialCantripCount
  if (chosenCantrips.length > cantripAllowance) {
    out.push({
      id: 'cantrip-limit',
      severity: 'error',
      rule: 'Cantrips Known',
      field: 'spells.cantrips',
      message: `${chosenCantrips.length} cantrips chosen; this character may know ${cantripAllowance}.`,
      rulebookText:
        'At each level in a class, you gain one or more cantrips. The number of cantrips you know is given in the class table.',
    })
  } else if (cantripAllowance - chosenCantrips.length > 0) {
    out.push({
      id: 'cantrip-under',
      severity: 'info',
      rule: 'Cantrips Known',
      field: 'spells.cantrips',
      message: `${cantripAllowance - chosenCantrips.length} cantrip slot(s) unused.`,
    })
  }

  const fixedLimit = casters.reduce((sum, entry) => {
    const klass = ctx.class.get(entry.classIndex)!
    const row = klass.levels.find((l) => l.level === entry.level)
    // Prepared classes have no fixed limit in the table.
    if (klass.preparesSpells) return sum
    return sum + (row?.spellcasting?.spellsKnown ?? 0)
  }, 0)

  if (fixedLimit > 0 && character.spells.known.length > fixedLimit) {
    out.push({
      id: 'spells-known-limit',
      severity: 'error',
      rule: 'Spells Known',
      field: 'spells.known',
      message: `${character.spells.known.length} spells known; this character may know ${fixedLimit}.`,
    })
  }
}

/** Slots spent may not exceed slots available. */
function checkSlots(character: Character, ctx: RulesContext, out: Violation[]) {
  const remaining = slotsRemaining(character, ctx)
  for (const [level, spentRaw] of Object.entries(character.spells.slots.spent)) {
    const spent = Number(spentRaw)
    const left = remaining[Number(level)] ?? 0
    if (spent > left) {
      out.push({
        id: `slot-overspent-${level}`,
        severity: 'error',
        rule: 'Spell Slots',
        field: 'spells.slots',
        message: `${spent} level-${level} slot(s) spent but only ${left} remain.`,
      })
    }
  }
}

/** Skill picks must come from the class's list and respect the count. */
function checkSkills(character: Character, ctx: RulesContext, out: Violation[]) {
  for (const entry of character.classes) {
    const klass = ctx.class.get(entry.classIndex)
    if (!klass) continue
    for (const group of klass.skillChoices) {
      const picks = entry.skillChoices.filter((s) => group.options.includes(s))
      if (picks.length > group.choose) {
        out.push({
          id: `skill-choice-${entry.classIndex}`,
          severity: 'error',
          rule: 'Class Skills',
          field: 'classes',
          message: `${klass.name} allows ${group.choose} skill choice(s); ${picks.length} chosen.`,
          rulebookText: group.desc ?? undefined,
        })
      }
      // Not-yet-chosen picks are incomplete rather than illegal, so the character
      // still loads; the builder surfaces this until the picks are made.
      if (picks.length < group.choose) {
        out.push({
          id: `skill-choice-incomplete-${entry.classIndex}`,
          severity: 'warning',
          rule: 'Class Skills',
          field: 'classes',
          message: `${klass.name} grants ${group.choose} skill choice(s); ${picks.length} chosen so far.`,
          rulebookText: group.desc ?? undefined,
        })
      }
      const stray = entry.skillChoices.filter((s) => !group.options.includes(s))
      for (const s of stray) {
        out.push({
          id: `skill-stray-${entry.classIndex}-${s}`,
          severity: 'error',
          rule: 'Class Skills',
          field: 'classes',
          message: `${s} is not one of ${klass.name}'s skill choices.`,
          rulebookText: group.desc ?? undefined,
        })
      }
    }
    for (const group of [...klass.instrumentChoices, ...klass.toolChoices]) {
      const picks = [...entry.instrumentChoices, ...entry.toolChoices].filter((p) =>
        group.options.includes(p),
      )
      if (picks.length > group.choose) {
        out.push({
          id: `tool-choice-${entry.classIndex}-${group.options[0]}`,
          severity: 'error',
          rule: 'Tools and Instruments',
          field: 'classes',
          message: `${klass.name} allows ${group.choose} of this; ${picks.length} chosen.`,
          rulebookText: group.desc ?? undefined,
        })
      }
      if (picks.length < group.choose) {
        out.push({
          id: `tool-choice-incomplete-${entry.classIndex}-${group.options[0]}`,
          severity: 'warning',
          rule: 'Tools and Instruments',
          field: 'classes',
          message: `${klass.name} grants ${group.choose} of this; ${picks.length} chosen so far.`,
          rulebookText: group.desc ?? undefined,
        })
      }
    }
  }

  // PHB: the background grants exactly two skill proficiencies.
  const background = ctx.background.get(character.backgroundIndex)
  if (background && background.skillProficiencies.length !== 2) {
    out.push({
      id: 'background-skills',
      severity: 'warning',
      rule: 'Background',
      field: 'backgroundIndex',
      message: `${background.name} lists ${background.skillProficiencies.length} skill proficiencies; the PHB grants two.`,
    })
  }
}

/** Tool and instrument picks must be offered by the class. */
function checkTools(character: Character, ctx: RulesContext, out: Violation[]) {
  for (const entry of character.classes) {
    const klass = ctx.class.get(entry.classIndex)
    if (!klass) continue
    const offered = new Set(
      [...klass.instrumentChoices, ...klass.toolChoices].flatMap((g) => g.options),
    )
    for (const pick of [...entry.instrumentChoices, ...entry.toolChoices]) {
      if (!offered.has(pick)) {
        out.push({
          id: `tool-stray-${entry.classIndex}-${pick}`,
          severity: 'error',
          rule: 'Tools and Instruments',
          field: 'classes',
          message: `${pick} is not offered by ${klass.name}.`,
        })
      }
    }
  }
}

/** Armour must be proficient with and strong enough to wear. */
function checkArmor(character: Character, ctx: RulesContext, out: Violation[]) {
  const worn = character.inventory.filter((e) => e.equipped)

  let bodyArmorSeen = false
  let shieldSeen = false

  for (const entry of worn) {
    const resolved = parseInventoryId(entry.id, ctx)
    if (resolved?.kind !== 'armor') continue

    const armor = resolved.entry
    if (armor.category === 'Shield') {
      if (shieldSeen) {
        out.push({
          id: `armor-two-shields-${armor.index}`,
          severity: 'error',
          rule: 'Equipment',
          message: 'You cannot wield more than one shield.',
        })
      }
      shieldSeen = true
    } else {
      if (bodyArmorSeen) {
        out.push({
          id: `armor-two-body-${armor.index}`,
          severity: 'error',
          rule: 'Equipment',
          message: 'You cannot wear two suits of body armour at once.',
        })
      }
      bodyArmorSeen = true
    }

    const blocker = armorBlocker(armor, character, ctx)
    if (blocker) {
      out.push({
        id: `armor-blocked-${armor.index}`,
        severity: 'error',
        rule: 'Armor',
        field: 'inventory',
        message: `${armor.name}: ${blocker}.`,
        rulebookText: 'If a creature has a Strength score of less than 13 (or 15 for this armor), the creature can\u2019t equip or wear armor with this requirement. You must be proficient with a piece of armor to wear it.',
      })
    }
  }
}

/** Attunement: three slots, and class/ancestry prerequisites. */
function checkAttunement(character: Character, ctx: RulesContext, out: Violation[]) {
  const { slotFull, overLimit, reasons } = attunementProblems(character, ctx)

  if (slotFull) {
    out.push({
      id: 'attunement-slots',
      severity: 'error',
      rule: 'Attunement',
      field: 'inventory',
      message: `${overLimit} too many items attuned; the limit is ${ctx.rules.constants.maxAttunementSlots}.`,
      rulebookText: 'You can attune to no more than three magic items at a time.',
    })
  }

  for (const reason of reasons) {
    out.push({
      id: `attunement-${reason.itemIndex}`,
      severity: 'error',
      rule: 'Attunement',
      field: 'inventory',
      message: `${reason.itemName}: ${reason.reason.toLowerCase()}.`,
      rulebookText: 'You can\u2019t attune to an item if you can\u2019t meet any requirement for it.',
    })
  }
}

/** Weapons must be proficient, and proficiency must exist for the weapon type. */
function checkWeapons(character: Character, ctx: RulesContext, out: Violation[]) {
  for (const entry of character.inventory) {
    if (!entry.equipped || !entry.id.startsWith('weapon:')) continue
    const weaponIndex = entry.id.slice('weapon:'.length)
    if (!ctx.weapon.has(weaponIndex)) continue
    if (weaponProficiencyFor(character, ctx, weaponIndex)) continue

    out.push({
      id: `weapon-proficiency-${weaponIndex}`,
      severity: 'error',
      rule: 'Weapon Proficiency',
      field: 'inventory',
      message: `Not proficient with ${ctx.weapon.get(weaponIndex)!.name}.`,
      rulebookText:
        'Some weapons require a proficiency to wield. Simple weapons require no proficiency. You are proficient with all simple weapons and with any weapon listed for your class.',
    })
  }
}

/** Two-handed weapons cannot be used with a shield, and vice versa. */
function checkTwoHanded(character: Character, ctx: RulesContext, out: Violation[]) {
  const equippedWeapons = character.inventory.filter((e) => e.equipped)
  const twoHanded = equippedWeapons
    .filter((e) => e.id.startsWith('weapon:'))
    .map((e) => ctx.weapon.get(e.id.slice('weapon:'.length)))
    .filter((w): w is NonNullable<typeof w> => Boolean(w))
    .filter((w) => Boolean(w.twoHandedDamage))
  if (twoHanded.length === 0) return

  const shield = equippedWeapons.some((e) => {
    const resolved = parseInventoryId(e.id, ctx)
    return resolved?.kind === 'armor' && resolved.entry.category === 'Shield'
  })
  if (shield) {
    out.push({
      id: 'two-handed-shield',
      severity: 'error',
      rule: 'Weapons',
      field: 'inventory',
      message: `You cannot wield ${twoHanded.map((w) => w.name).join(', ')} while using a shield.`,
      rulebookText: 'You can\u2019t use a shield if you are wielding a two-handed weapon.',
    })
  }
}

/** Encumbrance is a legal state, so it is surfaced as a warning rather than an error. */
function checkCarryingCapacity(character: Character, ctx: RulesContext, out: Violation[]) {
  const load = carryingCapacity(character, ctx)
  if (!load.encumbered) return

  out.push({
    id: 'encumbered',
    severity: 'warning',
    rule: 'Equipment',
    field: 'inventory',
    message: `Encumbered: carrying ${load.carried} lb against a capacity of ${load.capacity} lb.`,
    rulebookText:
      'Each character can carry a weight up to 15 times their Strength score. While pushing or dragging weight in excess of their carrying capacity, a character\u2019s speed drops to half.',
  })
}

/** Hit points must be positive, and the manual override is surfaced when present. */
function checkHitPoints(character: Character, ctx: RulesContext, out: Violation[]) {
  if (character.hp.max != null && character.hp.max < 1) {
    out.push({
      id: 'hp-min',
      severity: 'error',
      rule: 'Hit Points',
      field: 'hp',
      message: 'Maximum hit points cannot be below 1.',
    })
  }
  if (character.hp.max != null) {
    const computed = effectiveMaxHitPoints(character, ctx)
    if (character.hp.max !== computed) {
      out.push({
        id: 'hp-override',
        severity: 'info',
        rule: 'Hit Points',
        field: 'hp',
        message: `Maximum hit points are set manually to ${character.hp.max}; the computed value is ${computed}.`,
        rulebookText:
          'At 1st level, a character has a maximum hit points equal to their hit dice value + their Constitution modifier. Their hit points increase by their hit die average + their Constitution modifier.',
      })
    }
  }
}

/** Racial language and ASI choices must satisfy the race's own offers. */
function checkRaceChoices(character: Character, ctx: RulesContext, out: Violation[]) {
  const race = ctx.race.get(character.raceIndex)
  if (!race) {
    out.push({
      id: 'race-unknown',
      severity: 'error',
      rule: 'Ancestry',
      field: 'raceIndex',
      message: `Unknown ancestry ${character.raceIndex}.`,
    })
    return
  }

  if (race.subraceIndexes.length && !character.subraceIndex) {
    out.push({
      id: 'subrace-missing',
      severity: 'error',
      rule: 'Ancestry',
      field: 'subraceIndex',
      message: `${race.name} requires a subrace.`,
    })
  }
  if (character.subraceIndex) {
    const subrace = ctx.subrace.get(character.subraceIndex)
    if (!subrace) {
      out.push({
        id: 'subrace-unknown',
        severity: 'error',
        rule: 'Ancestry',
        field: 'subraceIndex',
        message: `Unknown subrace ${character.subraceIndex}.`,
      })
    } else if (subrace.raceIndex !== race.index) {
      out.push({
        id: 'subrace-parent',
        severity: 'error',
        rule: 'Ancestry',
        field: 'subraceIndex',
        message: `${subrace.name} is a ${ctx.race.get(subrace.raceIndex)?.name ?? subrace.raceIndex} subrace.`,
      })
    }
  }

  if (race.abilityBonusOptions) {
    const options = race.abilityBonusOptions
    const chosen = Object.entries(character.racialAbilityChoices)
    if (chosen.length !== options.choose) {
      out.push({
        id: 'racial-asi-count',
        severity: 'error',
        rule: 'Ancestry',
        field: 'racialAbilityChoices',
        message: `${race.name} requires ${options.choose} ability score bonus(es); ${chosen.length} chosen.`,
      })
    }
    for (const [ability, amount] of chosen) {
      const valid = options.options.some(
        (o) => o.ability === ability && o.bonus === amount,
      )
      if (!valid) {
        out.push({
          id: `racial-asi-${ability}`,
          severity: 'error',
          rule: 'Ancestry',
          field: 'racialAbilityChoices',
          message: `${ability?.toUpperCase()} +${amount} is not an option for ${race.name}.`,
        })
      }
    }
  }

  if (race.languageOptions) {
    const limit = race.languageOptions.choose
    if (character.racialLanguages.length > limit) {
      out.push({
        id: 'race-languages',
        severity: 'error',
        rule: 'Ancestry',
        field: 'racialLanguages',
        message: `${race.name} allows ${limit} extra language(s); ${character.racialLanguages.length} chosen.`,
      })
    }
    for (const index of character.racialLanguages) {
      if (!race.languageOptions.options.includes(index)) {
        out.push({
          id: `race-language-${index}`,
          severity: 'error',
          rule: 'Ancestry',
          field: 'racialLanguages',
          message: `${ctx.language.get(index)?.name ?? index} is not offered by ${race.name}.`,
        })
      }
    }
  }
}

/** Background grants a +2 bonus to one score, and extra languages up to its limit. */
function checkBackground(character: Character, ctx: RulesContext, out: Violation[]) {
  const background = ctx.background.get(character.backgroundIndex)
  if (!background) {
    out.push({
      id: 'background-unknown',
      severity: 'error',
      rule: 'Background',
      field: 'backgroundIndex',
      message: `Unknown background ${character.backgroundIndex}.`,
    })
    return
  }

  // NOTE: the 2014 PHB grants no ability score increase from a background, so the
  // old `featAbilityBonus`-based check is intentionally absent.

  if (character.backgroundLanguages.length > background.languages) {
    out.push({
      id: 'background-languages',
      severity: 'error',
      rule: 'Background',
      field: 'backgroundLanguages',
      message: `${background.name} grants ${background.languages} extra language(s); ${character.backgroundLanguages.length} chosen.`,
    })
  }
}

/** Feats and ASIs are capped by the class table's ability score bonuses. */
function checkAsi(character: Character, ctx: RulesContext, out: Violation[]) {
  for (const entry of character.classes) {
    const klass = ctx.class.get(entry.classIndex)
    if (!klass) continue
    const available = klass.levels
      .filter((l) => l.level <= entry.level)
      .reduce((sum, l) => sum + l.asiCount, 0)
    // A Variant Human's bonus feat comes from the ancestry, not the class table.
    const bonusFeat = character.variantHuman && entry === character.classes[0] ? 1 : 0
    if (entry.asi.length > available + bonusFeat) {
      out.push({
        id: `asi-limit-${entry.classIndex}`,
        severity: 'error',
        rule: 'Ability Score Improvements',
        field: 'classes',
        message: `${klass.name} level ${entry.level} grants ${available} ASI(s)${
          bonusFeat ? ' plus the Variant Human feat' : ''
        }; ${entry.asi.length} recorded.`,
      })
    }
    const recordedLevels = new Map<number, number>()
    for (const asi of entry.asi) {
      recordedLevels.set(asi.level, (recordedLevels.get(asi.level) ?? 0) + 1)
      if (asi.level > entry.level) {
        out.push({
          id: `asi-level-${entry.classIndex}-${asi.level}`,
          severity: 'error',
          rule: 'Ability Score Improvements',
          field: 'classes',
          message: `ASI recorded at level ${asi.level}, above ${klass.name} level ${entry.level}.`,
        })
      }
      const total = Object.values(asi.abilityBonuses).reduce((a, b) => a + b, 0)
      if (total > 2) {
        out.push({
          id: `asi-total-${entry.classIndex}-${asi.level}`,
          severity: 'error',
          rule: 'Ability Score Improvements',
          field: 'classes',
          message: `An ASI grants a total of +2; +${total} recorded at level ${asi.level}.`,
          rulebookText:
            'When you gain an Ability Score Improvement, you choose one ability score and increase it by 2, or you choose two ability scores and increase each of them by 1.',
        })
      }
    }

    // An ASI offered by the table but not yet recorded: worth a note, not a failure.
    for (const level of klass.levels) {
      if (level.level > entry.level || level.asiCount === 0) continue
      const taken = recordedLevels.get(level.level) ?? 0
      if (taken < level.asiCount) {
        out.push({
          id: `asi-missing-${entry.classIndex}-${level.level}`,
          severity: 'info',
          rule: 'Ability Score Improvements',
          field: 'classes',
          message: `${klass.name} level ${level.level} grants ${level.asiCount} ability score improvement(s); ${taken} recorded.`,
          rulebookText:
            'When you gain an Ability Score Improvement, you choose one ability score and increase it by 2, or you choose two ability scores and increase each of them by 1.',
        })
      }
    }
  }

  if (character.variantHuman) {
    const bonusFeats = character.classes.reduce(
      (sum, c) => sum + c.asi.filter((a) => a.asiType === 'feat' && a.level === 1).length,
      0,
    )
    if (bonusFeats > 1) {
      out.push({
        id: 'variant-human-feats',
        severity: 'error',
        rule: 'Variant Human',
        field: 'classes',
        message: 'A Variant Human gains one feat at 1st level and cannot gain a second.',
        rulebookText:
          'If your campaign uses the optional feat rules, your Dungeon Master might allow these variant traits. You gain proficiency in one skill of your choice and one feat of your choice.',
      })
    }

    // 2014 Variant Human: +1 to two *different* ability scores of your choice.
    const picked = Object.entries(character.racialAbilityChoices).filter(([, amount]) => amount > 0)
    const total = picked.reduce((sum, [, amount]) => sum + amount, 0)
    if (total !== 2 || picked.length !== 2) {
      out.push({
        id: 'variant-human-scores',
        severity: 'error',
        rule: 'Variant Human',
        field: 'racialAbilityChoices',
        message: 'A Variant Human gains +1 to two different ability scores of your choice.',
        rulebookText:
          'Two different ability scores of your choice increase by 1.',
      })
    }
  }
}

/** Race and subrace text may be missing from the SRD; say so rather than hide it. */
function checkTextAvailability(character: Character, ctx: RulesContext, out: Violation[]) {
  const subrace = character.subraceIndex ? ctx.subrace.get(character.subraceIndex) : null
  if (subrace && !subrace.textAvailable) {
    out.push({
      id: `subrace-text-${subrace.index}`,
      severity: 'info',
      rule: 'Ancestry',
      message: `The System Reference Document does not publish the ${subrace.name} description; only its mechanical values are available here.`,
    })
  }

  for (const entry of character.classes) {
    if (!entry.subclassIndex) continue
    const subclass = ctx.subclass.get(entry.subclassIndex)
    if (subclass && !subclass.textAvailable) {
      out.push({
        id: `subclass-text-${subclass.index}`,
        severity: 'info',
        rule: 'Subclass',
        message: `The System Reference Document does not publish the ${subclass.name} description; its spell grants are available but its rules text is not.`,
      })
    }
  }
}

/**
 * Runs every constraint. Returns a report rather than throwing, so a partly built
 * character can always be loaded and shown.
 */
export function checkConstraints(character: Character, ctx: RulesContext): ConstraintReport {
  const out: Violation[] = []

  checkRaceChoices(character, ctx, out)
  checkBackground(character, ctx, out)
  checkPointBuy(character, ctx, out)
  checkRolled(character, out)
  checkAbilityCap(character, ctx, out)
  checkLevels(character, out)
  checkMulticlass(character, out)
  checkSubclassLevels(character, ctx, out)
  checkAlignment(character, out)
  checkSpellAlignment(character, ctx, out)
  checkSpellCounts(character, ctx, out)
  checkSlots(character, ctx, out)
  checkSkills(character, ctx, out)
  checkTools(character, ctx, out)
  checkArmor(character, ctx, out)
  checkAttunement(character, ctx, out)
  checkWeapons(character, ctx, out)
  checkTwoHanded(character, ctx, out)
  checkCarryingCapacity(character, ctx, out)
  checkHitPoints(character, ctx, out)
  checkAsi(character, ctx, out)
  checkTextAvailability(character, ctx, out)

  // Stable ordering: errors first, then by rule, so the panel does not jump around.
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
  out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.rule.localeCompare(b.rule) || a.id.localeCompare(b.id))

  return report(out)
}

/** Only the errors, for gating the export buttons. */
export function errorsOnly(character: Character, ctx: RulesContext): Violation[] {
  return checkConstraints(character, ctx).errors
}

/** A one-line summary for the character list. */
export function constraintSummary(character: Character, ctx: RulesContext): string {
  const { errors, warnings } = checkConstraints(character, ctx)
  if (errors.length) return `${errors.length} rule violation${errors.length > 1 ? 's' : ''}`
  if (warnings.length) return `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`
  return 'Rulebook legal'
}
