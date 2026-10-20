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

export type Role = 'admin' | 'owner'

export interface AuthUser {
  id: number
  email: string
  role: Role
  /** null for the super-admin. */
  restaurantId: number | null
  mustChangePassword: boolean
}

/** CMS accounts, sessions and login throttling. Session ids are the SHA-256 of the cookie token. */
export interface AuthStore {
  /** With the password hash, for login only. */
  findByEmail(email: string): Promise<(AuthUser & { passwordHash: string }) | null>
  findById(id: number): Promise<(AuthUser & { passwordHash: string }) | null>
  createSession(sessionId: string, userId: number, expiresAt: number): Promise<void>
  /** Unexpired sessions only. */
  sessionUser(sessionId: string, now: number): Promise<{ user: AuthUser, expiresAt: number } | null>
  extendSession(sessionId: string, expiresAt: number): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  /** All of a user's sessions, except `keep` if given. */
  deleteSessions(userId: number, keep?: string): Promise<void>
  setPassword(userId: number, passwordHash: string, mustChange: boolean): Promise<void>
  /** Attempts are recorded before they are counted, so parallel requests all see each other. */
  failureCount(key: string, since: number): Promise<number>
  recordFailure(key: string, at: number): Promise<void>
  /** Takes back one recorded attempt (the one that turned out to be a success). */
  forgetFailure(key: string, at: number): Promise<void>
  clearFailures(key: string): Promise<void>
  purgeFailures(before: number): Promise<void>
}

/** True if the caller may proceed: at most `limit` calls per key per minute. */
export interface RateLimiter {
  allow(key: string, limit: number): Promise<boolean>
}
