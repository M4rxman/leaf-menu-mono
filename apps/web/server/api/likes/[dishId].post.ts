import { parseDishId } from '@chilly/shared/domain/guards'
import { canonicalLang } from '@chilly/shared/langs'
import { menuPath } from '@chilly/shared/paths'

// No-JS fallback: the ♡ form posts here and we always redirect back to the dish, errors included
// (a failed like, e.g. 429, must not show the guest a JSON page).
export default defineEventHandler(async (event) => {
  const form = await readBody<{ liked?: string, lang?: string }>(event)
  const { result, error } = await applyLike(event, form?.liked === '1')
  const dishId = parseDishId(getRouterParam(event, 'dishId'))
  const slug = result?.slug ?? (error && dishId ? await likeService(event).slugOf(dishId) : null)
  if (!slug) return sendRedirect(event, '/', 303) // unknown or hidden dish: nowhere to go back to
  const lang = canonicalLang(form?.lang ?? '') ?? undefined
  return sendRedirect(event, `${menuPath(slug, lang)}#dish-${dishId}`, 303)
})
