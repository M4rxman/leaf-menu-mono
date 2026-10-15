import type { H3Event } from 'h3'

export const apiError = (event: H3Event, status: number, code: string) => {
  setResponseStatus(event, status)
  return { error: { code } }
}

/** Shared by PUT / DELETE / POST: validate, rate-limit, apply. Returns the outcome or an error body. */
export async function applyLike(event: H3Event, liked: boolean) {
  const dishId = Number(getRouterParam(event, 'dishId'))
  if (!Number.isSafeInteger(dishId) || dishId < 1) return { error: apiError(event, 404, 'not_found') }

  const ip = getRequestHeader(event, 'cf-connecting-ip') ?? getRequestIP(event) ?? 'unknown'
  if (!(await likeLimiter(event).allow(`${ip}:${dishId}`))) return { error: apiError(event, 429, 'rate_limited') }

  const service = likeService(event)
  // Cookie only on the first like; unliking without a cookie changes nothing.
  const device = liked ? await ensureDevice(event) : await readDevice(event)
  const result = await service.set(dishId, device, liked)
  if (!result) return { error: apiError(event, 404, 'not_found') }
  return { result }
}
