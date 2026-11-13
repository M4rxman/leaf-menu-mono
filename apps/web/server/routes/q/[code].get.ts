import { menuPath } from '@chilly/shared/paths'

// /q/{code} is printed on paper and never changes; the slug it points to can. 302, so the target may change.
export default defineEventHandler(async (event) => {
  const slug = await menuService(event).slugForQr(getRouterParam(event, 'code') ?? '')
  if (!slug) throw createError({ statusCode: 404, statusMessage: 'Menu not found' })
  return sendRedirect(event, menuPath(slug), 302)
})
