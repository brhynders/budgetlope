import { transactLocal, upsertRecord } from './db'

const DEFAULTS: Record<string, string[]> = {
  Bills: ['Rent / Mortgage', 'Electric', 'Water', 'Internet', 'Phone'],
  Needs: ['Groceries', 'Transportation', 'Medical', 'Home Maintenance'],
  Wants: ['Dining Out', 'Entertainment', 'Shopping', 'Subscriptions'],
  'Savings Goals': ['Emergency Fund', 'Vacation'],
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * First-run: create a starter set of category groups and categories.
 * Ids are deterministic so two devices that both seed before their first
 * sync merge into one identical set instead of duplicates.
 */
export function seedDefaults(): void {
  transactLocal(() => {
    let gSort = 0
    for (const [groupName, cats] of Object.entries(DEFAULTS)) {
      const groupId = `grp:seed-${slug(groupName)}`
      upsertRecord(groupId, { type: 'group', name: groupName, sort: gSort++ })
      let cSort = 0
      for (const catName of cats) {
        upsertRecord(`cat:seed-${slug(catName)}`, {
          type: 'category',
          groupId,
          name: catName,
          sort: cSort++,
        })
      }
    }
  })
}
