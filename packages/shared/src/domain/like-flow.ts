import { parseDishId } from './guards.ts'
import type { LikeResult, LikeService } from './like-service.ts'
import type { RateLimiter } from './ports.ts'

export type LikeOutcome =
  | { ok: true, result: LikeResult }
  | { ok: false, status: 404 | 429, code: 'not_found' | 'rate_limited' }

export interface LikeRequest {
  /** The raw `{dishId}` URL segment. */
  dishId: string | undefined
  ip: string
  liked: boolean
  /** Existing device id from a valid cookie, or null. Never sets anything. */
  readDevice: () => Promise<string | null>
  /** Existing device id, or a new one with its cookie set. Called only for a real like of a real dish. */
  ensureDevice: () => Promise<string>
}

/** One like/unlike request, in the order that matters: validate id, rate-limit, check the dish, only then touch the cookie. */
export async function runLike(likes: LikeService, limiter: RateLimiter, req: LikeRequest): Promise<LikeOutcome> {
  const dishId = parseDishId(req.dishId)
  if (!dishId) return { ok: false, status: 404, code: 'not_found' }
  if (!(await limiter.allow(`${req.ip}|${dishId}`))) return { ok: false, status: 429, code: 'rate_limited' }
  const result = await likes.set(dishId, () => (req.liked ? req.ensureDevice() : req.readDevice()), req.liked)
  return result ? { ok: true, result } : { ok: false, status: 404, code: 'not_found' }
}
