import type { H3Event } from 'h3'
import { MenuService } from '../domain/menu-service.ts'
import { d1Db } from '../infra/d1-db.ts'
import { D1MenuReader } from '../infra/d1-menu-reader.ts'

// Composition root: the only place that knows about Cloudflare bindings.
export function menuService(event: H3Event): MenuService {
  const env = event.context.cloudflare?.env
  if (!env?.DB) throw createError({ statusCode: 500, statusMessage: 'D1 binding DB is missing' })
  return new MenuService(new D1MenuReader(d1Db(env.DB)))
}
