import type { H3Event } from 'h3'
import { LikeService } from '@chilly/shared/domain/like-service'
import { MenuService } from '@chilly/shared/domain/menu-service'
import type { RateLimiter } from '@chilly/shared/domain/ports'
import { d1Db } from '@chilly/shared/infra/d1-db'
import type { D1Like } from '@chilly/shared/infra/d1-db'
import { D1LikeStore, cfRateLimiter } from '@chilly/shared/infra/d1-like-store'
import { D1MenuReader } from '@chilly/shared/infra/d1-menu-reader'

interface Env {
  DB?: D1Like
  DEVICE_SECRET?: string
  LIKE_LIMITER?: Parameters<typeof cfRateLimiter>[0]
}

// Composition root: the only place that knows about Cloudflare bindings.
const env = (event: H3Event) => (event.context.cloudflare?.env ?? {}) as Env

function db(event: H3Event) {
  const { DB } = env(event)
  if (!DB) throw createError({ statusCode: 500, statusMessage: 'D1 binding DB is missing' })
  return d1Db(DB)
}

export const menuService = (event: H3Event): MenuService => new MenuService(new D1MenuReader(db(event)))

export const likeService = (event: H3Event): LikeService => new LikeService(new D1LikeStore(db(event)))

export function deviceSecret(event: H3Event): string {
  const { DEVICE_SECRET } = env(event)
  if (!DEVICE_SECRET) throw createError({ statusCode: 500, statusMessage: 'DEVICE_SECRET is missing (.dev.vars / wrangler secret)' })
  return DEVICE_SECRET
}

/** Missing binding is allowed in `nuxt dev` only, so a misconfigured deploy cannot silently drop the limit. */
export function likeLimiter(event: H3Event): RateLimiter {
  const { LIKE_LIMITER } = env(event)
  if (LIKE_LIMITER) return cfRateLimiter(LIKE_LIMITER)
  if (import.meta.dev) return { allow: async () => true }
  throw createError({ statusCode: 500, statusMessage: 'LIKE_LIMITER binding is missing' })
}
