import type { RawMenu } from './types.ts'

/** The read-only slice of D1 we use. D1 and the test SQLite adapter both implement it. */
export interface Db {
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>
  first<T>(sql: string, ...params: unknown[]): Promise<T | null>
}

/** What the guest page needs from storage. Writers (CMS) get their own port later. */
export interface MenuReader {
  getMenu(slug: string): Promise<RawMenu | null>
  /** Current slug for a renamed one, from slug_history. */
  currentSlugFor(oldSlug: string): Promise<string | null>
}
