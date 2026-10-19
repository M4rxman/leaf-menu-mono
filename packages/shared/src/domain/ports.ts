import type { RawMenu } from './types.ts'

/** The read-only slice of D1 we use. D1 and the test SQLite adapter both implement it. */
export interface Db {
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>
  first<T>(sql: string, ...params: unknown[]): Promise<T | null>
  /** INSERT / UPDATE / DELETE. */
  run(sql: string, ...params: unknown[]): Promise<void>
}

/** What the guest page needs from storage. Writers (CMS) get their own port later. */
export interface MenuReader {
  getMenu(slug: string): Promise<RawMenu | null>
  /** Current slug for a renamed one, from slug_history. */
  currentSlugFor(oldSlug: string): Promise<string | null>
}

/** Guest likes. A device is anonymous: the id only ever comes from the signed cookie. */
export interface LikeStore {
  /** The venue slug if the dish can be liked (visible, not deleted, venue alive); sold-out is fine. */
  findLikeable(dishId: number): Promise<{ slug: string, likeLimitPerMin: number } | null>
  /** Idempotent. Returns the dish's like count afterwards. */
  setLiked(dishId: number, deviceId: string, liked: boolean): Promise<number>
  currentCount(dishId: number): Promise<number>
  counts(slug: string): Promise<Record<number, number>>
  likedDishIds(slug: string, deviceId: string): Promise<number[]>
}

/** True if the caller may proceed: at most `limit` calls per key per minute. */
export interface RateLimiter {
  allow(key: string, limit: number): Promise<boolean>
}
