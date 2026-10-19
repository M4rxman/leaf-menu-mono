import type { H3Event } from 'h3'
import { runLike } from '@chilly/shared/domain/like-flow'

export const apiError = (event: H3Event, status: number, code: string) => {
  setResponseStatus(event, status)
  return { error: { code } }
}

/** Shared by PUT / DELETE / POST: the rules live in runLike (unit-tested); this only wires Nitro to them. */
export async function applyLike(event: H3Event, liked: boolean) {
  const out = await runLike(likeService(event), likeLimiter(event), {
    dishId: getRouterParam(event, 'dishId'),
    ip: getRequestHeader(event, 'cf-connecting-ip') ?? getRequestIP(event) ?? 'unknown',
    liked,
    readDevice: () => readDevice(event),
    ensureDevice: () => ensureDevice(event)
  })
  return out.ok ? { result: out.result } : { error: apiError(event, out.status, out.code) }
}
