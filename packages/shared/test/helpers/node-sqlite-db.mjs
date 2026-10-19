// Db port (server/domain/ports.ts) over node:sqlite, so readers run against the real schema in tests.
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

export function seededSqlite() {
  const d = new DatabaseSync(':memory:')
  d.exec('PRAGMA foreign_keys = ON')
  for (const f of ['migrations/0001_init.sql', 'seed.sql'])
    d.exec(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'))
  return d
}

export function nodeSqliteDb(d) {
  return {
    all: async (sql, ...p) => d.prepare(sql).all(...p).map(r => ({ ...r })),
    first: async (sql, ...p) => {
      const r = d.prepare(sql).get(...p)
      return r ? { ...r } : null
    },
    run: async (sql, ...p) => { d.prepare(sql).run(...p) }
  }
}
