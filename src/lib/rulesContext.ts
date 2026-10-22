/**
 * Loads the generated dataset once for the whole app.
 *
 * The rules engine takes a `RulesContext` so it can run against a test fixture or
 * lazily loaded data; this is the browser singleton built from the committed JSON.
 */
import rules from '../data/generated/rules.json'
import spells from '../data/generated/spells.json'
import items from '../data/generated/items.json'
import type { ItemDataset, RulesDataset, SpellDataset } from '../data/types'
import { createRulesContext, type RulesContext } from '../rules/context'

export const rulesContext: RulesContext = createRulesContext(
  rules as unknown as RulesDataset,
  spells as unknown as SpellDataset,
  items as unknown as ItemDataset,
)
