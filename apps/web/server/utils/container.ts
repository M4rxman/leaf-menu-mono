import type { H3Event } from 'h3'
import { MenuService } from '@chilly/shared/domain/menu-service'
import { d1Db } from '@chilly/shared/infra/d1-db'
import type { D1Like } from '@chilly/shared/infra/d1-db'
import { D1MenuReader } from '@chilly/shared/infra/d1-menu-reader'

// Composition root: the only place that knows about Cloudflare bindings.
export function menuService(event: H3Event): MenuService {
  const env = event.context.cloudflare?.env as { DB?: D1Like } | undefined
  if (!env?.DB) throw createError({ statusCode: 500, statusMessage: 'D1 binding DB is missing' })
  return new MenuService(new D1MenuReader(d1Db(env.DB)))
}
