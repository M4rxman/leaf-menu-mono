import { menuPath } from '@chilly/shared/paths'

// /r/{slug} -> /r/{slug}/{lang}, language from Accept-Language (enabled languages only).
export default defineEventHandler(async (event) => {
  const result = await menuService(event).enter(getRouterParam(event, 'slug') ?? '', getRequestHeader(event, 'accept-language'))
  setResponseHeader(event, 'vary', 'accept-language')
  if (result.kind !== 'redirect') throw createError({ statusCode: 404, statusMessage: 'Menu not found' })
  return sendRedirect(event, menuPath(result.slug, result.lang), result.permanent ? 301 : 302)
})
